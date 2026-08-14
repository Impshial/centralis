import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import { getAppUser } from "../_shared/chat-storage.ts";

const ACTIVE_STATUSES = ["queued", "running"];
const STALE_MS = 8 * 60 * 1000;

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const authUser = await getAuthUser(req);
    const appUser = await getAppUser(authUser.id);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const jobId = cleanText(body.jobId, 120);
    if (!jobId) {
      return jsonResponse({ error: "jobId is required." }, 400);
    }

    const supabase = createAdminClient();
    const staleCutoff = new Date(Date.now() - STALE_MS).toISOString();
    await supabase
      .from("generation_jobs")
      .update({
        status: "failed",
        progress_label: "Failed",
        error_message: "Manuscript breakdown timed out before returning outline guidance.",
        error_details: {
          source: "arc_manuscript_stale_cleanup",
          timeout_minutes: Math.round(STALE_MS / 60000),
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("user_id", appUser.id)
      .eq("module", "arc_studio")
      .eq("job_type", "manuscript_outline")
      .eq("deleted", false)
      .in("status", ACTIVE_STATUSES)
      .lt("updated_at", staleCutoff);

    const { data, error } = await supabase
      .from("generation_jobs")
      .select("id,status,progress_label,source_label,error_message,error_details,result_payload,created_at,updated_at,completed_at")
      .eq("id", jobId)
      .eq("user_id", appUser.id)
      .eq("module", "arc_studio")
      .eq("job_type", "manuscript_outline")
      .eq("deleted", false)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return jsonResponse({ error: "Manuscript breakdown job was not found." }, 404);
    }

    return jsonResponse({
      job: data,
      result: data.status === "completed" ? data.result_payload : null,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not load manuscript breakdown job."), 500);
  }
});
