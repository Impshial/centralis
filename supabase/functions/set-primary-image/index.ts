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
    const imageId = String(body.imageId || "").trim();
    if (!imageId) {
      return jsonResponse({ error: "imageId is required." }, 400);
    }

    const supabase = createAdminClient();
    const { data: image, error: findError } = await supabase
      .from("image_table")
      .select("id,object_id,user_id")
      .eq("id", imageId)
      .maybeSingle();

    if (findError) {
      throw findError;
    }
    if (!image) {
      return jsonResponse({ error: "Image not found." }, 404);
    }
    if (image.user_id && image.user_id !== user.id) {
      return jsonResponse({ error: "You do not have permission to update this image." }, 403);
    }

    const { error: clearError } = await supabase
      .from("image_table")
      .update({ is_primary: false })
      .eq("object_id", image.object_id);

    if (clearError) {
      throw clearError;
    }

    const { data: updatedImage, error: setError } = await supabase
      .from("image_table")
      .update({ is_primary: true })
      .eq("id", imageId)
      .select("id,object_id,image_url,provider,prompt,generation_settings,is_primary,sort_order,created_at")
      .single();

    if (setError) {
      throw setError;
    }

    return jsonResponse({ image: updatedImage });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not set primary image."), 500);
  }
});
