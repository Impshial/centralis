import {
  createAdminClient,
  createSignedStorageUrl,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import { getImageGenerationUser, IMAGE_GENERATION_BUCKET } from "../_shared/image-generation.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const authUser = await getAuthUser(req);
    const appUser = await getImageGenerationUser(authUser.id);
    const body = await req.json();
    const assetId = String(body.assetId || "").trim();
    if (!assetId) return jsonResponse({ error: "assetId is required." }, 400);
    const { data, error } = await createAdminClient().from("image_generation_assets").select("storage_key,original_filename").eq("id", assetId).eq("user_id", appUser.id).maybeSingle();
    if (error || !data) throw error || new Error("Image generation asset was not found.");
    return jsonResponse({ url: await createSignedStorageUrl({ bucket: IMAGE_GENERATION_BUCKET(), key: data.storage_key, download: Boolean(body.download) }), filename: data.original_filename });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not retrieve this generated image."), 500);
  }
});
