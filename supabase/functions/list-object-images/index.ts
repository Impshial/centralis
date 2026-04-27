import {
  createAdminClient,
  createSignedImageUrl,
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
    await getAuthUser(req);
    const body = await req.json();
    const objectIds = Array.isArray(body.objectIds)
      ? body.objectIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    if (!objectIds.length) {
      return jsonResponse({ images: [] });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("image_table")
      .select("id,object_id,image_url,provider,prompt,generation_settings,is_primary,sort_order,created_at")
      .in("object_id", objectIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    const imagesByObjectId = new Map<string, NonNullable<typeof data>>();
    for (const image of data || []) {
      const group = imagesByObjectId.get(image.object_id) || [];
      group.push(image);
      imagesByObjectId.set(image.object_id, group);
    }

    for (const group of imagesByObjectId.values()) {
      if (group.length === 1 && !group[0].is_primary) {
        const { error: primaryError } = await supabase
          .from("image_table")
          .update({ is_primary: true })
          .eq("id", group[0].id);

        if (primaryError) {
          throw primaryError;
        }
        group[0].is_primary = true;
      }
    }

    const images = await Promise.all((data || []).map(async (image) => ({
      ...image,
      stored_image_url: image.image_url,
      image_url: await createSignedImageUrl(image.image_url),
    })));

    return jsonResponse({ images });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not load images."), 500);
  }
});
