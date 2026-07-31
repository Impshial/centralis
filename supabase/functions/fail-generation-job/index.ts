import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import { getImageGenerationUser } from "../_shared/image-generation.ts";

const ACTIVE_STATUSES = ["queued", "running"];
const EXPLICIT_JOB_STATUSES = ["queued", "running", "completed"];

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const authUser = await getAuthUser(req);
    const appUser = await getImageGenerationUser(authUser.id);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const jobId = cleanText(body.jobId, 120);
    const sourceId = cleanText(body.sourceId, 120);
    const sourceType = cleanText(body.sourceType, 120);
    const moduleName = cleanText(body.module, 80) || "god_engine";
    const errorMessage = cleanText(body.errorMessage, 800) || "Generation failed before completion.";
    const errorDetails = body.errorDetails && typeof body.errorDetails === "object"
      ? body.errorDetails as Record<string, unknown>
      : { message: errorMessage };

    const supabase = createAdminClient();
    let findQuery = supabase
      .from("generation_jobs")
      .select("id")
      .eq("user_id", appUser.id)
      .eq("deleted", false)
      .in("status", jobId ? EXPLICIT_JOB_STATUSES : ACTIVE_STATUSES);

    if (jobId) {
      findQuery = findQuery.eq("id", jobId);
    } else {
      if (!sourceId || !sourceType) {
        return jsonResponse({ error: "jobId or sourceId/sourceType is required." }, 400);
      }
      findQuery = findQuery
        .eq("module", moduleName)
        .eq("source_id", sourceId)
        .eq("source_type", sourceType);
    }

    const { data: matches, error: matchError } = await findQuery
      .order("created_at", { ascending: false })
      .limit(1);
    if (matchError) throw matchError;
    const latestJobId = matches?.[0]?.id;
    if (!latestJobId) return jsonResponse({ ok: true, jobs: [] });

    const { data, error } = await supabase
      .from("generation_jobs")
      .update({
        status: "failed",
        progress_label: "Failed",
        error_message: errorMessage,
        error_details: {
          ...errorDetails,
          source: "client_error_cleanup",
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", latestJobId)
      .eq("user_id", appUser.id)
      .eq("deleted", false)
      .select("*");
    if (error) throw error;
    return jsonResponse({ ok: true, jobs: data || [] });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not fail generation job."), 500);
  }
});
