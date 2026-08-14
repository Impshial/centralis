import {
  createImageKey,
  createCentralisStorageMetadata,
  createSignedImageUrl,
  describeError,
  getAuthUser,
  handleCors,
  insertImageRow,
  jsonResponse,
  uploadImageBytes,
} from "../_shared/image-storage.ts";

function createUploadImageMetadata(input: {
  storageModule: string;
  objectId: string;
  objectName?: string;
  objectKind?: string;
  elementType?: string;
}) {
  const name = String(input.objectName || input.elementType || input.objectKind || input.objectId).trim();
  if (input.storageModule === "stellar-architect" || input.storageModule.startsWith("stellar-architect/")) {
    return createCentralisStorageMetadata({
      module: "Stellar Architect",
      context: `Stellar Architect: ${name}`,
      note: "Uploaded image",
    });
  }
  if (input.storageModule === "roleplayer" || input.storageModule.startsWith("roleplayer/")) {
    return createCentralisStorageMetadata({
      module: "Roleplayer",
      context: `Roleplayer Character: ${name}`,
      note: "Uploaded image",
    });
  }
  if (input.storageModule === "god-engine" || input.storageModule.startsWith("god-engine/")) {
    return createCentralisStorageMetadata({
      module: "God Engine",
      context: `Species: ${name}`,
      note: "Uploaded image",
    });
  }
  if (input.storageModule === "listmaker" || input.storageModule.startsWith("listmaker/")) {
    return createCentralisStorageMetadata({
      module: "ListMaker",
      context: `ListMaker Item: ${name}`,
      note: "Uploaded image",
    });
  }

  const typeText = `${input.objectKind || ""} ${input.elementType || ""}`;
  const label = /universe/i.test(typeText) ? "Universe" : "Element";
  return createCentralisStorageMetadata({
    module: "Universe Builder",
    context: `${label}: ${name}`,
    note: "Uploaded image",
  });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    const user = await getAuthUser(req);
    const formData = await req.formData();
    const objectId = String(formData.get("objectId") || "").trim();
    const storageModule = String(formData.get("storageModule") || "universe-builder").trim();
    const objectName = String(formData.get("objectName") || "").trim();
    const objectKind = String(formData.get("objectKind") || "").trim();
    const elementType = String(formData.get("elementType") || "").trim();
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
    const imageId = crypto.randomUUID();
    const key = createImageKey(storageModule, imageId, extension);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const imageUrl = await uploadImageBytes({
      bytes,
      key,
      contentType: file.type || "application/octet-stream",
      metadata: createUploadImageMetadata({
        storageModule,
        objectId,
        objectName,
        objectKind,
        elementType,
      }),
    });
    const image = await insertImageRow({
      id: imageId,
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
