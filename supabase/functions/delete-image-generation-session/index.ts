import {
  createAdminClient,
  deleteStorageObject,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import { getImageGenerationUser, IMAGE_GENERATION_BUCKET, requireImageGenerationSession } from "../_shared/image-generation.ts";

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
    const { data: assets, error: assetsError } = await supabase.from("image_generation_assets").select("storage_key").eq("session_id", sessionId).eq("user_id", appUser.id);
    if (assetsError) throw assetsError;
    for (const asset of assets || []) {
      try { await deleteStorageObject(IMAGE_GENERATION_BUCKET(), asset.storage_key); } catch (error) { console.warn("Could not delete image generation object", asset.storage_key, error); }
    }
    const { error } = await supabase.from("image_generation_sessions").delete().eq("id", sessionId).eq("user_id", appUser.id);
    if (error) throw error;
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not delete this image generation session."), 500);
  }
});
