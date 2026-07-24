import { createClient } from "npm:@supabase/supabase-js@2";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function handleCors(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return null;
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required secret: ${name}`);
  }

  return value;
}

export function describeError(error: unknown, fallback = "Request failed.") {
  if (error instanceof Error) {
    const details = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    const status = "status" in error ? (error as { status?: unknown }).status : undefined;
    const code = "code" in error ? (error as { code?: unknown }).code : undefined;

    return {
      error: error.message || fallback,
      details,
      status,
      code,
    };
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const message = record.message || record.error || record.details || record.hint || fallback;
    return {
      error: String(message),
      details: record,
      status: record.status,
      code: record.code,
    };
  }

  if (typeof error === "string") {
    return { error };
  }

  return { error: fallback, details: String(error) };
}

export function getEndpoint() {
  const endpoint = getEnv("IDRIVE_E2_ENDPOINT");
  return endpoint.startsWith("http") ? endpoint : `https://${endpoint}`;
}

export function createAdminClient() {
  return createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

export async function getAuthUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Error("Missing authorization header.");
  }

  const supabase = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("You must be signed in to manage images.");
  }

  return data.user;
}

export function createImageKey(moduleName: string, imageId: string, extension = "png") {
  const cleanModuleName = moduleName.toLowerCase().replace(/[^a-z0-9-]/g, "-") || "legacy";
  const cleanExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  // The iDrive bucket is already named "centralis". Keep the object key
  // relative to that bucket so objects do not end up under centralis/centralis.
  return `images/${cleanModuleName}/${imageId}.${cleanExtension}`;
}

export function createImageGenerationKey(kind: "output" | "uploaded", imageId: string, extension = "png") {
  const cleanExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  return `images/image-generation/${kind}/${imageId}.${cleanExtension}`;
}

export function buildPublicUrl(key: string) {
  const template = Deno.env.get("IDRIVE_E2_PUBLIC_BASE_URL");
  const endpoint = getEndpoint().replace(/\/+$/, "");
  const bucket = getEnv("IDRIVE_E2_BUCKET");

  if (template) {
    return template
      .replaceAll("{IDRIVE_E2_ENDPOINT}", endpoint.replace(/^https?:\/\//, ""))
      .replaceAll("{IDRIVE_E2_BUCKET}", bucket)
      .replaceAll("{key}", key);
  }

  return `${endpoint}/${bucket}/${key}`;
}

export function createS3Client() {
  const endpoint = getEndpoint();
  return new S3Client({
    region: Deno.env.get("IDRIVE_E2_REGION") || "us-east-1",
    endpoint,
    forcePathStyle: true,
    // iDrive e2 is S3-compatible, but its optional checksum response can
    // trigger a signed/unsigned CRC32 conversion error in the AWS SDK's
    // Deno stream collector. Required checksums remain enabled.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: getEnv("IDRIVE_E2_ACCESS_KEY_ID"),
      secretAccessKey: getEnv("IDRIVE_E2_SECRET_ACCESS_KEY"),
    },
  });
}

export type CentralisObjectMetadata = Record<string, string | number | boolean | null | undefined>;

function cleanStorageMetadataValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E]/g, "")
    .slice(0, 240);
}

export function normalizeStorageMetadata(metadata?: CentralisObjectMetadata) {
  if (!metadata) return undefined;
  const normalized: Record<string, string> = {};

  for (const [rawKey, rawValue] of Object.entries(metadata)) {
    const key = rawKey
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 64);
    const value = cleanStorageMetadataValue(rawValue);
    if (key && value) normalized[key] = value;
  }

  return Object.keys(normalized).length ? normalized : undefined;
}

export function createCentralisStorageMetadata(input: {
  module: string;
  context?: string;
  note?: string;
}) {
  return normalizeStorageMetadata({
    "centralis-module": input.module,
    "centralis-context": input.context,
    "centralis-note": input.note,
  });
}

export async function uploadImageBytes(options: {
  bytes: Uint8Array;
  key: string;
  contentType: string;
  metadata?: CentralisObjectMetadata;
}) {
  const bucket = getEnv("IDRIVE_E2_BUCKET");
  const client = createS3Client();

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: options.key,
    Body: options.bytes,
    ContentType: options.contentType,
    Metadata: normalizeStorageMetadata(options.metadata),
  }));

  return buildPublicUrl(options.key);
}

export function getKeyFromImageUrl(imageUrl: string) {
  const bucket = getEnv("IDRIVE_E2_BUCKET");
  const url = new URL(imageUrl);
  const path = url.pathname.replace(/^\/+/, "");
  const bucketPrefix = `${bucket}/`;
  return path.startsWith(bucketPrefix) ? path.slice(bucketPrefix.length) : path;
}

export async function createSignedImageUrl(imageUrl: string, expiresIn = 3600) {
  const bucket = getEnv("IDRIVE_E2_BUCKET");
  const key = getKeyFromImageUrl(imageUrl);
  return getSignedUrl(createS3Client(), new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  }), { expiresIn });
}

export async function deleteImageObject(imageUrl: string) {
  const bucket = getEnv("IDRIVE_E2_BUCKET");
  const key = getKeyFromImageUrl(imageUrl);
  await createS3Client().send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }));
}

export async function deleteStorageObject(bucket: string, key: string) {
  await createS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function listStorageBuckets() {
  const response = await createS3Client().send(new ListBucketsCommand({}));
  return (response.Buckets || [])
    .map((bucket) => bucket.Name)
    .filter((bucket): bucket is string => Boolean(bucket))
    .sort((left, right) => left.localeCompare(right));
}

export async function listStorageObjects(options: {
  bucket: string;
  prefix?: string;
  continuationToken?: string;
  maxKeys?: number;
}) {
  const response = await createS3Client().send(new ListObjectsV2Command({
    Bucket: options.bucket,
    Prefix: options.prefix || "",
    Delimiter: "/",
    ContinuationToken: options.continuationToken || undefined,
    MaxKeys: Math.min(Math.max(options.maxKeys || 250, 1), 1000),
  }));

  return {
    folders: (response.CommonPrefixes || [])
      .map((entry) => entry.Prefix)
      .filter((prefix): prefix is string => Boolean(prefix)),
    objects: (response.Contents || [])
      .filter((entry) => Boolean(entry.Key) && entry.Key !== options.prefix)
      .map((entry) => ({
        key: entry.Key as string,
        size: Number(entry.Size || 0),
        lastModified: entry.LastModified?.toISOString() || null,
        etag: entry.ETag || null,
      })),
    nextContinuationToken: response.NextContinuationToken || null,
  };
}

export async function createSignedStorageUrl(options: {
  bucket: string;
  key: string;
  download?: boolean;
  expiresIn?: number;
}) {
  return getSignedUrl(createS3Client(), new GetObjectCommand({
    Bucket: options.bucket,
    Key: options.key,
    ResponseContentDisposition: options.download
      ? `attachment; filename="${options.key.split("/").pop() || "download"}"`
      : undefined,
  }), { expiresIn: options.expiresIn || 900 });
}

export async function getStorageObjectMetadata(bucket: string, key: string) {
  const response = await createS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return {
    size: Number(response.ContentLength || 0),
    contentType: response.ContentType || "application/octet-stream",
    lastModified: response.LastModified?.toISOString() || null,
    metadata: response.Metadata || {},
  };
}

export async function insertImageRow(options: {
  id: string;
  objectId: string;
  imageUrl: string;
  provider: string;
  prompt?: string | null;
  generationSettings?: Record<string, unknown> | null;
  userId: string;
}) {
  const supabase = createAdminClient();
  const { count, error: countError } = await supabase
    .from("image_table")
    .select("id", { count: "exact", head: true })
    .eq("object_id", options.objectId);

  if (countError) {
    throw countError;
  }

  const imageCount = Number(count || 0);
  const { data, error } = await supabase
    .from("image_table")
    .insert({
      id: options.id,
      object_id: options.objectId,
      image_url: options.imageUrl,
      provider: options.provider,
      prompt: options.prompt || null,
      generation_settings: options.generationSettings || null,
      user_id: options.userId,
      is_primary: imageCount === 0,
      sort_order: imageCount,
    })
    .select("id,object_id,image_url,provider,prompt,generation_settings,is_primary,sort_order,created_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}
