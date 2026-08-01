import OpenAI from "npm:openai@^6.1.0";
import { getImageBase64 } from "../_shared/openai-config.ts";
import {
  createAdminClient,
  createCentralisStorageMetadata,
  createImageKey,
  createSignedImageUrl,
  describeError,
  getAuthUser,
  getEnv,
  handleCors,
  insertImageRow,
  jsonResponse,
  uploadImageBytes,
} from "../_shared/image-storage.ts";
import { getImageGenerationUser } from "../_shared/image-generation.ts";
import { createGenerationJob, updateGenerationJob } from "../_shared/generation-jobs.ts";

const IMAGE_MODEL = "gpt-image-2";
const STANDARD_SIZE = "1536x1024";
const STANDARD_QUALITY = "low";
const STANDARD_FORMAT = "jpeg";
const DEFAULT_HIGH_SIZE = "2560x1440";
const HIGH_QUALITY = "high";
const HIGH_SIZE_OPTIONS = new Set(["2560x1440", "3840x2160"]);

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function compactJson(value: unknown, maxLength: number) {
  const record = asRecord(value);
  if (!Object.keys(record).length) return "";
  return JSON.stringify(record).replace(/\s+/g, " ").slice(0, maxLength);
}

function compactList(value: unknown, limit = 5) {
  return (Array.isArray(value) ? value : [])
    .map((item) => typeof item === "string" ? item : JSON.stringify(item))
    .map((item) => cleanText(item, 180))
    .filter(Boolean)
    .slice(0, limit)
    .join("; ");
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function buildPrompt(body: Record<string, unknown>) {
  const promptOverride = cleanText(body.promptOverride, 4000);
  const specialInstructions = cleanText(body.specialInstructions, 1200);
  const name = cleanText(body.name, 180) || "Unnamed species";
  const scientificName = cleanText(body.scientificName, 180);
  const classification = cleanText(body.classification, 240);
  const category = cleanText(body.category, 180);
  const habitat = cleanText(body.habitat, 500);
  const overview = cleanText(body.overview, 1200);
  const newTraits = compactList(body.newlyEvolvedTraits, 4);
  const inheritedTraits = compactList(body.inheritedTraits, 6);
  const lostTraits = compactList(body.lostTraits, 4);
  const completeTraits = compactJson(body.completeTraits, 1600);
  const completeTraitRecord = asRecord(body.completeTraits);
  const physicalDescription = cleanText(completeTraitRecord.physical_description || completeTraitRecord.physicalDescription, 1400);
  const ecology = compactJson(body.ecology, 900);
  const populationCondition = compactJson(body.populationCondition, 700);
  const visualGenome = compactJson(body.visualGenome, 2200);
  const parentSpecies = asRecord(body.parentSpecies);
  const parentName = cleanText(parentSpecies.name, 180);
  const parentScientificName = cleanText(parentSpecies.scientificName, 180);
  const parentHabitat = cleanText(parentSpecies.habitat, 400);
  const parentOverview = cleanText(parentSpecies.overview, 800);
  const parentTraits = compactJson(parentSpecies.completeTraits, 1300);
  const parentTraitRecord = asRecord(parentSpecies.completeTraits);
  const parentPhysicalDescription = cleanText(parentTraitRecord.physical_description || parentTraitRecord.physicalDescription, 1000);
  const parentNewTraits = compactList(parentSpecies.newlyEvolvedTraits, 4);
  const parentVisualGenome = compactJson(parentSpecies.visualGenome, 1800);
  const parentImagePrompt = cleanText(parentSpecies.imagePrompt, 1000);
  const subjectPrompt = [
    `Species: ${name}.`,
    scientificName ? `Scientific name: ${scientificName}.` : "",
    classification ? `Classification: ${classification}.` : "",
    category ? `Category: ${category}.` : "",
    habitat ? `Habitat: ${habitat}.` : "",
    overview ? `Ecological overview: ${overview}.` : "",
    newTraits ? `Newly evolved traits to emphasize: ${newTraits}.` : "",
    physicalDescription ? `Current full physical description to depict: ${physicalDescription}.` : "",
    inheritedTraits ? `Inherited visible traits to preserve: ${inheritedTraits}.` : "",
    lostTraits ? `Traits reduced or absent compared with ancestors: ${lostTraits}.` : "",
    completeTraits ? `Current complete trait record for visual grounding: ${completeTraits}.` : "",
    ecology ? `Ecology and behavior context: ${ecology}.` : "",
    populationCondition ? `Population/body-condition context: ${populationCondition}.` : "",
    visualGenome ? `Persistent inherited visual genome: ${visualGenome}.` : "",
  ].filter(Boolean).join("\n");
  let parentPrompt = "";
  if (parentName || parentVisualGenome || parentTraits || parentImagePrompt) {
    const parentScientificLabel = parentScientificName ? ` (${parentScientificName})` : "";
    parentPrompt = [
      `Immediate parent species: ${parentName || "unnamed parent"}${parentScientificLabel}.`,
      parentHabitat ? `Parent habitat: ${parentHabitat}.` : "",
      parentOverview ? `Parent overview: ${parentOverview}.` : "",
      parentNewTraits ? `Parent recently evolved visible traits: ${parentNewTraits}.` : "",
      parentPhysicalDescription ? `Parent full physical description to inherit from: ${parentPhysicalDescription}.` : "",
      parentTraits ? `Parent trait record to inherit from or modify: ${parentTraits}.` : "",
      parentVisualGenome ? `Parent visual genome to preserve as family resemblance: ${parentVisualGenome}.` : "",
      parentImagePrompt ? `Parent image prompt style/subject continuity: ${parentImagePrompt}.` : "",
    ].filter(Boolean).join("\n");
  }
  const imageBrief = promptOverride
    ? [`Species image brief from evolution engine: ${promptOverride}.`, subjectPrompt, parentPrompt].filter(Boolean).join("\n")
    : [subjectPrompt, parentPrompt].filter(Boolean).join("\n");
  return [
    "Create a biological specimen concept image for God Engine.",
    imageBrief,
    specialInstructions ? `User special instructions for this image: ${specialInstructions}.` : "",
    "Show one complete creature clearly in a single natural scene.",
    "Preserve lineage continuity: keep the parent's recognizable body plan, proportions, appendage logic, surface texture, coloration family, sensory organs, and scale unless the current species traits explicitly changed them.",
    "Do not simplify the creature into a primitive, larval, worm-like, slug-like, bottom-feeding, or limbless form unless the current species traits and lost traits explicitly say that happened.",
    "If the parent has legs, paired limbs, land locomotion, air-breathing anatomy, or a specific posture, keep those features recognizable unless the prompt explicitly describes a plausible evolutionary loss or repurposing.",
    "The image should look like a descendant of the immediate parent, not a fresh unrelated species concept.",
    "Make the new traits visible as natural anatomical adaptations, not labels or diagrams. If a trait is internal or behavioral, imply it through pose, habitat, body condition, or environmental interaction.",
    "Use naturalistic evolutionary concept art with specimen clarity.",
    "This must be a single landscape natural scene, not a designed information graphic.",
    "Do not create a chart, diagram, infographic, scientific plate, field guide page, multi-view layout, cutaway, cross-section, comparison panel, inset panel, UI panel, poster, annotation sheet, scale reference, or schematic.",
    "No text of any kind. No readable or unreadable writing. No species names, titles, labels, captions, legends, arrows, callouts, icons, logos, borders, frames, watermarks, or written trait lists.",
    "If any earlier prompt detail conflicts with these no-text and no-diagram rules, follow the no-text and no-diagram rules.",
    "Reduce amount of noise in image.",
  ].filter(Boolean).join("\n");
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let jobId = "";
  try {
    const authUser = await getAuthUser(req);
    const appUser = await getImageGenerationUser(authUser.id);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const speciesId = cleanText(body.speciesId, 120);
    const name = cleanText(body.name, 180) || "Unnamed species";
    if (!speciesId) return jsonResponse({ error: "speciesId is required." }, 400);

    const highResolution = body.highResolution === true;
    const makePrimary = highResolution || body.makePrimary === true;
    const requestedHighSize = cleanText(body.highResolutionSize, 40);
    const highSize = HIGH_SIZE_OPTIONS.has(requestedHighSize) ? requestedHighSize : DEFAULT_HIGH_SIZE;
    const prompt = buildPrompt(body);
    const format = STANDARD_FORMAT;
    const job = await createGenerationJob({
      userId: appUser.id,
      module: "god_engine",
      sourceType: highResolution ? "god_species_high_image" : "god_species_image",
      sourceId: speciesId,
      sourceLabel: name,
      prompt,
      model: IMAGE_MODEL,
      parameters: {
        model: IMAGE_MODEL,
        size: highResolution ? highSize : STANDARD_SIZE,
        quality: highResolution ? HIGH_QUALITY : STANDARD_QUALITY,
        output_format: format,
        special_instructions: cleanText(body.specialInstructions, 1200) || null,
      },
      progressLabel: "Queued",
    });
    jobId = job.id;
    await updateGenerationJob(job.id, { status: "running", progressLabel: "Generating species image" });

    const openai = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
    const result = await openai.images.generate({
      model: IMAGE_MODEL,
      prompt,
      n: 1,
      size: highResolution ? highSize : STANDARD_SIZE,
      quality: highResolution ? HIGH_QUALITY : STANDARD_QUALITY,
      output_format: format,
    });

    const imageBase64 = getImageBase64(result);
    const generated = result.data?.[0];
    if (!imageBase64) return jsonResponse({ error: "OpenAI did not return image data." }, 502);

    const { data: currentJob, error: currentJobError } = await createAdminClient()
      .from("generation_jobs")
      .select("status")
      .eq("id", jobId)
      .eq("deleted", false)
      .maybeSingle();
    if (currentJobError) throw currentJobError;
    if (currentJob?.status === "cancelled") return jsonResponse({ error: "This image generation was cancelled." }, 409);

    const imageId = crypto.randomUUID();
    const key = createImageKey("god-engine", imageId, format);
    const imageUrl = await uploadImageBytes({
      bytes: base64ToBytes(imageBase64),
      key,
      contentType: "image/jpeg",
      metadata: createCentralisStorageMetadata({
        module: "God Engine",
        context: `Species: ${name}`,
        note: highResolution ? "High-resolution species image" : "Standard species image",
      }),
    });

    let image = await insertImageRow({
      id: imageId,
      objectId: speciesId,
      imageUrl,
      provider: `openai:${IMAGE_MODEL}`,
      prompt: generated?.revised_prompt || prompt,
      generationSettings: {
        model: IMAGE_MODEL,
        size: highResolution ? highSize : STANDARD_SIZE,
        quality: highResolution ? HIGH_QUALITY : STANDARD_QUALITY,
        output_format: format,
        revised_prompt: generated?.revised_prompt || null,
        high_resolution: highResolution,
        special_instructions: cleanText(body.specialInstructions, 1200) || null,
      },
      userId: authUser.id,
    });

    if (makePrimary) {
      const supabase = createAdminClient();
      const { error: clearPrimaryError } = await supabase
        .from("image_table")
        .update({ is_primary: false })
        .eq("object_id", speciesId)
        .eq("deleted", false);

      if (clearPrimaryError) throw clearPrimaryError;

      const { data: primaryImage, error: setPrimaryError } = await supabase
        .from("image_table")
        .update({ is_primary: true })
        .eq("id", image.id)
        .eq("deleted", false)
        .select("id,object_id,image_url,provider,prompt,generation_settings,is_primary,sort_order,created_at")
        .single();

      if (setPrimaryError) throw setPrimaryError;
      image = primaryImage;
    }

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
        errorMessage: error instanceof Error ? error.message : "Could not generate species image.",
        errorDetails: describeError(error, "Could not generate species image.") as Record<string, unknown>,
      }).catch((jobError) => console.error(jobError));
    }
    return jsonResponse(describeError(error, "Could not generate species image."), 500);
  }
});
