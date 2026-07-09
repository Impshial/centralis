import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "npm:@aws-sdk/client-s3";
import {
  createAdminClient,
  createS3Client,
  getEnv,
} from "./image-storage.ts";

export const MAX_CHAT_LOG_BYTES = 10 * 1024 * 1024;
const MAX_SEARCH_TEXT_LENGTH = 1_000_000;

export async function getAppUser(authUserId: string) {
  const { data, error } = await createAdminClient()
    .from("users")
    .select("id,clerk_user_id")
    .eq("clerk_user_id", authUserId)
    .single();

  if (error || !data) {
    throw error || new Error("Centralis user profile was not found.");
  }

  return data;
}

export function createChatLogKey(authUserId: string, chatLogId: string) {
  return `chat-repository/${authUserId}/${chatLogId}.html`;
}

export async function uploadChatLogObject(options: {
  bytes: Uint8Array;
  key: string;
}) {
  await createS3Client().send(new PutObjectCommand({
    Bucket: getEnv("IDRIVE_E2_BUCKET"),
    Key: options.key,
    Body: options.bytes,
    ContentType: "text/html; charset=utf-8",
  }));
}

export async function readChatLogObject(key: string) {
  const response = await createS3Client().send(new GetObjectCommand({
    Bucket: getEnv("IDRIVE_E2_BUCKET"),
    Key: key,
  }));

  if (!response.Body) {
    throw new Error("The stored chat log is empty.");
  }

  return new Uint8Array(await response.Body.transformToByteArray());
}

export async function deleteChatLogObject(key: string) {
  await createS3Client().send(new DeleteObjectCommand({
    Bucket: getEnv("IDRIVE_E2_BUCKET"),
    Key: key,
  }));
}

function decodeHtmlEntity(entity: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  const normalized = entity.toLowerCase();
  if (normalized.startsWith("#x")) {
    const codePoint = Number.parseInt(normalized.slice(2), 16);
    return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : " ";
  }
  if (normalized.startsWith("#")) {
    const codePoint = Number.parseInt(normalized.slice(1), 10);
    return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : " ";
  }
  return namedEntities[normalized] || " ";
}

export function extractChatLogSearchText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&([a-zA-Z][a-zA-Z0-9]+|#[0-9]+|#x[0-9a-fA-F]+);/g, (_match, entity) => decodeHtmlEntity(entity))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_TEXT_LENGTH);
}
