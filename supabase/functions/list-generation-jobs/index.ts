import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import { getImageGenerationUser } from "../_shared/image-generation.ts";

const ACTIVE_STATUSES = ["queued", "running"];
const GOD_IMAGE_SOURCE_TYPES = ["god_species_image", "god_species_high_image"];
const GOD_IMAGE_STALE_MS = 6 * 60 * 1000;
const FAILED_VISIBLE_MS = 45 * 60 * 1000;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const authUser = await getAuthUser(req);
    const appUser = await getImageGenerationUser(authUser.id);
    const body = await req.json().catch(() => ({}));
    const includeRecent = body.includeRecent !== false;
    const supabase = createAdminClient();
    const staleGodImageCutoff = new Date(Date.now() - GOD_IMAGE_STALE_MS).toISOString();
    await supabase
      .from("generation_jobs")
      .update({
        status: "failed",
        progress_label: "Failed",
        error_message: "Image generation timed out before returning an image.",
        error_details: {
          source: "generation_activity_stale_cleanup",
          reason: "God Engine image generation stayed active past the timeout window.",
          timeout_minutes: Math.round(GOD_IMAGE_STALE_MS / 60000),
        },
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", appUser.id)
      .eq("deleted", false)
      .eq("job_type", "image")
      .eq("module", "god_engine")
      .in("source_type", GOD_IMAGE_SOURCE_TYPES)
      .in("status", ACTIVE_STATUSES)
      .lt("updated_at", staleGodImageCutoff);

    const activeQuery = supabase
      .from("generation_jobs")
      .select("*")
      .eq("user_id", appUser.id)
      .eq("deleted", false)
      .eq("job_type", "image")
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false });
    const recentSettledQuery = supabase
      .from("generation_jobs")
      .select("*")
      .eq("user_id", appUser.id)
      .eq("deleted", false)
      .eq("job_type", "image")
      .in("status", ["completed", "cancelled"])
      .order("updated_at", { ascending: false })
      .limit(25);
    const recentFailedQuery = supabase
      .from("generation_jobs")
      .select("*")
      .eq("user_id", appUser.id)
      .eq("deleted", false)
      .eq("job_type", "image")
      .eq("status", "failed")
      .gte("updated_at", new Date(Date.now() - FAILED_VISIBLE_MS).toISOString())
      .order("updated_at", { ascending: false })
      .limit(10);

    const [
      { data: active, error: activeError },
      { data: recentSettled, error: recentSettledError },
      { data: recentFailed, error: recentFailedError },
    ] = await Promise.all([
      activeQuery,
      includeRecent ? recentSettledQuery : Promise.resolve({ data: [], error: null }),
      includeRecent ? recentFailedQuery : Promise.resolve({ data: [], error: null }),
    ]);
    if (activeError) throw activeError;
    if (recentSettledError) throw recentSettledError;
    if (recentFailedError) throw recentFailedError;

    const staleCutoff = Date.now() - 30 * 60 * 1000;
    const recentById = new Map([...(recentFailed || []), ...(recentSettled || [])].map((job) => [job.id, job]));
    const jobs = [...(active || []), ...recentById.values()].map((job) => ({
      ...job,
      possibly_stalled: ACTIVE_STATUSES.includes(String(job.status)) && new Date(job.updated_at || job.created_at).getTime() < staleCutoff,
    }));

    return jsonResponse({ jobs, activeCount: (active || []).length });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not load generation activity."), 500);
  }
});
