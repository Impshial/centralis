import { createAdminClient } from "./image-storage.ts";

export type GenerationJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export async function createGenerationJob(input: {
  userId: number;
  module: "image_generation" | "universe_builder" | "stellar_architect";
  sourceType?: string;
  sourceId?: string | null;
  sourceLabel?: string | null;
  prompt?: string | null;
  model?: string | null;
  parameters?: Record<string, unknown> | null;
  sourceMessageId?: string | null;
  progressLabel?: string | null;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("generation_jobs")
    .insert({
      user_id: input.userId,
      module: input.module,
      job_type: "image",
      source_type: input.sourceType || "unknown",
      source_id: input.sourceId || null,
      source_label: input.sourceLabel || null,
      prompt: input.prompt || "",
      model: input.model || null,
      parameters: input.parameters || {},
      source_message_id: input.sourceMessageId || null,
      progress_label: input.progressLabel || "Queued",
      status: "queued",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateGenerationJob(jobId: string | null | undefined, patch: {
  status?: GenerationJobStatus;
  progressLabel?: string | null;
  resultImageId?: string | null;
  resultAssetId?: string | null;
  errorMessage?: string | null;
  errorDetails?: Record<string, unknown> | null;
}) {
  if (!jobId) return null;
  const row: Record<string, unknown> = {};
  if (patch.status) {
    row.status = patch.status;
    if (patch.status === "running") row.started_at = new Date().toISOString();
    if (["completed", "failed", "cancelled"].includes(patch.status)) row.completed_at = new Date().toISOString();
  }
  if ("progressLabel" in patch) row.progress_label = patch.progressLabel;
  if ("resultImageId" in patch) row.result_image_id = patch.resultImageId;
  if ("resultAssetId" in patch) row.result_asset_id = patch.resultAssetId;
  if ("errorMessage" in patch) row.error_message = patch.errorMessage;
  if ("errorDetails" in patch) row.error_details = patch.errorDetails;

  const { data, error } = await createAdminClient()
    .from("generation_jobs")
    .update(row)
    .eq("id", jobId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}
