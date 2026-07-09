import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import {
  createChatLogKey,
  deleteChatLogObject,
  extractChatLogSearchText,
  getAppUser,
  MAX_CHAT_LOG_BYTES,
  uploadChatLogObject,
} from "../_shared/chat-storage.ts";

function isHtmlFilename(filename: string) {
  return /\.html?$/i.test(filename);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let uploadedKey = "";

  try {
    const authUser = await getAuthUser(req);
    const appUser = await getAppUser(authUser.id);
    const formData = await req.formData();
    const title = String(formData.get("title") || "").trim();
    const summary = String(formData.get("summary") || "").trim();
    const file = formData.get("file");

    if (!title || title.length > 200) {
      return jsonResponse({ error: "Title is required and must be 200 characters or fewer." }, 400);
    }
    if (!summary || summary.length > 2000) {
      return jsonResponse({ error: "Summary is required and must be 2,000 characters or fewer." }, 400);
    }
    if (!(file instanceof File)) {
      return jsonResponse({ error: "An HTML file is required." }, 400);
    }
    if (!isHtmlFilename(file.name)) {
      return jsonResponse({ error: "Only .html or .htm files are supported." }, 400);
    }
    if (file.size <= 0 || file.size > MAX_CHAT_LOG_BYTES) {
      return jsonResponse({ error: "The HTML file must be between 1 byte and 10 MB." }, 400);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    if (!text.trim()) {
      return jsonResponse({ error: "The HTML file cannot be empty." }, 400);
    }

    const chatLogId = crypto.randomUUID();
    uploadedKey = createChatLogKey(authUser.id, chatLogId);
    await uploadChatLogObject({ bytes, key: uploadedKey });

    const { data, error } = await createAdminClient()
      .from("chat_logs")
      .insert({
        id: chatLogId,
        user_id: appUser.id,
        title,
        summary,
        storage_key: uploadedKey,
        original_filename: file.name,
        mime_type: "text/html",
        file_size: file.size,
        search_text: extractChatLogSearchText(text),
        search_indexed_at: new Date().toISOString(),
      })
      .select("id,user_id,title,summary,original_filename,mime_type,file_size,created_at,updated_at,search_indexed_at")
      .single();

    if (error) {
      throw error;
    }

    return jsonResponse({ chatLog: data });
  } catch (error) {
    if (uploadedKey) {
      try {
        await deleteChatLogObject(uploadedKey);
      } catch (cleanupError) {
        console.error("Could not roll back uploaded chat log:", cleanupError);
      }
    }

    console.error(error);
    return jsonResponse(describeError(error, "Could not upload chat log."), 500);
  }
});
