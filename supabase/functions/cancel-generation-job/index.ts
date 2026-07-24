import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import { getImageGenerationUser } from "../_shared/image-generation.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const authUser = await getAuthUser(req);
    const appUser = await getImageGenerationUser(authUser.id);
    const body = await req.json();
    const jobId = String(body.jobId || "").trim();
    if (!jobId) return jsonResponse({ error: "jobId is required." }, 400);

    const supabase = createAdminClient();
    const { data: job, error: jobError } = await supabase
      .from("generation_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", appUser.id)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) return jsonResponse({ error: "Generation job was not found." }, 404);
    if (!["queued", "running"].includes(String(job.status))) {
      return jsonResponse({ job, ok: true });
    }

    if (job.source_message_id) {
      await supabase
        .from("image_generation_messages")
        .update({
          status: "failed",
          error_message: "Generation cancelled by user.",
          error_details: { cancelled: true, source: "generation_activity" },
        })
        .eq("id", job.source_message_id)
        .eq("user_id", appUser.id)
        .eq("status", "pending");
    }

    const { data: cancelled, error: cancelError } = await supabase
      .from("generation_jobs")
      .update({
        status: "cancelled",
        progress_label: "Cancelled",
        error_message: "Generation cancelled by user.",
        error_details: { cancelled: true },
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("user_id", appUser.id)
      .select("*")
      .single();
    if (cancelError) throw cancelError;

    return jsonResponse({ ok: true, job: cancelled });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not cancel this generation."), 500);
  }
});
