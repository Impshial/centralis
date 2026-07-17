import {
  createAdminClient,
  createSignedStorageUrl,
  getEnv,
} from "./image-storage.ts";

export const IMAGE_GENERATION_BUCKET = () => getEnv("IDRIVE_E2_BUCKET");
export const MAX_REFERENCE_IMAGES = 3;
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_CONTEXT_MESSAGES = 24;
export const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export type AppUser = { id: number; clerk_user_id: string };

export async function getImageGenerationUser(authUserId: string): Promise<AppUser> {
  const { data, error } = await createAdminClient()
    .from("users")
    .select("id,clerk_user_id")
    .eq("clerk_user_id", authUserId)
    .single();
  if (error || !data) throw error || new Error("Centralis user profile was not found.");
  return data as AppUser;
}

export async function requireImageGenerationSession(sessionId: string, userId: number) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("image_generation_sessions")
    .select("id,user_id,title,active_settings,created_at,updated_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw error || new Error("Image generation session was not found.");
  return data;
}

export function extensionFromContentType(contentType: string) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  return "png";
}

export function normalizeOutputFormat(value: unknown) {
  const format = String(value || "png").toLowerCase();
  if (!["png", "jpeg", "webp"].includes(format)) throw new Error("Output format must be PNG, JPEG, or WebP.");
  return format as "png" | "jpeg" | "webp";
}

export function outputContentType(format: string) {
  return format === "jpeg" ? "image/jpeg" : `image/${format}`;
}

export async function serializeImageGenerationAsset(asset: Record<string, unknown>) {
  const storageKey = String(asset.storage_key || "");
  const bucket = IMAGE_GENERATION_BUCKET();
  return {
    ...asset,
    preview_url: storageKey ? await createSignedStorageUrl({ bucket, key: storageKey, expiresIn: 3600 }) : null,
  };
}

export function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function getImageBase64s(result: unknown) {
  const data = (result as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  return data.map((entry) => ({
    base64: typeof (entry as { b64_json?: unknown }).b64_json === "string"
      ? (entry as { b64_json: string }).b64_json
      : "",
    revisedPrompt: typeof (entry as { revised_prompt?: unknown }).revised_prompt === "string"
      ? (entry as { revised_prompt: string }).revised_prompt
      : null,
  })).filter((entry) => entry.base64);
}
