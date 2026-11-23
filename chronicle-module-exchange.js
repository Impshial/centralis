(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChronicleModuleExchange = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FORMAT = 'centralis.chronicle.modules';
  const VERSION = 1;
  const key = field => JSON.stringify([field.kind, field.id]);
  const empty = value => value == null || typeof value === 'string' && !value.trim();
  const display = value => value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);

  function validate(value, field) {
    if (empty(value) || field.type === 'multi_select' && Array.isArray(value) && !value.length) return { skip: true };
    const error = message => ({ error: message });
    if (field.type === 'number') return typeof value === 'number' && Number.isFinite(value) ? { value } : error('Use a JSON number.');
    if (field.type === 'checkbox') return typeof value === 'boolean' ? { value } : error('Use true or false.');
    if (field.type === 'multi_select') {
      if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) return error('Use an array of allowed choices.');
      if (value.some(v => !field.choices.includes(v))) return error('Contains an invalid choice.');
      if (new Set(value).size !== value.length) return error('Contains duplicate choices.');
      return { value: field.choices.filter(v => value.includes(v)) };
    }
    if (typeof value !== 'string') return error('Use a string.');
    if (field.type === 'select' && !field.choices.includes(value)) return error('Choose one of the allowed choices.');
    if (field.type === 'date') {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00Z') : null;
      if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return error('Use a valid date in YYYY-MM-DD format.');
    }
    if (field.type === 'url') {
      try { new URL(value); } catch { return error('Use a complete URL.'); }
    }
    return { value };
  }

  function fromStored(value, field) {
    if (empty(value)) return null;
    if (field.type === 'number') return Number(value);
    if (field.type === 'checkbox') return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
    if (field.type === 'multi_select') return Array.isArray(value) ? value : String(value).split('\n').filter(Boolean);
    return String(value);
  }
  const toStored = value => Array.isArray(value) ? value.join('\n') : String(value);

  function assess(field, incoming) {
    const result = validate(incoming, field);
    if (result.error) return { status: 'invalid', message: result.error };
    if (result.skip) return { status: 'skipped', message: 'No value supplied. Keeps the current value.' };
    const current = fromStored(field.value, field);
    const normalized = validate(current, field);
    if (!normalized.error && !normalized.skip && JSON.stringify(normalized.value) === JSON.stringify(result.value)) return { status: 'unchanged', message: 'Unchanged.' };
    return { status: current === null ? 'new' : 'conflict', message: current === null ? 'Empty field.' : 'Current value differs. Keep current unless selected.', stored: toStored(result.value) };
  }

  function exportModules(workspace, selectedIds, includeValues = false) {
    if (!workspace.element?.id || !workspace.templateId) throw new Error('Choose an element and template first.');
    const selected = new Set(selectedIds);
    const modules = workspace.modules.filter(m => selected.has(m.sectionId)).map(m => ({
      sectionId: m.sectionId, label: m.label,
      fields: m.fields.map(f => {
        const value = includeValues ? fromStored(f.value, f) : null;
        const result = validate(value, f);
        if (result.error) throw new Error(`${m.label} / ${f.label}: ${result.error} Correct the draft before exporting current values.`);
        return { kind: f.kind, id: f.id, label: f.label, type: f.type, hint: f.hint || '', ...(f.choices ? { choices: f.choices } : {}), value: result.skip ? null : result.value };
      })
    }));
    if (!modules.length) throw new Error('Select at least one assigned module.');
    return { format: FORMAT, version: VERSION, element: workspace.element, templateId: workspace.templateId, modules };
  }

  function parse(text) {
    let source = String(text).trim();
    const fence = source.match(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
    if (fence) source = fence[1];
    try { return JSON.parse(source); } catch (error) { throw new Error('Invalid JSON: ' + error.message); }
  }
  const fingerprint = workspace => JSON.stringify(workspace);
  const counts = values => values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map());
  const record = value => value && typeof value === 'object' && !Array.isArray(value);

  function review(payload, workspace) {
    if (!record(payload) || payload.format !== FORMAT) throw new Error('Use a Chronicle module export with format "' + FORMAT + '".');
    if (payload.version !== VERSION) throw new Error('Unsupported format version. Export a new template from Chronicle.');
    if (payload.element?.id !== workspace.element?.id) throw new Error('Target mismatch: this file belongs to another element.');
    if (!workspace.templateId || payload.templateId !== workspace.templateId) throw new Error('Template mismatch: export a template for the active Chronicle template.');
    if (!Array.isArray(payload.modules)) throw new Error('The modules property must be an array.');
    const sectionCounts = counts(payload.modules.map(m => m?.sectionId));
    const fieldCounts = counts(payload.modules.flatMap(m => Array.isArray(m?.fields) ? m.fields.map(f => key(f || {})) : []));
    const available = new Map(workspace.modules.map(m => [m.sectionId, m]));
    const allFields = new Map(workspace.modules.flatMap(m => m.fields.map(f => [key(f), m.sectionId])));
    const groups = payload.modules.map((incoming, mi) => {
      const section = available.get(incoming?.sectionId);
      const moduleError = !record(incoming) ? 'Invalid module entry.' : sectionCounts.get(incoming.sectionId) > 1 ? 'Duplicate module entry.' : !section ? 'Unknown, removed, or unassigned module.' : null;
      const group = { label: section?.label || incoming?.label || incoming?.sectionId || 'Unknown module', sectionId: incoming?.sectionId, rows: [] };
      if (!Array.isArray(incoming?.fields) || !incoming.fields.length) {
        group.issue = moduleError || (!Array.isArray(incoming?.fields) ? 'The fields property must be an array.' : 'No fields supplied.');
        return group;
      }
      group.rows = incoming.fields.map((input, fi) => {
        const field = section?.fields.find(f => key(f) === key(input || {}));
        const error = moduleError || (!record(input) ? 'Invalid field entry.' : fieldCounts.get(key(input)) > 1 ? 'Duplicate field entry.' : !['template', 'custom'].includes(input.kind) ? 'Unknown field kind.' : !field ? allFields.has(key(input)) ? 'Field belongs to another module.' : 'Unknown, deleted, or excluded field.' : null);
        const assessment = error ? { status: 'invalid', message: error } : assess(field, input.value);
        return { token: `${mi}:${fi}`, sectionId: group.sectionId, field, input, label: field?.label || input?.label || input?.id || 'Unknown field', structuralError: error, ...assessment, selected: assessment.status === 'new' };
      });
      return group;
    });
    return { payload, groups, fingerprint: fingerprint(workspace) };
  }

  function plan(workspace, reviewed) {
    if (fingerprint(workspace) !== reviewed.fingerprint) throw new Error('The draft or modules changed. Review the updated comparisons before applying.');
    const fresh = review(reviewed.payload, workspace);
    const selected = new Set(reviewed.groups.flatMap(g => g.rows.filter(r => r.selected).map(r => r.token)));
    const rows = fresh.groups.flatMap(g => g.rows);
    const changes = rows.filter(r => selected.has(r.token) && ['new', 'conflict'].includes(r.status)).map(r => ({ sectionId: r.sectionId, kind: r.field.kind, id: r.field.id, value: r.stored }));
    return { changes, skipped: rows.length - changes.length };
  }

  function instructions(payload) {
    return `Fill Chronicle module values for ${payload.element.name}.\nModules: ${payload.modules.map(m => m.label).join(', ')}.\nUse the supplied field types, hints, and allowed choices. Keep Markdown, paragraph breaks, and Unicode in text values. Use JSON numbers, booleans for checkboxes, arrays for multi-selects, and strings for other fields. Null, blank, or omitted values are skipped; they do not clear existing text.\n\nKeep the identifiers as supplied. Return JSON for the fields you can fill from the material I provide. You may omit any other field or module.\n\n${JSON.stringify(payload, null, 2)}`;
  }
  function filename(name) {
    return (String(name).normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, '-').replace(/^[. -]+|[. -]+$/g, '').slice(0, 100) || 'element') + '-chronicle-modules.json';
  }
  return { FORMAT, VERSION, validate, assess, fromStored, toStored, display, exportModules, parse, review, plan, fingerprint, instructions, filename };
});
