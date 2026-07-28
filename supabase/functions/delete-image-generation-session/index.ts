import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import { getImageGenerationUser, requireImageGenerationSession } from "../_shared/image-generation.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const authUser = await getAuthUser(req);
    const appUser = await getImageGenerationUser(authUser.id);
    const body = await req.json();
    const sessionId = String(body.sessionId || "").trim();
    if (!sessionId) return jsonResponse({ error: "sessionId is required." }, 400);
    await requireImageGenerationSession(sessionId, appUser.id);
    const supabase = createAdminClient();
    const deletedAt = new Date().toISOString();
    const deletePayload = { deleted: true, deleted_at: deletedAt, deleted_by: appUser.id };
    const { error: assetsError } = await supabase
      .from("image_generation_assets")
      .update(deletePayload)
      .eq("session_id", sessionId)
      .eq("user_id", appUser.id)
      .eq("deleted", false);
    if (assetsError) throw assetsError;

    const { error: messagesError } = await supabase
      .from("image_generation_messages")
      .update(deletePayload)
      .eq("session_id", sessionId)
      .eq("user_id", appUser.id)
      .eq("deleted", false);
    if (messagesError) throw messagesError;

    const { error } = await supabase
      .from("image_generation_sessions")
      .update(deletePayload)
      .eq("id", sessionId)
      .eq("user_id", appUser.id)
      .eq("deleted", false);
    if (error) throw error;
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not delete this image generation session."), 500);
  }
});
