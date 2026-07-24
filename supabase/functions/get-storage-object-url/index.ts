import {
  createSignedStorageUrl,
  describeError,
  getAuthUser,
  getStorageObjectMetadata,
  handleCors,
  jsonResponse,
  listStorageBuckets,
} from "../_shared/image-storage.ts";

function getFallbackContentType(key: string) {
  if (/\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(key)) return `image/${key.split(".").pop()?.toLowerCase().replace("jpg", "jpeg") || "png"}`;
  if (/\.html?$/i.test(key)) return "text/html";
  if (/\.json$/i.test(key)) return "application/json";
  if (/\.pdf$/i.test(key)) return "application/pdf";
  if (/\.txt$/i.test(key)) return "text/plain";
  return "application/octet-stream";
}

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

    let metadata;
    try {
      metadata = await getStorageObjectMetadata(bucket, key);
    } catch (metadataError) {
      console.warn("Could not load storage object metadata; returning signed URL with fallback details.", {
        bucket,
        key,
        metadataError,
      });
      metadata = {
        size: Number(body.size || 0),
        contentType: String(body.contentType || getFallbackContentType(key)),
        lastModified: body.lastModified ? String(body.lastModified) : null,
        metadata: {},
        metadataUnavailable: true,
      };
    }
    const url = await createSignedStorageUrl({ bucket, key, download });
    return jsonResponse({ url, metadata });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not retrieve this storage object."), 500);
  }
});
