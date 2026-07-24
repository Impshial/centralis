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
    const errorMessage = String(body.errorMessage || "Generation cancelled by user.").trim() || "Generation cancelled by user.";
    const errorDetails = body.errorDetails && typeof body.errorDetails === "object"
      ? body.errorDetails
      : { cancelled: true, message: errorMessage };

    const supabase = createAdminClient();
    const { data: cancelled, error } = await supabase
      .from("image_generation_messages")
      .update({
        status: "failed",
        error_message: errorMessage,
      })
      .eq("session_id", sessionId)
      .eq("user_id", appUser.id)
      .eq("role", "user")
      .eq("status", "pending")
      .select("id");
    if (error) throw error;
    // Error details are useful, but an older database that has not yet applied the
    // optional error_details migration must not prevent a user from stopping work.
    const cancelledIds = (cancelled || []).map((message) => message.id);
    if (cancelledIds.length) {
      await supabase
        .from("image_generation_messages")
        .update({ error_details: errorDetails })
        .in("id", cancelledIds);
      await supabase
        .from("generation_jobs")
        .update({
          status: "cancelled",
          progress_label: "Cancelled",
          error_message: errorMessage,
          error_details: errorDetails,
          completed_at: new Date().toISOString(),
        })
        .in("source_message_id", cancelledIds)
        .eq("user_id", appUser.id)
        .in("status", ["queued", "running"]);
    }
    return jsonResponse({ ok: true, cancelledMessageIds: cancelledIds });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not cancel this image generation."), 500);
  }
});
