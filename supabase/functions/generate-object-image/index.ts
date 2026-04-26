import OpenAI from "npm:openai@^6.1.0";
import {
  createImageKey,
  getAuthUser,
  getEnv,
  handleCors,
  insertImageRow,
  jsonResponse,
  uploadImageBytes,
} from "../_shared/image-storage.ts";

function createPrompt(input: {
  objectKind?: string;
  elementType?: string;
  name?: string;
  description?: string;
  extraPrompt?: string;
}) {
  const parts = [
    "Create a polished concept art image for the Centralis universe builder.",
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
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "b64_json",
      user: user.id,
    });
    const generated = result.data?.[0];
    if (!generated?.b64_json) {
      return jsonResponse({ error: "OpenAI did not return image data." }, 502);
    }

    const key = createImageKey(user.id, objectId, "png");
    const imageUrl = await uploadImageBytes({
      bytes: base64ToBytes(generated.b64_json),
      key,
      contentType: "image/png",
    });
    const image = await insertImageRow({
      objectId,
      imageUrl,
      provider: "openai:dall-e-3",
      prompt: generated.revised_prompt || prompt,
      generationSettings: {
        model: "dall-e-3",
        size: "1024x1024",
        quality: "standard",
        revised_prompt: generated.revised_prompt || null,
      },
      userId: user.id,
    });

    return jsonResponse({ image });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not generate image." }, 500);
  }
});
