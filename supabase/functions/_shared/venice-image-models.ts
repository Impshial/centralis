export type VeniceImageFormat = "png" | "jpeg" | "webp";
export type VeniceSizeProfile = "tier" | "aspect" | "none" | "openai";
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
};

// Keep this list intentionally explicit. It is the single server-side allowlist
// for Venice image generation. Adding a future provider model starts here.
export const VENICE_IMAGE_MODELS: readonly VeniceImageModel[] = [
  { id: "gpt-image-2", label: "GPT Image 2", provider: "openai", maxPromptCharacters: 32000, maxOutputs: 10, supportsReferences: true, maxReferences: 16, sizeProfile: "openai", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: true, supportsCompression: true, supportsBackground: true },
  { id: "flux-2-pro", label: "Flux 2 Pro", provider: "venice", maxPromptCharacters: 3000, maxOutputs: 4, supportsReferences: false, maxReferences: 0, sizeProfile: "none", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false },
  { id: "qwen-image-2", label: "Qwen Image 2", provider: "venice", maxPromptCharacters: 7500, maxOutputs: 4, editModelId: "qwen-image-2-edit", supportsReferences: true, maxReferences: 3, sizeProfile: "aspect", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false },
  { id: "z-image-turbo", label: "Z-Image Turbo", provider: "venice", maxPromptCharacters: 7500, maxOutputs: 4, supportsReferences: false, maxReferences: 0, sizeProfile: "none", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false },
  { id: "nano-banana-pro", label: "Nano Banana Pro", provider: "venice", maxPromptCharacters: 7500, maxOutputs: 4, editModelId: "nano-banana-pro-edit", supportsReferences: true, maxReferences: 3, sizeProfile: "tier", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false },
  { id: "wan-2-7-pro-text-to-image", label: "Wan 2.7 Pro", provider: "venice", maxPromptCharacters: 7500, maxOutputs: 4, editModelId: "wan-2-7-pro-edit", supportsReferences: true, maxReferences: 3, sizeProfile: "aspect", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false },
  { id: "seedream-v4", label: "Seedream V4.5", provider: "venice", maxPromptCharacters: 7500, maxOutputs: 4, editModelId: "seedream-v4-edit", supportsReferences: true, maxReferences: 3, sizeProfile: "aspect", formats: ["png", "jpeg", "webp"], defaultFormat: "png", supportsQuality: false, supportsCompression: false, supportsBackground: false },
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
  if (model.sizeProfile === "none") size = "auto";
  if (model.sizeProfile === "openai" && size === "custom") {
    const width = Number(raw.width);
    const height = Number(raw.height);
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
  };
}
