import {
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
  listStorageBuckets,
  listStorageObjects,
} from "../_shared/image-storage.ts";

async function assertAllowedBucket(bucket: string) {
  const buckets = await listStorageBuckets();
  if (!buckets.includes(bucket)) {
    throw new Error("This storage bucket is not available.");
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "buckets");

    if (action === "buckets") {
      return jsonResponse({ buckets: await listStorageBuckets() });
    }

    if (action !== "objects") {
      return jsonResponse({ error: "Unsupported storage action." }, 400);
    }

    const bucket = String(body.bucket || "").trim();
    const prefix = String(body.prefix || "").replace(/^\/+/, "");
    if (!bucket) return jsonResponse({ error: "bucket is required." }, 400);
    await assertAllowedBucket(bucket);

    const result = await listStorageObjects({
      bucket,
      prefix,
      continuationToken: String(body.continuationToken || "").trim() || undefined,
      maxKeys: Number(body.maxKeys || 250),
    });
    return jsonResponse(result);
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not browse storage."), 500);
  }
});
