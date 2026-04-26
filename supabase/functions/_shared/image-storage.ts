import { createClient } from "npm:@supabase/supabase-js@2";
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3";

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
  return `users/${userId}/objects/${objectId}/${crypto.randomUUID()}.${cleanExtension}`;
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

export async function uploadImageBytes(options: {
  bytes: Uint8Array;
  key: string;
  contentType: string;
}) {
  const endpoint = getEndpoint();
  const bucket = getEnv("IDRIVE_E2_BUCKET");
  const client = new S3Client({
    region: Deno.env.get("IDRIVE_E2_REGION") || "us-east-1",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: getEnv("IDRIVE_E2_ACCESS_KEY_ID"),
      secretAccessKey: getEnv("IDRIVE_E2_SECRET_ACCESS_KEY"),
    },
  });

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: options.key,
    Body: options.bytes,
    ContentType: options.contentType,
  }));

  return buildPublicUrl(options.key);
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
