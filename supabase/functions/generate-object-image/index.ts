import OpenAI from "npm:openai@^6.1.0";
import { getImageBase64, IMAGE_MODEL, IMAGE_QUALITY, IMAGE_SIZE } from "../_shared/openai-config.ts";
import {
  createAdminClient,
  createImageKey,
  createCentralisStorageMetadata,
  createSignedImageUrl,
  getAuthUser,
  getEnv,
  handleCors,
  insertImageRow,
  jsonResponse,
  describeError,
  uploadImageBytes,
} from "../_shared/image-storage.ts";
import { getImageGenerationUser } from "../_shared/image-generation.ts";
import { createGenerationJob, updateGenerationJob } from "../_shared/generation-jobs.ts";

const GPT_IMAGE_2_PROMPT_SUFFIX = "Reduce amount of noise in image.";

function createObjectImageMetadata(input: {
  storageModule: string;
  objectId: string;
  objectKind?: string;
  elementType?: string;
  name?: string;
}) {
  const name = String(input.name || input.elementType || input.objectKind || input.objectId).trim();
  if (input.storageModule === "stellar-architect") {
    return createCentralisStorageMetadata({
      module: "Stellar Architect",
      context: `Stellar Architect: ${name}`,
      note: "Generated image",
    });
  }

  const typeText = `${input.objectKind || ""} ${input.elementType || ""}`;
  const label = /universe/i.test(typeText) ? "Universe" : "Element";
  return createCentralisStorageMetadata({
    module: "Universe Builder",
    context: `${label}: ${name}`,
    note: "Generated image",
  });
}

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

function withGptImage2PromptInstructions(prompt: string) {
  const normalized = String(prompt || "").trim();
  return /\breduce amount of noise in image\.?$/i.test(normalized)
    ? normalized
    : `${normalized}\n\n${GPT_IMAGE_2_PROMPT_SUFFIX}`;
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

  let jobId = "";
  try {
    const user = await getAuthUser(req);
    const appUser = await getImageGenerationUser(user.id);
    const body = await req.json();
    const objectId = String(body.objectId || "").trim();
    const storageModule = String(body.storageModule || "universe-builder").trim();
    if (!objectId) {
      return jsonResponse({ error: "objectId is required." }, 400);
    }

    const prompt = createPrompt(body);
    const jobModule = storageModule === "stellar-architect" ? "stellar_architect" : "universe_builder";
    const job = await createGenerationJob({
      userId: appUser.id,
      module: jobModule,
      sourceType: String(body.objectKind || body.elementType || "object").toLowerCase().replace(/[^a-z0-9_-]+/g, "_"),
      sourceId: objectId,
      sourceLabel: String(body.name || body.sourceLabel || body.elementType || body.objectKind || "Untitled item"),
      prompt,
      model: IMAGE_MODEL,
      parameters: {
        model: IMAGE_MODEL,
        size: IMAGE_SIZE,
        quality: IMAGE_QUALITY,
        storageModule,
        objectKind: body.objectKind || null,
        elementType: body.elementType || null,
      },
      progressLabel: "Queued",
    });
    jobId = job.id;
    await updateGenerationJob(job.id, { status: "running", progressLabel: "Generating image" });
    const client = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const result = await client.images.generate({
      model: IMAGE_MODEL,
      prompt: withGptImage2PromptInstructions(prompt),
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
    const imageId = crypto.randomUUID();
    const key = createImageKey(storageModule, imageId, "png");
    const { data: currentJob, error: currentJobError } = await createAdminClient()
      .from("generation_jobs")
      .select("status")
      .eq("id", jobId)
      .maybeSingle();
    if (currentJobError) throw currentJobError;
    if (currentJob?.status === "cancelled") {
      return jsonResponse({ error: "This image generation was cancelled." }, 409);
    }
    const imageUrl = await uploadImageBytes({
      bytes: base64ToBytes(imageBase64),
      key,
      contentType: "image/png",
      metadata: createObjectImageMetadata({
        storageModule,
        objectId,
        objectKind: body.objectKind,
        elementType: body.elementType,
        name: body.name,
      }),
    });
    const image = await insertImageRow({
      id: imageId,
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
    await updateGenerationJob(job.id, {
      status: "completed",
      progressLabel: "Completed",
      resultImageId: image.id,
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
    if (jobId) {
      await updateGenerationJob(jobId, {
        status: "failed",
        progressLabel: "Failed",
        errorMessage: error instanceof Error ? error.message : "Could not generate image.",
        errorDetails: describeError(error, "Could not generate image.") as Record<string, unknown>,
      }).catch((jobError) => console.error(jobError));
    }
    return jsonResponse(describeError(error, "Could not generate image."), 500);
  }
});
