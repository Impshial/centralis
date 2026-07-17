import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "npm:@aws-sdk/client-s3";
import {
  buildPublicUrl,
  createAdminClient,
  createImageKey,
  createS3Client,
  describeError,
  getAuthUser,
  getEnv,
  getEndpoint,
  getKeyFromImageUrl,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";

function extensionFromKey(key: string) {
  return key.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
}

function copySource(bucket: string, key: string) {
  return `${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
}

function isManagedCentralisImageUrl(imageUrl: string) {
  try {
    const source = new URL(imageUrl);
    const endpoint = new URL(getEndpoint());
    const publicBase = Deno.env.get("IDRIVE_E2_PUBLIC_BASE_URL");
    const allowedHosts = new Set([endpoint.host]);
    if (publicBase) {
      const expanded = publicBase
        .replaceAll("{IDRIVE_E2_ENDPOINT}", endpoint.host)
        .replaceAll("{IDRIVE_E2_BUCKET}", getEnv("IDRIVE_E2_BUCKET"))
        .replaceAll("{key}", "placeholder");
      allowedHosts.add(new URL(expanded).host);
    }
    return allowedHosts.has(source.host);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getAuthUser(req);
    const migrationAdmin = getEnv("STORAGE_MIGRATION_ADMIN_AUTH_ID");
    if (user.id !== migrationAdmin) return jsonResponse({ error: "You are not allowed to run storage migrations." }, 403);

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;
    const limit = Math.min(Math.max(Number(body.limit || 25), 1), 100);
    const afterId = String(body.afterId || "").trim();
    const supabase = createAdminClient();
    let request = supabase
      .from("image_table")
      .select("id,object_id,image_url")
      .order("id", { ascending: true })
      .limit(limit);
    if (afterId) request = request.gt("id", afterId);
    const { data: images, error } = await request;
    if (error) throw error;

    const [{ data: chatLogs }, { data: elements }, { data: universes }] = await Promise.all([
      supabase.from("chat_logs").select("id"),
      supabase.from("elements").select("id"),
      supabase.from("universes").select("id"),
    ]);
    const chatIds = new Set((chatLogs || []).map((row) => String(row.id)));
    const universeObjectIds = new Set([...(elements || []), ...(universes || [])].map((row) => String(row.id)));
    const bucket = getEnv("IDRIVE_E2_BUCKET");
    const client = createS3Client();
    const results: Array<Record<string, unknown>> = [];

    for (const image of images || []) {
      const imageId = String(image.id);
      const objectId = String(image.object_id || "");
      const oldUrl = String(image.image_url || "");
      let oldKey = "";
      try {
        if (isManagedCentralisImageUrl(oldUrl)) oldKey = getKeyFromImageUrl(oldUrl);
      } catch { /* external URL: ignore */ }
      // Objects at centralis/images/... were created by the earlier migration
      // prefix mistake. They deliberately remain eligible here so this job
      // repairs them into images/... and updates their database URLs.
      if (!oldKey || oldKey.startsWith("images/")) {
        results.push({ id: imageId, status: "skipped", reason: oldKey ? "already_migrated" : "external_or_invalid_url" });
        continue;
      }

      const moduleName = objectId.startsWith("movie-")
        ? "movie-tracker"
        : chatIds.has(objectId)
          ? "chat-repository"
          : universeObjectIds.has(objectId)
            ? "universe-builder"
            : "legacy";
      const newKey = createImageKey(moduleName, imageId, extensionFromKey(oldKey));
      if (dryRun) {
        results.push({ id: imageId, status: "planned", oldKey, newKey, moduleName });
        continue;
      }

      try {
        await client.send(new CopyObjectCommand({ Bucket: bucket, Key: newKey, CopySource: copySource(bucket, oldKey) }));
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: newKey }));
        const newUrl = buildPublicUrl(newKey);
        const { error: updateError } = await supabase.from("image_table").update({ image_url: newUrl }).eq("id", imageId);
        if (updateError) throw updateError;
        if (objectId.startsWith("movie-")) {
          const movieId = objectId.slice("movie-".length);
          const { error: movieError } = await supabase.from("movies").update({ poster_url: newUrl }).eq("id", movieId).eq("poster_url", oldUrl);
          if (movieError) throw movieError;
        }
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey }));
        results.push({ id: imageId, status: "migrated", oldKey, newKey, moduleName });
      } catch (error) {
        console.error(`Image migration failed for ${imageId}`, error);
        results.push({ id: imageId, status: "failed", oldKey, newKey, moduleName, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return jsonResponse({
      dryRun,
      processed: results.length,
      nextAfterId: images?.length ? String(images[images.length - 1].id) : null,
      results,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not migrate Centralis images."), 500);
  }
});
