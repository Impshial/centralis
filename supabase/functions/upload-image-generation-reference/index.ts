import {
  createAdminClient,
  createImageGenerationKey,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
  uploadImageBytes,
} from "../_shared/image-storage.ts";
import {
  extensionFromContentType,
  getImageGenerationUser,
  MAX_UPLOAD_BYTES,
  requireImageGenerationSession,
  SUPPORTED_IMAGE_TYPES,
  serializeImageGenerationAsset,
} from "../_shared/image-generation.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const authUser = await getAuthUser(req);
    const appUser = await getImageGenerationUser(authUser.id);
    const form = await req.formData();
    const sessionId = String(form.get("sessionId") || "").trim();
    if (!sessionId) return jsonResponse({ error: "sessionId is required." }, 400);
    await requireImageGenerationSession(sessionId, appUser.id);
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    if (!files.length) return jsonResponse({ error: "Choose at least one image to upload." }, 400);
    if (files.length > 16) return jsonResponse({ error: "You can upload at most 16 reference images at once." }, 400);
    const supabase = createAdminClient();
    const assets = [];
    for (const file of files) {
      if (!SUPPORTED_IMAGE_TYPES.has(file.type)) throw new Error(`${file.name || "This file"} must be PNG, JPEG, or WebP.`);
      if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name || "This file"} must be smaller than 50 MB.`);
      const id = crypto.randomUUID();
      const key = createImageGenerationKey("uploaded", id, extensionFromContentType(file.type));
      await uploadImageBytes({ bytes: new Uint8Array(await file.arrayBuffer()), key, contentType: file.type });
      const { data, error } = await supabase.from("image_generation_assets").insert({
        id, session_id: sessionId, user_id: appUser.id, asset_kind: "uploaded", storage_key: key,
        original_filename: file.name || `${id}.${extensionFromContentType(file.type)}`,
        content_type: file.type, byte_size: file.size,
      }).select("*").single();
      if (error || !data) throw error || new Error("Could not save uploaded reference metadata.");
      assets.push(await serializeImageGenerationAsset(data));
    }
    return jsonResponse({ assets });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not upload the reference image."), 500);
  }
});
