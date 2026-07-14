import {
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
  loadRecentAiMessagesForPrompt,
  loadUniverseContext,
  sendUniverseExpertRequest,
  serializeChat,
  serializeMessages,
  serializeSource,
} from "../_shared/universe-ai.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const authUser = await getAuthUser(req);
    const appUser = await getAppUser(authUser.id);
    const body = await req.json().catch(() => ({}));
    const universeId = cleanUniverseId(body.universeId);
    const message = cleanUserMessage(body.message);

    if (!universeId) {
      return jsonResponse({ error: "universeId is required." }, 400);
    }
    if (!message) {
      return jsonResponse({ error: "Message is required." }, 400);
    }

    const supabase = createAdminClient();
    const context = await loadUniverseContext(supabase, universeId, appUser.id);
    const source = await getOrCreateAiSource(supabase, universeId, appUser.id);
    const vectorStoreId = String(source.vector_store_id || "");

    if (source.sync_status !== "ready" || !vectorStoreId) {
      return jsonResponse({ error: "Universe AI knowledge needs to be synced before chatting." }, 409);
    }

    const chat = await getOrCreateAiChat(supabase, universeId, appUser.id);
    const chatId = String(chat.id);

    const { error: userInsertError } = await supabase
      .from("universe_ai_messages")
      .insert({
        chat_id: chatId,
        user_id: appUser.id,
        role: "user",
        content: message,
      });

    if (userInsertError) {
      throw userInsertError;
    }

    const promptMessages = await loadRecentAiMessagesForPrompt(supabase, chatId, appUser.id);
    const aiResult = await sendUniverseExpertRequest({
      universeName: context.universe.name,
      vectorStoreId,
      messages: promptMessages,
    });

    const { error: assistantInsertError } = await supabase
      .from("universe_ai_messages")
      .insert({
        chat_id: chatId,
        user_id: appUser.id,
        role: "assistant",
        content: aiResult.text,
        openai_response_id: String(aiResult.response.id || ""),
        citations: aiResult.citations,
      });

    if (assistantInsertError) {
      throw assistantInsertError;
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

    return jsonResponse({
      source: serializeSource(source),
      chat: serializeChat(updatedChat),
      messages: serializeMessages(messages),
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not send universe AI message."), 500);
  }
});
