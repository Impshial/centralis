import {
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
  createAdminClient,
} from "../_shared/image-storage.ts";
import { getImageGenerationUser, requireImageGenerationSession, serializeImageGenerationAsset } from "../_shared/image-generation.ts";
import { getPublicVeniceImageModels } from "../_shared/venice-image-models.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const authUser = await getAuthUser(req);
    const appUser = await getImageGenerationUser(authUser.id);
    const sessionId = String((await req.json()).sessionId || "").trim();
    if (!sessionId) return jsonResponse({ error: "sessionId is required." }, 400);
    const session = await requireImageGenerationSession(sessionId, appUser.id);
    const supabase = createAdminClient();
    const [messagesResult, assetsResult] = await Promise.all([
      supabase.from("image_generation_messages").select("*").eq("session_id", sessionId).eq("user_id", appUser.id).eq("deleted", false).order("created_at"),
      supabase.from("image_generation_assets").select("*").eq("session_id", sessionId).eq("user_id", appUser.id).eq("deleted", false).order("created_at").order("sort_order"),
    ]);
    if (messagesResult.error) throw messagesResult.error;
    if (assetsResult.error) throw assetsResult.error;
    const assets = await Promise.all((assetsResult.data || []).map((asset) => serializeImageGenerationAsset(asset)));
    return jsonResponse({ session, messages: messagesResult.data || [], assets, modelCatalog: getPublicVeniceImageModels() });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not load this image generation session."), 500);
  }
});
