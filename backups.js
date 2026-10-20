(() => {
  const panel = document.querySelector("[data-settings-panel=backups]");
  if (!panel) return;
  const form = panel.querySelector("[data-backup-settings]");
  const status = panel.querySelector("[data-backup-status]");
  const now = panel.querySelector("[data-backup-now]");
  let current = null, busy = false, timer = null, dirty = false;
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const date = value => value ? new Date(value).toLocaleString() : "Never";
  const message = text => { status.textContent = text; };
  function controls() {
    const active = current?.runs.some(run => ["queued", "running"].includes(run.status));
    const ready = current?.settings.last_worker_check && Date.now() - Date.parse(current.settings.last_worker_check) < 3 * 86400000;
    now.disabled = busy || !ready || active;
    form.querySelector("[type=submit]").disabled = busy || !current;
    form.elements.enabled.disabled = busy || !current;
    form.elements.retention_days.disabled = busy || !current;
    panel.querySelector("[data-backup-refresh]").disabled = busy;
  }
  async function rpc(action, options = {}) {
    const { data, error } = await window.centralisSupabase.rpc("centralis_backup_control", { p_action: action, p_options: options });
    if (error) throw error;
    return data;
  }
  function render(data) {
    current = data;
    const recent = data.settings.last_worker_check && Date.now() - Date.parse(data.settings.last_worker_check) < 3 * 86400000;
    panel.querySelector("[data-backup-health]").textContent = recent
      ? `${data.settings.enabled ? "Daily backups enabled" : "Daily backups paused"}. Last worker check: ${date(data.settings.last_worker_check)}.`
      : "Setup needed or worker unavailable. No recent worker check has been received.";
    panel.querySelector("[data-backup-setup]").open = !recent;
    if (!dirty) {
      form.elements.enabled.checked = data.settings.enabled;
      form.elements.retention_days.value = String(data.settings.retention_days);
    }
    panel.querySelector("[data-backup-history]").innerHTML = data.runs.length ? data.runs.map(run => {
      const link = /^https:\/\/github\.com\/Impshial\/centralis\/actions\/runs\/\d+$/.test(run.workflow_url || "")
        ? `<p><a href="${escape(run.workflow_url)}" target="_blank" rel="noopener">View worker run</a></p>` : "";
      return `<article class="backup-run"><header><strong>${escape(run.status)}</strong><span>${escape(date(run.requested_at))}</span></header>
        <p>${run.source === "daily" ? "Daily" : "Manual"} backup${run.file_count != null ? ` · ${Number(run.file_count).toLocaleString()} files · ${(Number(run.total_bytes) / 1048576).toFixed(1)} MB` : ""}</p>
        ${run.backup_prefix ? `<p>iDrive location: <code>centralis-backups/${escape(run.backup_prefix)}</code></p>` : ""}
        ${run.error ? `<p data-error>${escape(run.error)}</p>` : ""}
        ${run.retention_warning ? `<p>${escape(run.retention_warning)}</p>` : ""}${link}</article>`;
    }).join("") : "<p>No backups yet.</p>";
    controls();
    clearTimeout(timer);
    if (data.runs.some(run => ["queued", "running"].includes(run.status))) {
      timer = setTimeout(() => { if (!panel.hidden && !document.hidden) refresh(); }, 15000);
    }
  }
  async function refresh() {
    if (busy) return;
    busy = true; controls();
    try { render(await rpc("status")); message(""); }
    catch (error) { message(error.message || "Could not load backups."); }
    finally { busy = false; controls(); }
  }
  form.addEventListener("change", () => { dirty = true; });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const days = Number(form.elements.retention_days.value);
    if (days < current.settings.retention_days && !window.confirm(`Keep only ${days} days of backups? Older backup copies will be removed after the next successful backup.`)) return;
    busy = true; controls(); message("Saving…");
    try {
      const data = await rpc("settings", { enabled: form.elements.enabled.checked, retention_days: days });
      dirty = false; render(data); message("Backup settings saved.");
    } catch (error) { message(error.message || "Could not save backup settings."); }
    finally { busy = false; controls(); }
  });
  now.addEventListener("click", async () => {
    busy = true; controls(); message("Queueing backup…");
    try {
      render(await rpc("queue"));
      const { data, error } = await window.centralisSupabase.auth.getSession();
      if (error || !data.session) throw new Error("Backup queued. Sign in again to start the worker.");
      const response = await fetch("/api/backups", { method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Backup queued; the worker could not start.");
      message(result.message);
    } catch (error) { message(error.message || "Could not start backup."); }
    finally { busy = false; controls(); }
  });
  panel.querySelector("[data-backup-refresh]").addEventListener("click", refresh);
  document.querySelector("[data-settings-tab=backups]").addEventListener("click", refresh);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !panel.hidden) refresh(); });
  controls();
})();
