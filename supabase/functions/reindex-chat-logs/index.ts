import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import {
  extractChatLogSearchText,
  getAppUser,
  readChatLogObject,
} from "../_shared/chat-storage.ts";

const MAX_REINDEX_PER_REQUEST = 25;

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
    const supabase = createAdminClient();

    const { data: chatLogs, error } = await supabase
      .from("chat_logs")
      .select("id,storage_key")
      .eq("user_id", appUser.id)
      .eq("deleted", false)
      .is("search_indexed_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_REINDEX_PER_REQUEST);

    if (error) {
      throw error;
    }

    let indexed = 0;
    for (const chatLog of chatLogs || []) {
      const bytes = await readChatLogObject(chatLog.storage_key);
      const html = new TextDecoder().decode(bytes);
      const { error: updateError } = await supabase
        .from("chat_logs")
        .update({
          search_text: extractChatLogSearchText(html),
          search_indexed_at: new Date().toISOString(),
        })
        .eq("id", chatLog.id)
        .eq("user_id", appUser.id)
        .eq("deleted", false);

      if (updateError) {
        throw updateError;
      }
      indexed += 1;
    }

    return jsonResponse({
      indexed,
      hasMore: indexed === MAX_REINDEX_PER_REQUEST,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not update chat log search index."), 500);
  }
});
