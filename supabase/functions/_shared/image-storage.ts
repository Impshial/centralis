import { createClient } from "npm:@supabase/supabase-js@2";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3";
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

export function createImageKey(userId: string, objectId: string, extension = "png") {
  const cleanExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  return `images/${objectId}/${crypto.randomUUID()}.${cleanExtension}`;
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
    credentials: {
      accessKeyId: getEnv("IDRIVE_E2_ACCESS_KEY_ID"),
      secretAccessKey: getEnv("IDRIVE_E2_SECRET_ACCESS_KEY"),
    },
  });
}

export async function uploadImageBytes(options: {
  bytes: Uint8Array;
  key: string;
  contentType: string;
}) {
  const bucket = getEnv("IDRIVE_E2_BUCKET");
  const client = createS3Client();

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: options.key,
    Body: options.bytes,
    ContentType: options.contentType,
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

export async function insertImageRow(options: {
  objectId: string;
  imageUrl: string;
  provider: string;
  prompt?: string | null;
  generationSettings?: Record<string, unknown> | null;
  userId: string;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("image_table")
    .insert({
      object_id: options.objectId,
      image_url: options.imageUrl,
      provider: options.provider,
      prompt: options.prompt || null,
      generation_settings: options.generationSettings || null,
      user_id: options.userId,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
