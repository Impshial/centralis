export type VeniceImageFormat = "png" | "jpeg" | "webp";
export type VeniceSizeProfile = "tier" | "aspect" | "pixel" | "none" | "openai";
export type ImageGenerationProvider = "openai" | "venice";

export type VeniceImageModel = {
  id: string;
  label: string;
  provider: ImageGenerationProvider;
  maxPromptCharacters: number;
  maxOutputs: number;
  editModelId?: string;
  supportsReferences: boolean;
  maxReferences: number;
  sizeProfile: VeniceSizeProfile;
  formats: readonly VeniceImageFormat[];
  defaultFormat: VeniceImageFormat;
  supportsQuality: boolean;
  supportsCompression: boolean;
  supportsBackground: boolean;
  supportsStylePreset: boolean;
  supportsNegativePrompt: boolean;
  supportsSeed: boolean;
  supportsCfgScale: boolean;
  supportsSteps: boolean;
  stepsDefault: number | null;
  stepsMax: number | null;
  widthHeightDivisor: number | null;
  supportsWebSearch: boolean;
};

// Keep this list intentionally explicit. It is the single server-side allowlist
// for Venice image generation. Adding a future provider model starts here.
export const VENICE_IMAGE_MODELS: readonly VeniceImageModel[] = [
  { id: "gpt-image-2", label: "GPT Image 2", provider: "openai", maxPromptCharacters: 32000, maxOutputs: 10, supportsReferences: true, maxReferences: 16, sizeProfile: "openai", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: true, supportsCompression: true, supportsBackground: true, supportsStylePreset: false, supportsNegativePrompt: false, supportsSeed: false, supportsCfgScale: false, supportsSteps: false, stepsDefault: null, stepsMax: null, widthHeightDivisor: 16, supportsWebSearch: false },
  { id: "flux-2-pro", label: "Flux 2 Pro", provider: "venice", maxPromptCharacters: 3000, maxOutputs: 4, supportsReferences: false, maxReferences: 0, sizeProfile: "aspect", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false, supportsStylePreset: true, supportsNegativePrompt: true, supportsSeed: true, supportsCfgScale: true, supportsSteps: true, stepsDefault: 20, stepsMax: 50, widthHeightDivisor: 1, supportsWebSearch: false },
  { id: "qwen-image-2", label: "Qwen Image 2", provider: "venice", maxPromptCharacters: 10000, maxOutputs: 4, editModelId: "qwen-image-2-edit", supportsReferences: true, maxReferences: 3, sizeProfile: "aspect", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false, supportsStylePreset: true, supportsNegativePrompt: true, supportsSeed: true, supportsCfgScale: true, supportsSteps: true, stepsDefault: 20, stepsMax: 50, widthHeightDivisor: 1, supportsWebSearch: false },
  { id: "z-image-turbo", label: "Z-Image Turbo", provider: "venice", maxPromptCharacters: 7500, maxOutputs: 4, supportsReferences: false, maxReferences: 0, sizeProfile: "pixel", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false, supportsStylePreset: true, supportsNegativePrompt: true, supportsSeed: true, supportsCfgScale: true, supportsSteps: false, stepsDefault: 8, stepsMax: 8, widthHeightDivisor: 8, supportsWebSearch: false },
  { id: "nano-banana-pro", label: "Nano Banana Pro", provider: "venice", maxPromptCharacters: 32768, maxOutputs: 4, editModelId: "nano-banana-pro-edit", supportsReferences: true, maxReferences: 3, sizeProfile: "tier", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false, supportsStylePreset: true, supportsNegativePrompt: true, supportsSeed: true, supportsCfgScale: true, supportsSteps: true, stepsDefault: 20, stepsMax: 50, widthHeightDivisor: 1, supportsWebSearch: true },
  { id: "wan-2-7-pro-text-to-image", label: "Wan 2.7 Pro", provider: "venice", maxPromptCharacters: 3000, maxOutputs: 4, editModelId: "wan-2-7-pro-edit", supportsReferences: true, maxReferences: 3, sizeProfile: "aspect", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false, supportsStylePreset: true, supportsNegativePrompt: true, supportsSeed: true, supportsCfgScale: true, supportsSteps: true, stepsDefault: 20, stepsMax: 50, widthHeightDivisor: 1, supportsWebSearch: false },
  { id: "seedream-v4", label: "Seedream V4.5", provider: "venice", maxPromptCharacters: 10000, maxOutputs: 4, editModelId: "seedream-v4-edit", supportsReferences: true, maxReferences: 3, sizeProfile: "aspect", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false, supportsStylePreset: true, supportsNegativePrompt: true, supportsSeed: true, supportsCfgScale: true, supportsSteps: true, stepsDefault: 20, stepsMax: 50, widthHeightDivisor: 1, supportsWebSearch: false },
  { id: "chroma", label: "Chroma", provider: "venice", maxPromptCharacters: 7500, maxOutputs: 4, supportsReferences: false, maxReferences: 0, sizeProfile: "pixel", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false, supportsStylePreset: true, supportsNegativePrompt: true, supportsSeed: true, supportsCfgScale: true, supportsSteps: false, stepsDefault: 10, stepsMax: 10, widthHeightDivisor: 8, supportsWebSearch: false },
  { id: "recraft-v4-pro", label: "Recraft V4 Pro", provider: "venice", maxPromptCharacters: 10000, maxOutputs: 4, supportsReferences: false, maxReferences: 0, sizeProfile: "aspect", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false, supportsStylePreset: true, supportsNegativePrompt: true, supportsSeed: true, supportsCfgScale: true, supportsSteps: true, stepsDefault: 20, stepsMax: 50, widthHeightDivisor: 1, supportsWebSearch: false },
];

export const DEFAULT_VENICE_IMAGE_SETTINGS = {
  provider: "openai",
  model: "gpt-image-2",
  n: 1,
  size: "auto",
  format: "png" as VeniceImageFormat,
  moderation: "low",
};

const aspectRatios: Record<string, string> = {
  "1024x1024": "1:1",
  "1024x1536": "2:3",
  "1536x1024": "3:2",
  "1536x864": "16:9",
  "2560x1440": "16:9",
  "1440x2560": "9:16",
  "3840x2160": "16:9",
  "2160x3840": "9:16",
};

const resolutionTiers: Record<string, string> = {
  "1024x1024": "1K",
  "1024x1536": "1K",
  "1536x1024": "1K",
  "1536x864": "1K",
  "2560x1440": "2K",
  "1440x2560": "2K",
  "3840x2160": "4K",
  "2160x3840": "4K",
};

export function getVeniceImageModel(id: unknown) {
  const model = VENICE_IMAGE_MODELS.find((entry) => entry.id === String(id || DEFAULT_VENICE_IMAGE_SETTINGS.model));
  if (!model) throw new Error("Unsupported Venice image model.");
  return model;
}

export function getPublicVeniceImageModels() {
  return VENICE_IMAGE_MODELS.map((model) => ({
    id: model.id,
    label: model.label,
    provider: model.provider,
    maxPromptCharacters: model.maxPromptCharacters,
    maxOutputs: model.maxOutputs,
    supportsReferences: model.supportsReferences,
    maxReferences: model.maxReferences,
    sizeProfile: model.sizeProfile,
    formats: [...model.formats],
    defaultFormat: model.defaultFormat,
    supportsQuality: model.supportsQuality,
    supportsCompression: model.supportsCompression,
    supportsBackground: model.supportsBackground,
    supportsStylePreset: model.supportsStylePreset,
    supportsNegativePrompt: model.supportsNegativePrompt,
    supportsSeed: model.supportsSeed,
    supportsCfgScale: model.supportsCfgScale,
    supportsSteps: model.supportsSteps,
    stepsDefault: model.stepsDefault,
    stepsMax: model.stepsMax,
    widthHeightDivisor: model.widthHeightDivisor,
    supportsWebSearch: model.supportsWebSearch,
  }));
}

export function normalizeVeniceImageSettings(raw: Record<string, unknown>) {
  const model = getVeniceImageModel(raw.model);
  const n = Number(raw.n || DEFAULT_VENICE_IMAGE_SETTINGS.n);
  if (!Number.isInteger(n) || n < 1 || n > model.maxOutputs) throw new Error(`Output count must be between 1 and ${model.maxOutputs} for ${model.label}.`);
  const format = String(raw.format || model.defaultFormat).toLowerCase() as VeniceImageFormat;
  if (!model.formats.includes(format)) throw new Error(`The ${model.label} model does not support that output format.`);
  const moderation = String(raw.moderation || DEFAULT_VENICE_IMAGE_SETTINGS.moderation).toLowerCase();
  if (!['auto', 'low'].includes(moderation)) throw new Error("Moderation must be Auto or Low.");
  let size = String(raw.size || "auto").toLowerCase();
  let width: number | null = null;
  let height: number | null = null;
  if (model.sizeProfile === "none") size = "auto";
  if (model.sizeProfile === "pixel") {
    width = Number(raw.width || 1024);
    height = Number(raw.height || 1024);
    const divisor = model.widthHeightDivisor || 1;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 1280 || height > 1280 || width % divisor || height % divisor) {
      throw new Error(`${model.label} dimensions must be whole numbers from 1 to 1280 and divisible by ${divisor}.`);
    }
    size = `${width}x${height}`;
  } else if (model.sizeProfile === "openai" && size === "custom") {
    width = Number(raw.width);
    height = Number(raw.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || width > 3840 || height > 3840 || width % 16 || height % 16 || (width * height) < 655360 || (width * height) > 8294400 || Math.max(width, height) / Math.min(width, height) > 3) {
      throw new Error("Custom GPT Image 2 dimensions must be multiples of 16, within 16–3840 pixels, use a maximum 3:1 aspect ratio, and contain 655,360–8,294,400 pixels.");
    }
    size = `${width}x${height}`;
  } else if (model.sizeProfile !== "none" && size !== "auto" && !aspectRatios[size]) {
    throw new Error(`Unsupported size for ${model.label}.`);
  }
  const quality = String(raw.quality || "auto").toLowerCase();
  if (model.supportsQuality && !["auto", "low", "medium", "high"].includes(quality)) throw new Error("Quality must be Auto, Low, Medium, or High.");
  const background = String(raw.background || "auto").toLowerCase();
  if (model.supportsBackground && !["auto", "opaque"].includes(background)) throw new Error("Background must be Auto or Opaque.");
  const compression = Number(raw.compression ?? 90);
  if (model.supportsCompression && (!Number.isInteger(compression) || compression < 0 || compression > 100)) throw new Error("Compression must be a whole number between 0 and 100.");
  const stylePreset = String(raw.style_preset || "").trim();
  if (stylePreset && !model.supportsStylePreset) throw new Error(`${model.label} does not support style presets.`);
  const negativePrompt = String(raw.negative_prompt || "").trim();
  if (negativePrompt && !model.supportsNegativePrompt) throw new Error(`${model.label} does not support negative prompts.`);
  if (negativePrompt.length > 7500) throw new Error("Negative prompts may not exceed 7,500 characters.");
  const seedText = String(raw.seed ?? "").trim();
  const seed = seedText ? Number(seedText) : null;
  if (seedText && (!Number.isInteger(seed) || seed < -999999999 || seed > 999999999)) throw new Error("Seed must be a whole number between -999,999,999 and 999,999,999.");
  if (seed !== null && !model.supportsSeed) throw new Error(`${model.label} does not support seeds.`);
  const cfgScaleText = String(raw.cfg_scale ?? "").trim();
  const cfgScale = cfgScaleText ? Number(cfgScaleText) : null;
  if (cfgScaleText && (!Number.isFinite(cfgScale) || cfgScale <= 0 || cfgScale > 20)) throw new Error("CFG scale must be greater than 0 and no more than 20.");
  if (cfgScale !== null && !model.supportsCfgScale) throw new Error(`${model.label} does not support CFG scale.`);
  const stepsText = model.supportsSteps ? String(raw.steps ?? "").trim() : "";
  const steps = model.supportsSteps ? (stepsText ? Number(stepsText) : model.stepsDefault) : null;
  if (steps !== null && steps !== undefined && (!Number.isInteger(steps) || steps < 1 || (model.stepsMax !== null && steps > model.stepsMax))) {
    throw new Error(`Steps for ${model.label} must be a whole number from 1 to ${model.stepsMax || "the model maximum"}.`);
  }
  if (stepsText && !model.supportsSteps) throw new Error(`${model.label} does not support user-adjustable steps.`);
  const enableWebSearch = raw.enable_web_search === true || String(raw.enable_web_search || "").toLowerCase() === "true";
  if (enableWebSearch && !model.supportsWebSearch) throw new Error(`${model.label} does not support web search.`);
  return {
    provider: model.provider,
    model: model.id,
    modelLabel: model.label,
    maxPromptCharacters: model.maxPromptCharacters,
    n,
    size,
    format,
    moderation,
    quality: model.supportsQuality ? quality : null,
    background: model.supportsBackground ? background : null,
    compression: model.supportsCompression ? compression : null,
    maxReferences: model.maxReferences,
    supportsReferences: model.supportsReferences,
    editModelId: model.editModelId || null,
    aspectRatio: size === "auto" ? null : aspectRatios[size] || null,
    resolution: model.sizeProfile === "tier" && size !== "auto" ? resolutionTiers[size] || null : null,
    width: model.sizeProfile === "pixel" ? width : null,
    height: model.sizeProfile === "pixel" ? height : null,
    stylePreset: model.supportsStylePreset && stylePreset ? stylePreset : null,
    negativePrompt: model.supportsNegativePrompt && negativePrompt ? negativePrompt : null,
    seed: model.supportsSeed ? seed : null,
    cfgScale: model.supportsCfgScale ? cfgScale : null,
  steps: model.supportsSteps ? steps : null,
    enableWebSearch: model.supportsWebSearch ? enableWebSearch : false,
    hideWatermark: model.provider === "venice",
  };
}
