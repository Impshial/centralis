import {
  corsHeaders,
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import {
  cleanUniverseId,
  cleanUserMessage,
  getAppUser,
  getOrCreateAiChat,
  getOrCreateAiSource,
  loadAiMessages,
  loadAiProposals,
  loadRecentAiMessagesForPrompt,
  loadUserUniverseAiSettings,
  loadUniverseContext,
  sendUniverseElementProposalRequest,
  serializeChat,
  serializeMessages,
  serializeSource,
  shouldConsiderElementProposal,
  streamUniverseExpertRequest,
} from "../_shared/universe-ai.ts";

function sseHeaders() {
  return {
    ...corsHeaders,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
  };
}

function encodeSse(event: string, data: unknown) {
  const payload = JSON.stringify(data ?? {});
  return `event: ${event}\ndata: ${payload}\n\n`;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const send = async (event: string, data: unknown) => {
    await writer.write(encoder.encode(encodeSse(event, data)));
  };

  (async () => {
    try {
      const authUser = await getAuthUser(req);
      const appUser = await getAppUser(authUser.id);
      const body = await req.json().catch(() => ({}));
      const universeId = cleanUniverseId(body.universeId);
      const message = cleanUserMessage(body.message);

      if (!universeId) {
        throw new Error("universeId is required.");
      }
      if (!message) {
        throw new Error("Message is required.");
      }

      const supabase = createAdminClient();
      const settings = await loadUserUniverseAiSettings(supabase, appUser.id);
      const context = await loadUniverseContext(supabase, universeId, appUser.id);
      const source = await getOrCreateAiSource(supabase, universeId, appUser.id);
      const vectorStoreId = String(source.vector_store_id || "");

      if (source.sync_status !== "ready" || !vectorStoreId) {
        throw new Error("Universe AI knowledge needs to be synced before chatting.");
      }

      const chat = await getOrCreateAiChat(supabase, universeId, appUser.id);
      const chatId = String(chat.id);

      const { data: userMessage, error: userInsertError } = await supabase
        .from("universe_ai_messages")
        .insert({
          chat_id: chatId,
          user_id: appUser.id,
          role: "user",
          content: message,
        })
        .select("id,role,content,citations,created_at")
        .single();

      if (userInsertError || !userMessage) {
        throw userInsertError || new Error("Could not store the user message.");
      }

      await send("user_message", {
        source: serializeSource(source),
        chat: serializeChat(chat),
        message: serializeMessages([userMessage], [])[0],
      });

      const promptMessages = await loadRecentAiMessagesForPrompt(supabase, chatId, appUser.id);
      const aiResult = await streamUniverseExpertRequest({
        universeName: context.universe.name,
        vectorStoreId,
        messages: promptMessages,
        settings,
        signal: req.signal,
        onDelta: async (delta) => {
          await send("delta", { text: delta });
        },
      });

      const { data: assistantMessage, error: assistantInsertError } = await supabase
        .from("universe_ai_messages")
        .insert({
          chat_id: chatId,
          user_id: appUser.id,
          role: "assistant",
          content: aiResult.text,
          openai_response_id: String(aiResult.response.id || ""),
          citations: aiResult.citations,
        })
        .select("id,role,content,citations,created_at")
        .single();

      if (assistantInsertError || !assistantMessage) {
        throw assistantInsertError || new Error("Could not store the assistant message.");
      }

      await send("assistant_message", {
        message: serializeMessages([assistantMessage], [])[0],
      });

      if (shouldConsiderElementProposal(message)) {
        try {
          const proposalPayload = await sendUniverseElementProposalRequest({
            context,
            vectorStoreId,
            latestUserMessage: message,
            assistantReply: aiResult.text,
            settings,
          });

          if (proposalPayload?.elements?.length) {
            const { error: proposalInsertError } = await supabase
              .from("universe_ai_proposals")
              .insert({
                universe_id: universeId,
                chat_id: chatId,
                user_id: appUser.id,
                source_user_message_id: userMessage.id,
                assistant_message_id: assistantMessage.id,
                proposal_type: "create_elements",
                payload: proposalPayload,
                status: "pending",
              });

            if (proposalInsertError) {
              throw proposalInsertError;
            }
          }
        } catch (proposalError) {
          console.error("Could not create AI element proposal:", proposalError);
        }
      }

      const { data: updatedChat, error: chatUpdateError } = await supabase
        .from("universe_ai_chats")
        .update({
          last_response_id: String(aiResult.response.id || ""),
          updated_at: new Date().toISOString(),
        })
        .eq("id", chatId)
        .eq("user_id", appUser.id)
        .select("*")
        .single();

      if (chatUpdateError || !updatedChat) {
        throw chatUpdateError || new Error("Could not update AI chat.");
      }

      const messages = await loadAiMessages(supabase, chatId, appUser.id);
      const proposals = await loadAiProposals(supabase, chatId, appUser.id);
      const serializedMessages = serializeMessages(messages, proposals);

      await send("proposals", {
        messages: serializedMessages,
      });
      await send("chat", {
        chat: serializeChat(updatedChat),
      });
      await send("done", {
        source: serializeSource(source),
        chat: serializeChat(updatedChat),
        messages: serializedMessages,
      });
    } catch (error) {
      if (req.signal.aborted) {
        return;
      }
      console.error(error);
      await send("error", describeError(error, "Could not stream universe AI message."));
    } finally {
      try {
        await writer.close();
      } catch (_error) {
        // The browser may have already aborted the stream.
      }
    }
  })();

  return new Response(stream.readable, {
    headers: sseHeaders(),
  });
});
