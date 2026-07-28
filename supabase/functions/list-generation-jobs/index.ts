import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import { getImageGenerationUser } from "../_shared/image-generation.ts";

const ACTIVE_STATUSES = ["queued", "running"];

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const authUser = await getAuthUser(req);
    const appUser = await getImageGenerationUser(authUser.id);
    const body = await req.json().catch(() => ({}));
    const includeRecent = body.includeRecent !== false;
    const supabase = createAdminClient();

    const activeQuery = supabase
      .from("generation_jobs")
      .select("*")
      .eq("user_id", appUser.id)
      .eq("deleted", false)
      .eq("job_type", "image")
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false });
    const recentQuery = supabase
      .from("generation_jobs")
      .select("*")
      .eq("user_id", appUser.id)
      .eq("deleted", false)
      .eq("job_type", "image")
      .in("status", ["completed", "failed", "cancelled"])
      .order("updated_at", { ascending: false })
      .limit(25);

    const [{ data: active, error: activeError }, { data: recent, error: recentError }] = await Promise.all([
      activeQuery,
      includeRecent ? recentQuery : Promise.resolve({ data: [], error: null }),
    ]);
    if (activeError) throw activeError;
    if (recentError) throw recentError;

    const staleCutoff = Date.now() - 30 * 60 * 1000;
    const jobs = [...(active || []), ...(recent || [])].map((job) => ({
      ...job,
      possibly_stalled: ACTIVE_STATUSES.includes(String(job.status)) && new Date(job.updated_at || job.created_at).getTime() < staleCutoff,
    }));

    return jsonResponse({ jobs, activeCount: (active || []).length });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not load generation activity."), 500);
  }
});
