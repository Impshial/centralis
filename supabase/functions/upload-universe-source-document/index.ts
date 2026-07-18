import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import {
  createUniverseSourceDocumentKey,
  deleteUniverseSourceDocumentObject,
  getFileExtension,
  MAX_UNIVERSE_SOURCE_DOCUMENT_BYTES,
  SUPPORTED_SOURCE_DOCUMENT_EXTENSIONS,
  uploadUniverseSourceDocumentObject,
} from "../_shared/source-documents.ts";
import {
  getAppUser,
} from "../_shared/chat-storage.ts";

function cleanDisplayName(value: FormDataEntryValue | null) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  return name ? name.slice(0, 200) : null;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let uploadedKey = "";

  try {
    const authUser = await getAuthUser(req);
    const appUser = await getAppUser(authUser.id);
    const formData = await req.formData();
    const universeId = String(formData.get("universeId") || "").trim();
    const displayName = cleanDisplayName(formData.get("displayName"));
    const file = formData.get("file");

    if (!universeId) {
      return jsonResponse({ error: "A universe is required." }, 400);
    }

    if (!(file instanceof File) || !file.name) {
      return jsonResponse({ error: "Choose a source document to upload." }, 400);
    }

    const extension = getFileExtension(file.name);
    if (!SUPPORTED_SOURCE_DOCUMENT_EXTENSIONS.has(extension)) {
      return jsonResponse({ error: "Unsupported file type. Upload PDF, text, Markdown, HTML, RTF, Word, CSV/TSV, JSON, YAML, or XML files." }, 400);
    }

    if (file.size <= 0 || file.size > MAX_UNIVERSE_SOURCE_DOCUMENT_BYTES) {
      return jsonResponse({ error: "Source documents must be between 1 byte and 25 MB." }, 400);
    }

    const supabase = createAdminClient();
    const { data: universe, error: universeError } = await supabase
      .from("universes")
      .select("id,user_id")
      .eq("id", universeId)
      .eq("user_id", appUser.id)
      .single();

    if (universeError || !universe) {
      return jsonResponse({ error: "You do not have access to that universe." }, 403);
    }

    const documentId = crypto.randomUUID();
    uploadedKey = createUniverseSourceDocumentKey({
      authUserId: authUser.id,
      universeId,
      documentId,
      filename: file.name,
    });
    const bytes = new Uint8Array(await file.arrayBuffer());
    await uploadUniverseSourceDocumentObject({
      bytes,
      key: uploadedKey,
      contentType: file.type || "application/octet-stream",
    });

    const { data, error } = await supabase
      .from("universe_source_documents")
      .insert({
        id: documentId,
        universe_id: universeId,
        user_id: appUser.id,
        storage_key: uploadedKey,
        original_filename: file.name,
        display_name: displayName,
        mime_type: file.type || "application/octet-stream",
        file_size: file.size,
      })
      .select("id,universe_id,user_id,storage_key,original_filename,display_name,mime_type,file_size,created_at,updated_at")
      .single();

    if (error || !data) {
      throw error || new Error("Could not save source document metadata.");
    }

    return jsonResponse({ document: data });
  } catch (error) {
    if (uploadedKey) {
      try {
        await deleteUniverseSourceDocumentObject(uploadedKey);
      } catch (cleanupError) {
        console.error("Could not roll back uploaded universe source document:", cleanupError);
      }
    }

    console.error(error);
    return jsonResponse(describeError(error, "Could not upload source document."), 500);
  }
});
