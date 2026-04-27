import {
  createAdminClient,
  deleteImageObject,
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
    const imageId = String(body.imageId || "").trim();
    if (!imageId) {
      return jsonResponse({ error: "imageId is required." }, 400);
    }

    const supabase = createAdminClient();
    const { data: image, error: findError } = await supabase
      .from("image_table")
      .select("id,image_url,user_id")
      .eq("id", imageId)
      .maybeSingle();

    if (findError) {
      throw findError;
    }
    if (!image) {
      return jsonResponse({ error: "Image not found." }, 404);
    }
    if (image.user_id && image.user_id !== user.id) {
      return jsonResponse({ error: "You do not have permission to delete this image." }, 403);
    }

    await deleteImageObject(image.image_url);

    const { error: deleteError } = await supabase
      .from("image_table")
      .delete()
      .eq("id", imageId);

    if (deleteError) {
      throw deleteError;
    }

    return jsonResponse({ deleted: true, imageId });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not delete image."), 500);
  }
});
