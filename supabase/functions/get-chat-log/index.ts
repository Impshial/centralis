import {
  corsHeaders,
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import {
  getAppUser,
  readChatLogObject,
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

    if (!chatLogId) {
      return jsonResponse({ error: "chatLogId is required." }, 400);
    }

    const { data: chatLog, error } = await createAdminClient()
      .from("chat_logs")
      .select("id,title,storage_key,mime_type")
      .eq("id", chatLogId)
      .eq("user_id", appUser.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!chatLog) {
      return jsonResponse({ error: "Chat log not found." }, 404);
    }

    const bytes = await readChatLogObject(chatLog.storage_key);
    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${chatLog.id}.html"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not load chat log."), 500);
  }
});
