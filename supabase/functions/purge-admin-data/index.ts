import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";

const ALLOWED_DATASETS = new Set([
  "universes",
  "elements",
  "element_types",
  "templates",
  "chronicle",
  "chat_repositories",
  "calendars",
  "todo",
  "source_documents",
  "image_generation",
  "movies",
  "episode_roulette",
  "stellar",
  "users",
]);

function normalizeUserIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

function normalizeDatasets(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter((item) => ALLOWED_DATASETS.has(item)))];
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authUser = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const allUsers = body.allUsers === true;
    const userIds = normalizeUserIds(body.userIds);
    const datasets = normalizeDatasets(body.datasets);
    const confirmation = String(body.confirmation || "").trim();

    if (!allUsers && !userIds.length) return jsonResponse({ error: "Select at least one user." }, 400);
    if (!datasets.length) return jsonResponse({ error: "Select at least one dataset." }, 400);
    if (confirmation !== "PURGE") return jsonResponse({ error: "Type PURGE to confirm this destructive action." }, 400);

    const { data, error } = await createAdminClient().rpc("admin_purge_data", {
      p_actor_auth_id: authUser.id,
      p_user_ids: userIds,
      p_all_users: allUsers,
      p_datasets: datasets,
    });

    if (error) throw error;
    return jsonResponse(data);
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not purge admin data."), 500);
  }
});
