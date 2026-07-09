import OpenAI from "npm:openai@^6.1.0";
import { getImageBase64, IMAGE_MODEL, IMAGE_QUALITY, IMAGE_SIZE } from "../_shared/openai-config.ts";
import {
  createImageKey,
  createSignedImageUrl,
  getAuthUser,
  getEnv,
  handleCors,
  insertImageRow,
  jsonResponse,
  describeError,
  uploadImageBytes,
} from "../_shared/image-storage.ts";

function createPrompt(input: {
  objectKind?: string;
  elementType?: string;
  name?: string;
  description?: string;
  extraPrompt?: string;
  promptOverride?: string;
}) {
  const promptOverride = String(input.promptOverride || "").trim();
  if (promptOverride) {
    return promptOverride;
  }

  const parts = [
    "Create a polished concept art image for a Centralis creative repository item.",
    `Subject kind: ${input.objectKind || "object"}.`,
    input.elementType ? `Element type: ${input.elementType}.` : "",
    input.name ? `Name: ${input.name}.` : "",
    input.description ? `Description: ${input.description}.` : "",
    input.extraPrompt ? `Additional direction: ${input.extraPrompt}.` : "",
    "Use a cinematic, richly detailed style. Do not include text, labels, logos, UI, or watermarks.",
  ];

  return parts.filter(Boolean).join("\n");
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    const user = await getAuthUser(req);
    const body = await req.json();
    const objectId = String(body.objectId || "").trim();
    if (!objectId) {
      return jsonResponse({ error: "objectId is required." }, 400);
    }

    const prompt = createPrompt(body);
    const client = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const result = await client.images.generate({
      model: IMAGE_MODEL,
      prompt,
      n: 1,
      size: IMAGE_SIZE,
      quality: IMAGE_QUALITY,
      user: user.id,
    });
    const imageBase64 = getImageBase64(result);
    const generated = result.data?.[0];
    if (!imageBase64) {
      return jsonResponse({ error: "OpenAI did not return image data." }, 502);
    }

    const revisedPrompt = generated?.revised_prompt || null;
    const key = createImageKey(user.id, objectId, "png");
    const imageUrl = await uploadImageBytes({
      bytes: base64ToBytes(imageBase64),
      key,
      contentType: "image/png",
    });
    const image = await insertImageRow({
      objectId,
      imageUrl,
      provider: `openai:${IMAGE_MODEL}`,
      prompt: revisedPrompt || prompt,
      generationSettings: {
        model: IMAGE_MODEL,
        size: IMAGE_SIZE,
        quality: IMAGE_QUALITY,
        revised_prompt: revisedPrompt,
      },
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
    return jsonResponse(describeError(error, "Could not generate image."), 500);
  }
});
