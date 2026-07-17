import {
  createSignedStorageUrl,
  describeError,
  getAuthUser,
  getStorageObjectMetadata,
  handleCors,
  jsonResponse,
  listStorageBuckets,
} from "../_shared/image-storage.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await getAuthUser(req);
    const body = await req.json();
    const bucket = String(body.bucket || "").trim();
    const key = String(body.key || "").replace(/^\/+/, "");
    const download = Boolean(body.download);
    if (!bucket || !key) return jsonResponse({ error: "bucket and key are required." }, 400);

    const buckets = await listStorageBuckets();
    if (!buckets.includes(bucket)) return jsonResponse({ error: "This storage bucket is not available." }, 403);

    const metadata = await getStorageObjectMetadata(bucket, key);
    const url = await createSignedStorageUrl({ bucket, key, download });
    return jsonResponse({ url, metadata });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not retrieve this storage object."), 500);
  }
});
