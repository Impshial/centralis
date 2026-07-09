import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    const user = await getAuthUser(req);
    const body = await req.json();
    const objectId = String(body.objectId || "").trim();
    const exceptImageId = String(body.exceptImageId || "").trim();

    if (!objectId) {
      return jsonResponse({ error: "objectId is required." }, 400);
    }

    const supabase = createAdminClient();
    let query = supabase
      .from("image_table")
      .delete({ count: "exact" })
      .eq("object_id", objectId)
      .eq("user_id", user.id);

    if (exceptImageId) {
      query = query.neq("id", exceptImageId);
    }

    const { count, error } = await query;
    if (error) {
      throw error;
    }

    return jsonResponse({
      unlinked: true,
      objectId,
      exceptImageId: exceptImageId || null,
      count: count || 0,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not unlink image association."), 500);
  }
});
