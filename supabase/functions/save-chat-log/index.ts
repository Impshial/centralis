import {
  createAdminClient,
  createCentralisStorageMetadata,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import {
  extractChatLogSearchText,
  getAppUser,
  MAX_CHAT_LOG_BYTES,
  uploadChatLogObject,
} from "../_shared/chat-storage.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const authUser = await getAuthUser(req);
    const appUser = await getAppUser(authUser.id);
    const body = await req.json();
    const chatLogId = String(body.chatLogId || "").trim();
    const title = String(body.title || "").trim();
    const summary = String(body.summary || "").trim();
    const html = String(body.html || "");

    if (!chatLogId) {
      return jsonResponse({ error: "chatLogId is required." }, 400);
    }
    if (!title || title.length > 200) {
      return jsonResponse({ error: "Title is required and must be 200 characters or fewer." }, 400);
    }
    if (!summary || summary.length > 2000) {
      return jsonResponse({ error: "Summary is required and must be 2,000 characters or fewer." }, 400);
    }
    if (!html.trim()) {
      return jsonResponse({ error: "HTML source cannot be empty." }, 400);
    }

    const bytes = new TextEncoder().encode(html);
    if (bytes.byteLength <= 0 || bytes.byteLength > MAX_CHAT_LOG_BYTES) {
      return jsonResponse({ error: "The HTML source must be between 1 byte and 10 MB." }, 400);
    }

    const supabase = createAdminClient();
    const { data: chatLog, error: lookupError } = await supabase
      .from("chat_logs")
      .select("id,storage_key")
      .eq("id", chatLogId)
      .eq("user_id", appUser.id)
      .eq("deleted", false)
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }
    if (!chatLog) {
      return jsonResponse({ error: "Chat log not found." }, 404);
    }

    await uploadChatLogObject({
      bytes,
      key: chatLog.storage_key,
      metadata: createCentralisStorageMetadata({
        module: "Chat Repository",
        context: `Chat Repository: ${title}`,
        note: "HTML chat log",
      }),
    });

    const { data, error: updateError } = await supabase
      .from("chat_logs")
      .update({
        title,
        summary,
        mime_type: "text/html",
        file_size: bytes.byteLength,
        search_text: extractChatLogSearchText(html),
        search_indexed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", chatLogId)
      .eq("user_id", appUser.id)
      .eq("deleted", false)
      .select("id,user_id,title,summary,original_filename,mime_type,file_size,created_at,updated_at,search_indexed_at")
      .single();

    if (updateError) {
      throw updateError;
    }

    return jsonResponse({ chatLog: data });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not save chat log."), 500);
  }
});
