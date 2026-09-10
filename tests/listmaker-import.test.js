"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const core = require("../listmaker-import-core");

const TEMPLATE_KEYS = [
  "blank",
  "checklist",
  "ranked",
  "scored",
  "categorized",
  "pros-cons",
  "inventory",
  "comparison",
  "notes",
  "shopping",
  "packing",
  "favorites",
  "brainstorm",
];

function analysis(overrides = {}) {
  const source = {
    match: { template_key: "custom", confidence: 0.8, rationale: "Mixed records" },
    list: {
      title: "Imported",
      description: "Source data",
      behaviors: {},
      rating_type: null,
      default_view: "list",
      categories: [],
      statuses: [],
      fields: [],
    },
    mapping: {
      items_pointer: "/records",
      title_pointer: "/name",
      completed_pointer: "",
      manual_order_pointer: "",
      score_pointer: "",
      rating_pointer: "",
      category_pointer: "",
      status_pointer: "",
      notes_pointer: "",
      custom_fields: [],
    },
    warnings: ["Review inferred fields"],
  };
  return {
    ...source,
    ...overrides,
    match: { ...source.match, ...(overrides.match || {}) },
    list: { ...source.list, ...(overrides.list || {}) },
    mapping: { ...source.mapping, ...(overrides.mapping || {}) },
  };
}

function emptyPayload(overrides = {}) {
  return {
    list: {
      title: "Empty",
      description: null,
      template_key: "custom",
      behaviors: {},
      rating_type: null,
      default_view: "list",
      settings: { completedItems: "keep" },
    },
    categories: [],
    statuses: [],
    fields: [],
    items: [],
    ...overrides,
  };
}

function errorCode(error) {
  return error && error.code;
}

test("exports fixed limits and works as a browser global and CommonJS module", () => {
  assert.equal(core.MAX_JSON_BYTES, 256 * 1024);
  assert.equal(core.MAX_IMPORT_ITEMS, 5000);
  assert.equal(core.MAX_CATEGORIES, 100);
  assert.equal(core.MAX_STATUSES, 100);
  assert.equal(core.MAX_FIELDS, 20);
  assert.equal(core.MAX_DROPDOWN_CHOICES, 50);
  assert.equal(core.NATIVE_FORMAT, "centralis-listmaker");
  assert.equal(core.NATIVE_VERSION, 1);

  const source = fs.readFileSync(path.join(__dirname, "..", "listmaker-import-core.js"), "utf8");
  const context = vm.createContext({ TextEncoder });
  vm.runInContext(source, context);
  assert.equal(context.ListMakerImportCore.NATIVE_FORMAT, "centralis-listmaker");
  assert.equal(typeof context.ListMakerImportCore.applyAnalysisMapping, "function");
});

test("resolves RFC 6901 escaping safely and never walks inherited properties", () => {
  const document = JSON.parse('{"a/b":{"~key":42},"":{"x":1},"__proto__":{"safe":true}}');
  assert.deepEqual(core.resolveJsonPointer(document, "/a~1b/~0key"), { found: true, value: 42 });
  assert.deepEqual(core.resolveJsonPointer(document, "//x"), { found: true, value: 1 });
  assert.deepEqual(core.resolveJsonPointer(document, "/__proto__/safe"), { found: true, value: true });
  assert.equal(core.resolveJsonPointer({}, "/toString").found, false);
  assert.equal(core.resolveJsonPointer(["zero"], "/00").found, false);
  assert.throws(() => core.resolveJsonPointer(document, "/bad~2escape"), (error) => errorCode(error) === "INVALID_JSON_POINTER");
  assert.throws(() => core.resolveJsonPointer(document, "a/b"), (error) => errorCode(error) === "INVALID_JSON_POINTER");
});

test("normalizes every predefined template key, a custom list, and review metadata", () => {
  assert.deepEqual(core.TEMPLATE_KEYS, TEMPLATE_KEYS);
  TEMPLATE_KEYS.forEach((templateKey) => {
    const normalized = core.normalizeAiAnalysis(analysis({ match: { template_key: templateKey } }));
    assert.equal(normalized.match.template_key, templateKey);
    assert.equal(normalized.match.inferred_template_key, templateKey);
    assert.equal(normalized.match.confidence, 0.8);
    assert.equal(normalized.match.rationale, "Mixed records");
    assert.deepEqual(normalized.warnings, ["Review inferred fields"]);
  });

  const custom = core.normalizeAiAnalysis(analysis({
    match: { template_key: "not-a-real-template" },
    list: {
      behaviors: { custom_fields: true },
      fields: [{ key: "mood", name: "Mood", field_type: "text" }],
    },
    mapping: { custom_fields: [{ field_key: "mood", value_pointer: "/mood" }] },
  }));
  assert.equal(custom.match.template_key, "custom");
  assert.equal(custom.list.fields[0].key, "mood");
});

test("keeps root pointers for root arrays and scalar titles, but treats empty optional object pointers as absent", () => {
  const scalarAnalysis = analysis({
    match: { template_key: "blank" },
    mapping: { items_pointer: "", title_pointer: "" },
  });
  const scalarPayload = core.applyAnalysisMapping(["Alpha", 42, false], scalarAnalysis);
  assert.deepEqual(scalarPayload.items.map((item) => item.title), ["Alpha", "42", "false"]);
  assert.equal(scalarPayload.fields.length, 0);

  const objectPayload = core.applyAnalysisMapping({ records: [{ other: "kept" }] }, analysis());
  assert.equal(objectPayload.items[0].title, "Untitled item");
  assert.equal(objectPayload.items[0].completed, false);
  assert.equal(objectPayload.items[0].score, null);
  const additional = objectPayload.fields.find((field) => field.name === "Additional Data");
  const value = objectPayload.items[0].values.find((entry) => entry.field_key === additional.key);
  assert.deepEqual(JSON.parse(value.text_value), { other: "kept" });
});

test("downgrades a heterogeneous custom field to text without losing any value", () => {
  const normalized = core.applyAnalysisMapping({ records: [{ name: "A", amount: 12 }, { name: "B", amount: "n/a" }] }, analysis({
    list: { fields: [{ key: "amount", name: "Amount", field_type: "number" }] },
    mapping: { custom_fields: [{ field_key: "amount", value_pointer: "/amount" }] },
  }));
  const field = normalized.fields.find((entry) => entry.key === "amount");
  assert.equal(field.field_type, "text");
  assert.deepEqual(normalized.items.map((item) => item.values.find((entry) => entry.field_key === "amount").text_value), ["12", "n/a"]);
});

test("invalid heterogeneous built-ins become text fields for every mapped record", () => {
  const normalized = core.applyAnalysisMapping({ records: [
    { name: "A", done: true, score: 10, rating: 4 },
    { name: "B", done: "sometimes", score: "high", rating: { label: "great" } },
  ] }, analysis({
    list: {
      behaviors: { checklist: true, scored: true, rating: true },
      rating_type: "number_10",
    },
    mapping: {
      completed_pointer: "/done",
      score_pointer: "/score",
      rating_pointer: "/rating",
    },
  }));
  assert.deepEqual(normalized.items.map((item) => [item.completed, item.score, item.rating]), [[false, null, null], [false, null, null]]);
  for (const name of ["Completed", "Score", "Rating"]) {
    const field = normalized.fields.find((entry) => entry.name === name);
    assert.equal(field.field_type, "text");
    assert.ok(normalized.items.every((item) => item.values.some((entry) => entry.field_key === field.key)));
  }
  const ratingField = normalized.fields.find((entry) => entry.name === "Rating");
  assert.deepEqual(normalized.items.map((item) => item.values.find((entry) => entry.field_key === ratingField.key).text_value), ["4", '{"label":"great"}']);
});

test("preserves nested unmapped item data in an Additional Data text value", () => {
  const normalized = core.applyAnalysisMapping({ records: [{ name: "A", meta: { source: "x", nested: { count: 2 } }, tags: ["one", "two"] }] }, analysis());
  const field = normalized.fields.find((entry) => entry.name === core.ADDITIONAL_DATA_FIELD_NAME);
  assert.equal(field.field_type, "long_text");
  const stored = normalized.items[0].values.find((entry) => entry.field_key === field.key);
  assert.deepEqual(JSON.parse(stored.text_value), { meta: { nested: { count: 2 }, source: "x" }, tags: ["one", "two"] });
});

test("enforces byte, item, configuration, dropdown, and int4 limits", () => {
  const oversized = JSON.stringify({ value: "x".repeat(core.MAX_JSON_BYTES) });
  assert.throws(() => core.parseJsonInput(oversized), (error) => errorCode(error) === "JSON_TOO_LARGE");
  assert.throws(() => core.applyAnalysisMapping(new Array(core.MAX_IMPORT_ITEMS + 1).fill("x"), analysis({ mapping: { items_pointer: "", title_pointer: "" } })),
    (error) => errorCode(error) === "TOO_MANY_ITEMS");
  assert.throws(() => core.normalizeAtomicImportPayload(emptyPayload({ categories: new Array(101).fill(0).map((_, index) => `C${index}`) })),
    (error) => errorCode(error) === "TOO_MANY_CATEGORIES");
  assert.throws(() => core.normalizeAtomicImportPayload(emptyPayload({ statuses: new Array(101).fill(0).map((_, index) => `S${index}`) })),
    (error) => errorCode(error) === "TOO_MANY_STATUSES");
  assert.throws(() => core.normalizeAtomicImportPayload(emptyPayload({ fields: new Array(21).fill(0).map((_, index) => ({ key: `f${index}`, name: `F${index}`, field_type: "text" })) })),
    (error) => errorCode(error) === "TOO_MANY_FIELDS");
  assert.throws(() => core.normalizeAtomicImportPayload(emptyPayload({ fields: [{ key: "choice", name: "Choice", field_type: "dropdown", dropdown_options: new Array(51).fill(0).map((_, index) => `V${index}`) }] })),
    (error) => errorCode(error) === "TOO_MANY_DROPDOWN_CHOICES");

  const clamped = core.normalizeAtomicImportPayload(emptyPayload({
    categories: [{ key: "c", name: "C", sort_order: Number.MAX_SAFE_INTEGER }],
    fields: [{ key: "f", name: "F", field_type: "text", sort_order: Number.MIN_SAFE_INTEGER }],
    items: [{ title: "A", manual_order: Number.MAX_SAFE_INTEGER, values: [] }],
  }));
  assert.equal(clamped.categories[0].sort_order, 2147483647);
  assert.equal(clamped.fields[0].sort_order, -2147483648);
  assert.equal(clamped.items[0].manual_order, 2147483647);
});

test("downgrades a dropdown when mapped values exceed the 50-choice server cap", () => {
  const records = new Array(51).fill(0).map((_, index) => ({ name: `Item ${index}`, choice: `Choice ${index}` }));
  const normalized = core.applyAnalysisMapping({ records }, analysis({
    list: { fields: [{ key: "choice", name: "Choice", field_type: "dropdown", dropdown_options: [] }] },
    mapping: { custom_fields: [{ field_key: "choice", value_pointer: "/choice" }] },
  }));
  assert.equal(normalized.fields.find((field) => field.key === "choice").field_type, "text");
  assert.equal(normalized.items[50].values[0].text_value, "Choice 50");
});

test("rejects malformed and ambiguous inputs deterministically", () => {
  assert.throws(() => core.parseJsonInput("{"), (error) => errorCode(error) === "INVALID_JSON");
  assert.throws(() => core.normalizeAiAnalysis(analysis({ mapping: { items_pointer: undefined } })),
    (error) => errorCode(error) === "MISSING_ITEMS_POINTER");
  assert.throws(() => core.applyAnalysisMapping({ records: {} }, analysis()),
    (error) => errorCode(error) === "ITEMS_POINTER_NOT_ARRAY");
  assert.throws(() => core.normalizeNativeV1({ format: core.NATIVE_FORMAT, version: 2, list: {}, categories: [], statuses: [], fields: [], items: [] }),
    (error) => errorCode(error) === "UNSUPPORTED_NATIVE_VERSION");
  assert.throws(() => core.normalizeNativeV1({ format: core.NATIVE_FORMAT, version: 1, list: { title: "X" }, categories: [], statuses: [], fields: [{ key: "same", name: "One", field_type: "text" }, { key: "same", name: "Two", field_type: "text" }], items: [] }),
    (error) => errorCode(error) === "AMBIGUOUS_KEY");
  assert.throws(() => core.normalizeAtomicImportPayload(emptyPayload({
    fields: [{ key: "f", name: "F", field_type: "text" }],
    items: [{ title: "A", values: [{ field_key: "f", text_value: "x", number_value: 1 }] }],
  })), (error) => errorCode(error) === "AMBIGUOUS_FIELD_VALUE");
});

test("AI template override applies built-in configuration and demotes disabled mapped properties", () => {
  const sourceAnalysis = analysis({
    match: { template_key: "comparison" },
    list: {
      behaviors: { checklist: true, scored: true, categorized: true },
      categories: ["Work"],
      fields: [{ key: "owner", name: "Owner", field_type: "text" }],
    },
    mapping: {
      completed_pointer: "/done",
      score_pointer: "/score",
      category_pointer: "/category",
      notes_pointer: "/notes",
      custom_fields: [{ field_key: "owner", value_pointer: "/owner" }],
    },
  });
  const review = core.normalizeAiAnalysis(sourceAnalysis, { templateKeyOverride: "blank" });
  assert.equal(review.match.template_key, "blank");
  assert.equal(review.match.inferred_template_key, "comparison");
  assert.equal(review.list.default_view, "list");
  assert.deepEqual(review.list.categories, []);
  assert.equal(review.list.behaviors.checklist, false);
  assert.equal(review.list.behaviors.scored, false);
  assert.equal(review.list.behaviors.custom_fields, true);
  assert.ok(["Owner", "Completed", "Score", "Category", "Notes"].every((name) => review.list.fields.some((field) => field.name === name)));

  const payload = core.applyAnalysisMapping({ records: [{ name: "A", done: true, score: 7, category: "Work", notes: "keep", owner: "Sam" }] }, sourceAnalysis, { templateKeyOverride: "blank" });
  assert.equal(payload.items[0].completed, false);
  assert.equal(payload.items[0].score, null);
  assert.equal(payload.items[0].category_key, null);
  assert.equal(payload.items[0].notes, null);
  assert.deepEqual(payload.items[0].values.map((value) => payload.fields.find((field) => field.key === value.field_key).name).sort(),
    ["Category", "Completed", "Notes", "Owner", "Score"].sort());
});

test("applyTemplateOverride works for reviewed native payloads without dropping disabled built-ins", () => {
  const source = core.normalizeAtomicImportPayload({
    list: {
      title: "Source",
      template_key: "custom",
      behaviors: { checklist: true, ranked: true, scored: true, categorized: true, status: true, rating: true },
      rating_type: "number_10",
      default_view: "table",
      settings: { completedItems: "bottom" },
    },
    categories: [{ key: "work", name: "Work" }],
    statuses: [{ key: "open", name: "Open" }],
    fields: [],
    items: [{ title: "A", completed: true, manual_order: 30, score: 8, rating: 9, category_key: "work", status_key: "open", notes: "memo", values: [] }],
  }, { preserveBehaviors: true, strictReferences: true });
  const overridden = core.applyTemplateOverride(source, "blank");
  assert.equal(overridden.list.template_key, "blank");
  assert.equal(overridden.list.default_view, "list");
  assert.deepEqual(overridden.categories, []);
  assert.deepEqual(overridden.statuses, []);
  assert.deepEqual(overridden.items[0], {
    title: "A",
    completed: false,
    manual_order: 30,
    score: null,
    rating: null,
    category_key: null,
    status_key: null,
    notes: null,
    values: overridden.items[0].values,
  });
  const names = overridden.items[0].values.map((value) => overridden.fields.find((field) => field.key === value.field_key).name);
  assert.deepEqual(names.sort(), ["Category", "Completed", "Manual Order", "Notes", "Rating", "Score", "Status"].sort());
});

test("detects and normalizes old unversioned exports best-effort", () => {
  const legacy = {
    title: "Old export",
    description: "Before v1",
    behaviors: { custom_fields: true },
    rating_type: null,
    fields: [{ id: "db-field", name: "Comment", field_type: "text" }],
    items: [{ id: "db-item", title: "A", category_id: "missing-category", field_values: { Comment: "hello" } }],
  };
  assert.equal(core.isLegacyExport(legacy), true);
  assert.equal(core.isLegacyExport({ ...legacy, list: {} }), false);
  const payload = core.normalizeLegacyExport(legacy);
  assert.equal(payload.list.title, "Old export");
  assert.equal(payload.items[0].values.some((value) => value.text_value === "hello"), true);
  assert.equal(payload.fields.some((field) => field.name === "Additional Data"), true);
  assert.equal(JSON.stringify(payload).includes("db-item"), false);
});

test("native v1 export uses portable keys, every supplied live item, stable order, and round-trips", () => {
  const live = {
    list: {
      id: "list-db-id",
      user_id: 7,
      title: "Inventory",
      description: "Everything",
      template_key: "inventory",
      behaviors: { checklist: false, ranked: false, scored: false, categorized: false, status: false, custom_fields: true, rating: false },
      rating_type: null,
      default_view: "list",
      settings: { completedItems: "hide", futureSetting: true },
    },
    categories: [{ id: "cat-db-id", user_id: 7, name: "Home", sort_order: 100, collapsed: true }],
    statuses: [{ id: "status-db-id", user_id: 7, name: "Open", color: "#123456", sort_order: 100 }],
    fields: [
      { id: "quantity-db-id", name: "Quantity", field_type: "number", dropdown_options: [], sort_order: 100, visible: true },
      { id: "url-db-id", name: "URL", field_type: "text", dropdown_options: ["__centralis_link_field__"], sort_order: 200, visible: true },
      { id: "comment-db-id", name: "Comment", field_type: "text", dropdown_options: [], sort_order: 300, visible: true },
    ],
    items: [
      { id: "item-later", title: "Later", completed: true, manual_order: 200, category_id: "cat-db-id", status_id: "status-db-id" },
      { id: "item-first", title: "First", completed: false, manual_order: 100, category_id: "cat-db-id", status_id: "status-db-id", hiddenByUi: true },
      { id: "item-deleted", title: "Deleted", manual_order: 0, deleted_at: "2026-01-01" },
    ],
    values: [
      { item_id: "item-first", field_id: "quantity-db-id", number_value: 2 },
      { item_id: "item-first", field_id: "comment-db-id", text_value: "" },
      { item_id: "item-later", field_id: "url-db-id", text_value: "https://example.com" },
    ],
  };
  const native = core.exportNativeV1(live);
  assert.equal(core.isNativeV1(native), true);
  assert.deepEqual(native.items.map((item) => item.title), ["First", "Later"]);
  assert.equal(native.fields.find((field) => field.name === "URL").field_type, "link");
  assert.equal(native.items[0].values.find((value) => value.field_key === "comment").text_value, "");
  assert.equal(native.list.behaviors.categorized, false, "explicit native behavior flags are preserved");
  for (const databaseId of ["list-db-id", "cat-db-id", "status-db-id", "quantity-db-id", "url-db-id", "comment-db-id", "item-first", "item-later", "user_id"]) {
    assert.equal(JSON.stringify(native).includes(databaseId), false);
  }
  const normalized = core.normalizeNativeV1(native);
  assert.deepEqual(core.exportNativeV1({ format: core.NATIVE_FORMAT, version: core.NATIVE_VERSION, ...normalized }), native);

  const emptyNative = core.exportNativeV1(emptyPayload());
  assert.equal(core.isNativeV1(emptyNative), true);
  assert.deepEqual(core.normalizeNativeV1(emptyNative).items, []);
});

