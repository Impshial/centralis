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
      .select("id,object_id,image_url,user_id")
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
    const objectId = image.object_id;

    await deleteImageObject(image.image_url);

    const { error: deleteError } = await supabase
      .from("image_table")
      .delete()
      .eq("id", imageId);

    if (deleteError) {
      throw deleteError;
    }

    const { data: remainingImages, error: remainingError } = await supabase
      .from("image_table")
      .select("id,is_primary")
      .eq("object_id", objectId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (remainingError) {
      throw remainingError;
    }

    if (remainingImages?.length === 1 && !remainingImages[0].is_primary) {
      const { error: primaryError } = await supabase
        .from("image_table")
        .update({ is_primary: true })
        .eq("id", remainingImages[0].id);

      if (primaryError) {
        throw primaryError;
      }
    }

    return jsonResponse({ deleted: true, imageId });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not delete image."), 500);
  }
});
