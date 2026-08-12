import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "npm:@aws-sdk/client-s3";
import {
  createS3Client,
  getEnv,
  normalizeStorageMetadata,
  type CentralisObjectMetadata,
} from "./image-storage.ts";

export const MAX_UNIVERSE_SOURCE_DOCUMENT_BYTES = 25 * 1024 * 1024;

export const SUPPORTED_SOURCE_DOCUMENT_EXTENSIONS = new Set([
  "csv",
  "doc",
  "docx",
  "htm",
  "html",
  "json",
  "markdown",
  "md",
  "pdf",
  "rtf",
  "tsv",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

export function getFileExtension(filename: string) {
  const cleanName = String(filename || "").trim();
  const match = cleanName.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : "";
}

export function sanitizeSourceDocumentFilename(filename: string, fallback = "source-document") {
  const clean = String(filename || "")
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 160);
  return clean || fallback;
}

export function createUniverseSourceDocumentKey(options: {
  authUserId: string;
  universeId: string;
  documentId: string;
  filename: string;
}) {
  return [
    "universe-source-documents",
    encodeURIComponent(options.authUserId),
    encodeURIComponent(options.universeId),
    encodeURIComponent(options.documentId),
    sanitizeSourceDocumentFilename(options.filename),
  ].join("/");
}

export function createArcSourceDocumentKey(options: {
  authUserId: string;
  projectId: string;
  documentId: string;
  filename: string;
}) {
  return [
    "arc-source-documents",
    encodeURIComponent(options.authUserId),
    encodeURIComponent(options.projectId),
    encodeURIComponent(options.documentId),
    sanitizeSourceDocumentFilename(options.filename, "arc-source-document"),
  ].join("/");
}

export async function uploadUniverseSourceDocumentObject(options: {
  bytes: Uint8Array;
  key: string;
  contentType: string;
  metadata?: CentralisObjectMetadata;
}) {
  await createS3Client().send(new PutObjectCommand({
    Bucket: getEnv("IDRIVE_E2_BUCKET"),
    Key: options.key,
    Body: options.bytes,
    ContentType: options.contentType || "application/octet-stream",
    Metadata: normalizeStorageMetadata(options.metadata),
  }));
}

export async function readUniverseSourceDocumentObject(key: string) {
  const response = await createS3Client().send(new GetObjectCommand({
    Bucket: getEnv("IDRIVE_E2_BUCKET"),
    Key: key,
  }));

  if (!response.Body) {
    throw new Error("The stored source document is empty.");
  }

  return new Uint8Array(await response.Body.transformToByteArray());
}

export async function deleteUniverseSourceDocumentObject(key: string) {
  await createS3Client().send(new DeleteObjectCommand({
    Bucket: getEnv("IDRIVE_E2_BUCKET"),
    Key: key,
  }));
}
