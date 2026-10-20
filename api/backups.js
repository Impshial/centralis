// The browser can request a workflow, but never receives GitHub or storage credentials.
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  const respond = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (req.method !== "POST") return respond(405, { error: "Use POST." });
  const authorization = req.headers.authorization || "";
  if (!/^Bearer \S+$/i.test(authorization)) return respond(401, { error: "Sign in first." });
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const apikey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEYS || process.env.SUPABASE_ANON_KEY;
  if (!url || !apikey) return respond(503, { error: "Backup authentication is not configured." });
  try {
    // This RPC checks the authenticated user's admin flag on the server.
    const check = await fetch(`${url}/rest/v1/rpc/centralis_backup_control`, {
      method: "POST", headers: { apikey, Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ p_action: "status" }),
    });
    if (!check.ok) return respond(403, { error: "Only administrators can start backups." });
    const state = await check.json();
    if (!state.runs?.some(run => run.status === "queued")) {
      return respond(409, { error: "Queue a backup before starting the worker." });
    }
    if (!process.env.GITHUB_BACKUP_TOKEN) {
      return respond(503, { error: "Backup queued. Configure GITHUB_BACKUP_TOKEN on the server to start it immediately; otherwise the next scheduled worker will pick it up." });
    }
    const dispatch = await fetch("https://api.github.com/repos/Impshial/centralis/actions/workflows/centralis-backup.yml/dispatches", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GITHUB_BACKUP_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
      body: JSON.stringify({ ref: "master" }),
    });
    if (!dispatch.ok) return respond(502, { error: "Backup queued, but the worker could not start. Check the GitHub Actions connection." });
    return respond(202, { message: "Backup queued. The worker is starting." });
  } catch {
    return respond(502, { error: "Could not reach the backup worker. Refresh to check the queued request." });
  }
};
