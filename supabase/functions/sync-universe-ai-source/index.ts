import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import {
  attachFileToVectorStore,
  buildUniverseCanonDocument,
  cleanUniverseId,
  createOpenAiVectorStore,
  getAppUser,
  getOrCreateAiSource,
  hashText,
  loadUniverseContext,
  removeOpenAiFile,
  serializeSource,
  uploadOpenAiCanonFile,
  waitForVectorStoreFile,
} from "../_shared/universe-ai.ts";

function safeSlug(value: string) {
  return String(value || "universe")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "universe";
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabase = createAdminClient();
  let sourceForError: Record<string, unknown> | null = null;
  let universeIdForError = "";
  let appUserIdForError = 0;

  try {
    const authUser = await getAuthUser(req);
    const appUser = await getAppUser(authUser.id);
    const body = await req.json().catch(() => ({}));
    const universeId = cleanUniverseId(body.universeId);

    if (!universeId) {
      return jsonResponse({ error: "universeId is required." }, 400);
    }

    universeIdForError = universeId;
    appUserIdForError = appUser.id;

    const context = await loadUniverseContext(supabase, universeId, appUser.id);
    const source = await getOrCreateAiSource(supabase, universeId, appUser.id);
    sourceForError = source;

    const canonDocument = buildUniverseCanonDocument(context);
    const contentHash = await hashText(canonDocument);
    const existingHash = String(source.content_hash || "");
    const existingVectorStoreId = String(source.vector_store_id || "");
    const existingFileId = String(source.current_file_id || "");

    if (
      existingHash === contentHash &&
      existingVectorStoreId &&
      existingFileId
    ) {
      const { data: readySource, error: readyError } = await supabase
        .from("universe_ai_sources")
        .update({
          sync_status: "ready",
          sync_error: null,
          last_synced_at: source.last_synced_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("universe_id", universeId)
        .eq("user_id", appUser.id)
        .select("*")
        .single();

      if (readyError || !readySource) {
        throw readyError || new Error("Could not refresh AI source status.");
      }

      return jsonResponse({
        source: serializeSource(readySource),
        skipped: true,
      });
    }

    const { data: syncingSource, error: syncingError } = await supabase
      .from("universe_ai_sources")
      .update({
        sync_status: "syncing",
        sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("universe_id", universeId)
      .eq("user_id", appUser.id)
      .select("*")
      .single();

    if (syncingError || !syncingSource) {
      throw syncingError || new Error("Could not mark AI source as syncing.");
    }

    sourceForError = syncingSource;

    const vectorStoreId = existingVectorStoreId ||
      await createOpenAiVectorStore(context.universe.name, context.universe.id);
    const filename = `${safeSlug(context.universe.name)}-${contentHash.slice(0, 12)}.md`;
    const fileId = await uploadOpenAiCanonFile(filename, canonDocument);

    await attachFileToVectorStore(vectorStoreId, fileId);
    await waitForVectorStoreFile(vectorStoreId, fileId);

    if (existingFileId && existingFileId !== fileId) {
      await removeOpenAiFile(vectorStoreId, existingFileId);
    }

    const { data: updatedSource, error: updateError } = await supabase
      .from("universe_ai_sources")
      .update({
        vector_store_id: vectorStoreId,
        current_file_id: fileId,
        content_hash: contentHash,
        sync_status: "ready",
        sync_error: null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("universe_id", universeId)
      .eq("user_id", appUser.id)
      .select("*")
      .single();

    if (updateError || !updatedSource) {
      throw updateError || new Error("Could not save synced AI source.");
    }

    return jsonResponse({
      source: serializeSource(updatedSource),
      skipped: false,
    });
  } catch (error) {
    console.error(error);

    if (universeIdForError && appUserIdForError) {
      await supabase
        .from("universe_ai_sources")
        .update({
          sync_status: "error",
          sync_error: describeError(error, "Could not sync universe AI source.").error,
          updated_at: new Date().toISOString(),
        })
        .eq("universe_id", universeIdForError)
        .eq("user_id", appUserIdForError);
    } else if (sourceForError?.universe_id && sourceForError?.user_id) {
      await supabase
        .from("universe_ai_sources")
        .update({
          sync_status: "error",
          sync_error: describeError(error, "Could not sync universe AI source.").error,
          updated_at: new Date().toISOString(),
        })
        .eq("universe_id", sourceForError.universe_id)
        .eq("user_id", sourceForError.user_id);
    }

    return jsonResponse(describeError(error, "Could not sync universe AI source."), 500);
  }
});
