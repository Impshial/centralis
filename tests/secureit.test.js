"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function node() {
  return {
    hidden: true,
    innerHTML: "",
    textContent: "",
    classList: { toggle() {} },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    replaceChildren() { this.innerHTML = ""; },
  };
}

function harness({ clipboard } = {}) {
  const tables = { secureit_collections: [], secureit_items: [] };
  let failReads = false;
  const supabase = {
    from(table) {
      let inserted;
      const query = {
        select() { return query; },
        eq() { return query; },
        order() { return query; },
        insert(value) { inserted = value; return query; },
        single() {
          const data = { ...inserted, id: "saved-item", created_at: new Date().toISOString() };
          tables[table].push(data);
          return Promise.resolve({ data, error: null });
        },
        then(resolve, reject) {
          return Promise.resolve(failReads
            ? { error: { message: "Connection interrupted" } }
            : { data: tables[table], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const context = vm.createContext({
    window: { centralisSupabase: supabase, crypto: webcrypto, setTimeout() {} },
    navigator: { clipboard },
    crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, btoa, atob,
    document: {
      addEventListener() {},
      createElement() {
        return {
          textContent: "",
          get innerHTML() { return this.textContent.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); },
        };
      },
    },
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "secureit.js"), "utf8");
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
    globalThis.api = { state, dom, handleUnlock, handleItemSubmit, lockVault,
      importAesKey, wrapVaultKey, encryptJson, decryptJson, setSecretVisibility,
      itemTypeFields, renderTypeFields, handleDetailChange, copyItemField,
      customFieldDefinitions, itemFieldDrafts, syncCustomFieldOptions };
  })();`), context);
  const api = context.api;
  for (const key of ["workspace", "locked", "unlockedActions", "recoveryReveal", "setup", "unlock", "recovery", "unlockStatus", "collections", "items", "detail", "status", "listTitle"]) {
    api.dom[key] = node();
  }
  api.state.user = { id: "test-user" };
  api.dom.detail.querySelector = () => ({});
  return { api, tables, failReads() { failReads = true; } };
}

async function seedVault(h) {
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const salt = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64");
  h.api.state.vault = {
    salt,
    kdf_iterations: 1000,
    wrapped_key: await h.api.wrapVaultKey(rawKey, "test passphrase", salt, 1000),
  };
  h.api.state.vaultKey = await h.api.importAesKey(rawKey);
  h.tables.secureit_collections.push({
    id: "collection-1",
    encrypted_payload: await h.api.encryptJson({ name: "General", color: "#38bdf8" }),
  });
  h.api.state.vaultKey = null;
}

function unlockForm(value) {
  const submit = { disabled: false };
  return {
    elements: { passphrase: { value } },
    submit,
    resets: 0,
    querySelector() { return submit; },
    querySelectorAll() { return []; },
    reset() { this.resets += 1; this.elements.passphrase.value = ""; },
  };
}

test("correct passphrase unlocks after the submit event has finished dispatching", async () => {
  const h = harness();
  await seedVault(h);
  const form = unlockForm("test passphrase");
  h.api.dom.unlockForm = form;
  const event = { currentTarget: form, preventDefault() {} };
  const pending = h.api.handleUnlock(event);
  event.currentTarget = null;
  assert.equal(form.submit.disabled, true);
  await pending;
  assert.equal(h.api.state.unlocked, true);
  assert.equal(h.api.dom.workspace.hidden, false);
  assert.equal(h.api.state.collections[0].payload.name, "General");
  assert.equal(form.resets, 1);
  assert.equal(form.submit.disabled, false);
  assert.equal(h.api.dom.unlockStatus.textContent, "");
  h.api.lockVault();
  assert.equal(h.api.state.vaultKey, null);
  assert.equal(h.api.dom.collections.innerHTML, "");
  assert.equal(h.api.dom.detail.innerHTML, "");
});

test("an incorrect passphrase keeps the vault locked and allows retry", async () => {
  const h = harness();
  await seedVault(h);
  const form = unlockForm("incorrect passphrase");
  await h.api.handleUnlock({ currentTarget: form, preventDefault() {} });
  assert.equal(h.api.state.unlocked, false);
  assert.equal(h.api.state.vaultKey, null);
  assert.match(h.api.dom.unlockStatus.textContent, /passphrase could not unlock/);
  assert.equal(form.submit.disabled, false);
  assert.equal(form.resets, 0);
});

test("data loading failures are not reported as incorrect passphrases", async () => {
  const h = harness();
  await seedVault(h);
  h.failReads();
  const form = unlockForm("test passphrase");
  await h.api.handleUnlock({ currentTarget: form, preventDefault() {} });
  assert.match(h.api.dom.unlockStatus.textContent, /Could not load your vault: Connection interrupted/);
  assert.equal(h.api.state.unlocked, false);
  assert.equal(h.api.state.vaultKey, null);
  assert.equal(form.submit.disabled, false);
});

test("a delegated item submission reads the form and stores encrypted content", async () => {
  const h = harness();
  await seedVault(h);
  await h.api.handleUnlock({ currentTarget: unlockForm("test passphrase"), preventDefault() {} });
  const values = { item_id: "", type: "api_key", title: "Example service", collection_id: "collection-1", notes: "Private note", "field:key": "test-api-key" };
  const elements = Object.entries(values).map(([name, value]) => ({ name, value }));
  elements.forEach((element) => { elements[element.name] = element; });
  const form = { elements, querySelector: () => node(), closest() { return form; } };
  await h.api.handleItemSubmit({ target: form, currentTarget: h.api.dom.detail, preventDefault() {} });
  assert.equal(h.tables.secureit_items.length, 1);
  const stored = h.tables.secureit_items[0];
  assert.equal(JSON.stringify(stored).includes("test-api-key"), false);
  const decrypted = await h.api.decryptJson(stored.encrypted_payload);
  assert.equal(decrypted.fields.key, "test-api-key");
  assert.equal(decrypted.title, "Example service");
  assert.equal(h.api.dom.status.textContent, "SecureIt item saved.");
});

test("passphrase visibility toggles text, accessible label, and icon together", () => {
  const h = harness();
  const input = { name: "passphrase", type: "password" };
  const attrs = {};
  const button = {
    closest: () => ({ querySelector: () => input }),
    setAttribute: (key, value) => { attrs[key] = value; },
  };
  h.api.setSecretVisibility(button, true);
  assert.equal(input.type, "text");
  assert.equal(attrs["aria-label"], "Hide passphrase");
  assert.equal(attrs["aria-pressed"], "true");
  assert.match(button.innerHTML, /ph-eye-slash/);
  h.api.setSecretVisibility(button, false);
  assert.equal(input.type, "password");
  assert.equal(attrs["aria-label"], "Show passphrase");
  assert.equal(attrs["aria-pressed"], "false");
});

test("built-in types show only their own fields, including all six Login fields", () => {
  const { api } = harness();
  const payload = { fields: { service: "Example", key: "private-key", environment: "Test", website: "https://example.test" } };
  const keys = (type) => Array.from(api.itemTypeFields(type, payload), ([key]) => key);
  assert.deepEqual(keys("login"), ["website", "username", "password", "service", "key", "environment"]);
  assert.deepEqual(keys("api_key"), ["service", "key", "environment"]);
  assert.deepEqual(keys("secure_note"), []);
  assert.deepEqual(keys("idea"), ["topic"]);
  assert.deepEqual(keys("custom"), ["custom_type"]);
  assert.equal(api.renderTypeFields("secure_note", payload), "");
  assert.doesNotMatch(api.renderTypeFields("idea", payload), /name="field:(service|key|environment)"/);
  assert.equal((api.renderTypeFields("login", payload).match(/data-secureit-copy-field=/g) || []).length, 6);
  assert.equal((api.renderTypeFields("api_key", payload).match(/data-secureit-copy-field=/g) || []).length, 3);
});

test("changing type updates the text label and preserves draft values without leaking fields", () => {
  const { api } = harness();
  const typeFields = node();
  const label = node();
  const status = node();
  status.textContent = "Key copied.";
  const form = {
    elements: [{ name: "field:key", value: "draft-secret" }],
    querySelector: (selector) => selector === "[data-secureit-type-fields]" ? typeFields : selector === "[data-secureit-notes-label]" ? label : status,
  };
  const change = (value) => api.handleDetailChange({ target: { value, matches: () => true, closest: () => form } });
  change("idea");
  assert.equal(label.textContent, "Idea");
  assert.equal(status.textContent, "");
  assert.doesNotMatch(typeFields.innerHTML, /draft-secret|name="field:key"/);
  form.elements = [{ name: "field:topic", value: "New topic" }];
  change("api_key");
  assert.equal(label.textContent, "Notes");
  assert.match(typeFields.innerHTML, /value="draft-secret"/);
  assert.doesNotMatch(typeFields.innerHTML, /name="field:topic"/);
  form.elements = [{ name: "field:key", value: "" }];
  change("secure_note");
  assert.equal(typeFields.innerHTML, "");
  form.elements = [];
  change("api_key");
  assert.doesNotMatch(typeFields.innerHTML, /draft-secret/);
});

function fieldCopyButton(input, status) {
  return {
    dataset: { secureitCopyField: "Password" },
    innerHTML: '<ph-copy></ph-copy>',
    closest: (selector) => selector === ".form-field"
      ? { querySelector: () => input }
      : { querySelector: () => status },
  };
}

test("field copy uses the current input value and keeps passwords masked", async () => {
  let copied;
  const { api } = harness({ clipboard: { async writeText(value) { copied = value; } } });
  const input = { type: "password", value: ' current "draft" password ' };
  const status = node();
  const button = fieldCopyButton(input, status);
  await api.copyItemField(button);
  assert.equal(copied, input.value);
  assert.equal(input.type, "password");
  assert.equal(button.disabled, false);
  assert.match(button.innerHTML, /ph-check/);
  assert.equal(status.textContent, "Password copied.");
});

test("clipboard failures report an error and leave the copy button available", async () => {
  const { api } = harness({ clipboard: { async writeText() { throw new Error("Permission denied"); } } });
  const status = node();
  const button = fieldCopyButton({ type: "password", value: "sample" }, status);
  await api.copyItemField(button);
  assert.match(status.textContent, /Could not copy password/);
  assert.equal(button.disabled, false);
  assert.doesNotMatch(button.innerHTML, /ph-check/);
});

test("Custom fields are explicit while older populated Custom fields remain available", () => {
  const { api } = harness();
  const legacy = { type: "custom", fields: { custom_type: "Bucket", website: "", key: "saved-key", location: "Example" } };
  assert.deepEqual(Array.from(api.customFieldDefinitions(legacy), (field) => field.key), ["key", "location"]);
  assert.equal(api.customFieldDefinitions({ ...legacy, customFields: [] }).length, 0);
  assert.equal(api.customFieldDefinitions({ ...legacy, type: "login" }).length, 0);
  const definition = { key: "custom_instructions", label: 'Instructions & "notes"', kind: "multiline" };
  const html = api.renderTypeFields("custom", { customFields: [definition], fields: { custom_instructions: "line 1\n<line 2>" } });
  assert.match(html, /<textarea[^>]*name="field:custom_instructions"/);
  assert.match(html, /line 1\n&lt;line 2&gt;/);
  assert.match(html, /data-secureit-remove-field="custom_instructions"/);
  assert.doesNotMatch(html, /name="field:(website|username|password|service|key|environment)"/);
});

test("custom field copy and password options override name-based behavior", () => {
  const { api } = harness();
  const render = (field) => api.renderTypeFields("custom", { customFields: [field] });
  const plain = render({ key: "custom_secret", label: "Plain", kind: "text", copyButton: false, passwordBehavior: false });
  assert.doesNotMatch(plain, /data-secureit-copy-field|data-secureit-reveal-secret|type="password"/);
  const copy = render({ key: "custom_location", label: "Location", kind: "text", copyButton: true, passwordBehavior: false });
  assert.match(copy, /data-secureit-copy-field="Location"/);
  assert.doesNotMatch(copy, /data-secureit-reveal-secret|type="password"/);
  const password = render({ key: "custom_access", label: "Access", kind: "text", copyButton: false, passwordBehavior: true });
  assert.match(password, /type="password" name="field:custom_access"/);
  assert.match(password, /data-secureit-reveal-secret/);
  assert.match(password, /data-secureit-copy-field="Access"/);
  const legacy = render({ key: "key", label: "Key", kind: "text" });
  assert.match(legacy, /type="password"/);
  assert.match(legacy, /data-secureit-copy-field="Key"/);
});

test("multiline copy belongs in the label row and never enables password behavior", () => {
  const { api } = harness();
  const field = { key: "custom_secret", label: "Details", kind: "multiline", copyButton: true, passwordBehavior: true };
  const html = api.renderTypeFields("custom", { customFields: [field] });
  assert.match(html, /class="secureit-field-actions">[^]*data-secureit-copy-field="Details"[^]*<\/div>\s*<\/div>\s*<textarea/);
  assert.doesNotMatch(html, /secureit-copy-field"|data-secureit-reveal-secret|type="password"/);
  const normalized = api.customFieldDefinitions({ customFields: [field] })[0];
  assert.equal(normalized.passwordBehavior, false);
  assert.equal(normalized.copyButton, true);
  const noCopy = api.renderTypeFields("custom", { customFields: [{ ...field, copyButton: false }] });
  assert.doesNotMatch(noCopy, /data-secureit-copy-field|data-secureit-reveal-secret/);
});

test("popup options require copy for passwords and disable passwords for multiline", () => {
  const { api } = harness();
  const fields = {
    field_kind: { value: "text" },
    copy_button: { checked: false },
    password_behavior: { checked: true },
  };
  api.dom.fieldForm = { elements: fields };
  api.syncCustomFieldOptions();
  assert.equal(fields.copy_button.checked, true);
  assert.equal(fields.copy_button.disabled, true);
  assert.equal(fields.password_behavior.disabled, false);
  fields.field_kind.value = "multiline";
  api.syncCustomFieldOptions();
  assert.equal(fields.password_behavior.checked, false);
  assert.equal(fields.password_behavior.disabled, true);
  assert.equal(fields.copy_button.disabled, false);
  fields.field_kind.value = "text";
  api.syncCustomFieldOptions();
  assert.equal(fields.password_behavior.checked, false);
  assert.equal(fields.password_behavior.disabled, false);
  fields.password_behavior.checked = true;
  api.syncCustomFieldOptions();
  fields.password_behavior.checked = false;
  api.syncCustomFieldOptions();
  assert.equal(fields.copy_button.disabled, false);
  fields.copy_button.checked = false;
  api.syncCustomFieldOptions();
  assert.equal(fields.copy_button.checked, false);
});

test("custom field names, kinds, options, and values are encrypted together when saved", async () => {
  const h = harness();
  await seedVault(h);
  await h.api.handleUnlock({ currentTarget: unlockForm("test passphrase"), preventDefault() {} });
  const customFields = [
    { key: "custom_bucket", label: "Bucket Name", kind: "text", copyButton: false, passwordBehavior: false },
    { key: "custom_details", label: "Details", kind: "multiline", copyButton: true, passwordBehavior: false },
    { key: "key", label: "Key", kind: "text", copyButton: true, passwordBehavior: true },
  ];
  const values = { item_id: "", type: "custom", title: "Storage", collection_id: "collection-1", notes: "", "field:custom_type": "iDrive Bucket", "field:custom_bucket": "private-bucket", "field:custom_details": "First line\nSecond line", "field:key": "private-key" };
  const elements = Object.entries(values).map(([name, value]) => ({ name, value }));
  elements.forEach((element) => { elements[element.name] = element; });
  const form = { elements, querySelector: () => node(), closest() { return form; } };
  h.api.itemFieldDrafts.set(form, { fields: {}, customFields });
  await h.api.handleItemSubmit({ target: form, currentTarget: h.api.dom.detail, preventDefault() {} });
  const stored = h.tables.secureit_items[0];
  assert.equal(JSON.stringify(stored).includes("private-bucket"), false);
  assert.equal(JSON.stringify(stored).includes("Bucket Name"), false);
  const decrypted = await h.api.decryptJson(stored.encrypted_payload);
  assert.equal(JSON.stringify(decrypted.customFields), JSON.stringify(customFields));
  assert.equal(decrypted.fields.custom_details, "First line\nSecond line");
  assert.equal(decrypted.fields.key, "private-key");
});
