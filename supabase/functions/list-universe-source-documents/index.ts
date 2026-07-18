import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import {
  getAppUser,
} from "../_shared/chat-storage.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const authUser = await getAuthUser(req);
    const appUser = await getAppUser(authUser.id);
    const body = await req.json().catch(() => ({}));
    const universeId = String(body?.universeId || "").trim();

    if (!universeId) {
      return jsonResponse({ error: "A universe is required." }, 400);
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

    const { data, error } = await supabase
      .from("universe_source_documents")
      .select("id,universe_id,user_id,original_filename,display_name,mime_type,file_size,created_at,updated_at")
      .eq("universe_id", universeId)
      .eq("user_id", appUser.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return jsonResponse({ documents: data || [] });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not load source documents."), 500);
  }
});
