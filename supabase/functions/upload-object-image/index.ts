import {
  createImageKey,
  createSignedImageUrl,
  describeError,
  getAuthUser,
  handleCors,
  insertImageRow,
  jsonResponse,
  uploadImageBytes,
} from "../_shared/image-storage.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    const user = await getAuthUser(req);
    const formData = await req.formData();
    const objectId = String(formData.get("objectId") || "").trim();
    const file = formData.get("file");

    if (!objectId) {
      return jsonResponse({ error: "objectId is required." }, 400);
    }
    if (!(file instanceof File)) {
      return jsonResponse({ error: "Image file is required." }, 400);
    }
    if (!file.type.startsWith("image/")) {
      return jsonResponse({ error: "Only image files can be uploaded." }, 400);
    }

    const extension = file.name.split(".").pop() || file.type.split("/").pop() || "png";
    const key = createImageKey(user.id, objectId, extension);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const imageUrl = await uploadImageBytes({
      bytes,
      key,
      contentType: file.type || "application/octet-stream",
    });
    const image = await insertImageRow({
      objectId,
      imageUrl,
      provider: "upload",
      userId: user.id,
    });

    return jsonResponse({
      image: {
        ...image,
        stored_image_url: image.image_url,
        image_url: await createSignedImageUrl(image.image_url),
      },
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not upload image."), 500);
  }
});
