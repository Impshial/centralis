import { zipSync, strToU8 } from "npm:fflate@0.8.2";
import {
  createAdminClient,
  createSignedStorageUrl,
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
    const assetIds = Array.isArray(body.assetIds) ? body.assetIds.map(String).filter(Boolean) : [];
    let query = createAdminClient().from("image_generation_assets").select("id,storage_key,original_filename").eq("session_id", sessionId).eq("user_id", appUser.id).eq("asset_kind", "output").order("created_at").order("sort_order");
    if (assetIds.length) query = query.in("id", assetIds);
    const { data: assets, error } = await query;
    if (error) throw error;
    if (!assets?.length) return jsonResponse({ error: "There are no generated images to download." }, 404);
    const bucket = IMAGE_GENERATION_BUCKET();
    const files: Record<string, Uint8Array> = {};
    for (const asset of assets) {
      const url = await createSignedStorageUrl({ bucket, key: asset.storage_key, expiresIn: 900 });
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not read ${asset.original_filename}.`);
      files[asset.original_filename] = new Uint8Array(await response.arrayBuffer());
    }
    files["README.txt"] = strToU8("Generated with Centralis Image Generation.\n");
    const zip = zipSync(files, { level: 6 });
    return new Response(zip, { headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="centralis-image-generation-${sessionId}.zip"`,
    }});
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not create the image download."), 500);
  }
});
