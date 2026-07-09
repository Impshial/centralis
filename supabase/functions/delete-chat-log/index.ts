import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import {
  getAppUser,
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

    const { data, error } = await createAdminClient()
      .from("chat_logs")
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", chatLogId)
      .eq("user_id", appUser.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return jsonResponse({ error: "Chat log not found." }, 404);
    }

    return jsonResponse({ deleted: true, chatLogId });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not delete chat log."), 500);
  }
});
