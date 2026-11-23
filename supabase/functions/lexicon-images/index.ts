import { createAdminClient, createSignedImageUrl, getAuthUser, handleCors, jsonResponse } from "../_shared/image-storage.ts";

// Unlike list-object-images, this endpoint never repairs primary-image flags.
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  let user;
  try { user = await getAuthUser(req); }
  catch { return jsonResponse({ error: "Sign in to load wiki images." }, 401); }
  try {
    const db = createAdminClient();
    const body = await req.json();
    const { data: profile, error: profileError } = await db.from("users").select("id").eq("clerk_user_id", user.id).single();
    if (profileError || !profile) return jsonResponse({ error: "Account unavailable." }, 403);
    const { data: wiki, error: wikiError } = await db.from("lexicon_wikis").select("universe_id")
      .eq("id", body.wikiId).eq("user_id", profile.id).single();
    if (wikiError || !wiki) return jsonResponse({ error: "Wiki unavailable." }, 404);
    if (!wiki.universe_id) return jsonResponse({ images: [] });
    const { data: universe } = await db.from("universes").select("id").eq("id", wiki.universe_id)
      .eq("user_id", profile.id).eq("deleted", false).maybeSingle();
    if (!universe) return jsonResponse({ images: [] });
    const requested = [...new Set((Array.isArray(body.objectIds) ? body.objectIds : []).map(String))].slice(0, 200);
    if (!requested.length) return jsonResponse({ images: [] });
    const { data: elements, error: elementError } = await db.from("elements").select("id")
      .eq("universe_id", universe.id).eq("user_id", profile.id).eq("deleted", false).in("id", requested);
    if (elementError) throw elementError;
    const allowed = new Set([universe.id, ...(elements || []).map(e => e.id)]);
    const ids = requested.filter(id => allowed.has(id));
    if (!ids.length) return jsonResponse({ images: [] });
    const { data, error } = await db.from("image_table")
      .select("id,object_id,image_url,is_primary,sort_order,created_at").in("object_id", ids)
      .eq("deleted", false).order("is_primary", { ascending: false }).order("sort_order").order("created_at");
    if (error) throw error;
    const first = new Map();
    for (const row of data || []) if (!first.has(row.object_id)) first.set(row.object_id, row);
    const images = await Promise.all([...first.values()].map(async row => ({
      ...row, image_url: await createSignedImageUrl(row.image_url),
    })));
    return jsonResponse({ images });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Could not load wiki images." }, 500);
  }
});
