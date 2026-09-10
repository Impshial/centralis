(function attachListMakerImportCore(globalScope, factory) {
  const api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (globalScope) globalScope.ListMakerImportCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createListMakerImportCore() {
  "use strict";

  const MAX_JSON_BYTES = 256 * 1024;
  const MAX_IMPORT_ITEMS = 5000;
  const MAX_CATEGORIES = 100;
  const MAX_STATUSES = 100;
  const MAX_FIELDS = 20;
  const MAX_DROPDOWN_CHOICES = 50;
  const NATIVE_FORMAT = "centralis-listmaker";
  const NATIVE_VERSION = 1;
  const ADDITIONAL_DATA_FIELD_NAME = "Additional Data";

  const TEMPLATE_KEYS = Object.freeze([
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
  ]);
  const IMPORT_TEMPLATE_KEYS = Object.freeze([...TEMPLATE_KEYS, "custom"]);
  const FIELD_TYPES = Object.freeze(["text", "link", "number", "checkbox", "date", "dropdown", "long_text"]);
  const RATING_TYPES = Object.freeze(["stars_5", "number_10", "percentage", "thumbs"]);
  const BUILT_IN_POINTERS = Object.freeze([
    "title_pointer",
    "completed_pointer",
    "manual_order_pointer",
    "score_pointer",
    "rating_pointer",
    "category_pointer",
    "status_pointer",
    "notes_pointer",
  ]);
  const LINK_FIELD_MARKER = "__centralis_link_field__";
  const PG_INT4_MIN = -2147483648;
  const PG_INT4_MAX = 2147483647;
  const DEFAULT_STATUS_COLORS = Object.freeze(["#8b5cf6", "#0ea5e9", "#22c55e", "#ef4444"]);
  const TEMPLATE_CONFIG = Object.freeze({
    blank: { behaviors: {}, categories: [], fields: [], default_view: "list" },
    checklist: { behaviors: { checklist: true }, categories: [], fields: [], default_view: "list" },
    ranked: { behaviors: { ranked: true }, categories: [], fields: [], default_view: "list" },
    scored: { behaviors: { scored: true }, categories: [], fields: [], default_view: "list" },
    categorized: { behaviors: { categorized: true }, categories: ["Uncategorized"], fields: [], default_view: "list" },
    "pros-cons": { behaviors: { categorized: true }, categories: ["Pros", "Cons"], fields: [], default_view: "list" },
    inventory: {
      behaviors: { custom_fields: true },
      categories: [],
      fields: [{ key: "quantity", name: "Quantity", field_type: "number" }, { key: "notes", name: "Notes", field_type: "long_text" }],
      default_view: "list",
    },
    comparison: {
      behaviors: { scored: true, custom_fields: true, rating: true },
      rating_type: "stars_5",
      categories: [],
      fields: [{ key: "price", name: "Price", field_type: "number" }, { key: "notes", name: "Notes", field_type: "long_text" }],
      default_view: "list",
    },
    notes: { behaviors: {}, categories: [], fields: [], default_view: "list" },
    shopping: {
      behaviors: { checklist: true, custom_fields: true },
      categories: [],
      fields: [{ key: "quantity", name: "Quantity", field_type: "number" }],
      default_view: "list",
    },
    packing: { behaviors: { checklist: true, categorized: true }, categories: ["Clothing", "Toiletries", "Gear", "Documents"], fields: [], default_view: "list" },
    favorites: { behaviors: { ranked: true, rating: true }, rating_type: "stars_5", categories: [], fields: [], default_view: "list" },
    brainstorm: {
      behaviors: { custom_fields: true },
      categories: [],
      fields: [{ key: "notes", name: "Notes", field_type: "long_text" }],
      default_view: "list",
    },
  });

  function codedError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function isPlainObject(value) {
    if (!value || Object.prototype.toString.call(value) !== "[object Object]") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function utf8ByteLength(value) {
    const text = String(value);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).byteLength;
    let bytes = 0;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code < 0x80) bytes += 1;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length
        && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    }
    return bytes;
  }

  function parseJsonInput(input, options = {}) {
    const maxBytes = Number.isInteger(options.maxBytes) ? options.maxBytes : MAX_JSON_BYTES;
    let serialized;
    if (typeof input === "string") serialized = input;
    else {
      try {
        serialized = JSON.stringify(input);
      } catch {
        throw codedError("INVALID_JSON", "JSON input must be serializable.");
      }
    }
    if (typeof serialized !== "string" || !serialized.trim()) {
      throw codedError("INVALID_JSON", "JSON input must not be empty.");
    }
    if (utf8ByteLength(serialized) > maxBytes) {
      throw codedError("JSON_TOO_LARGE", `JSON input exceeds the ${maxBytes}-byte limit.`);
    }
    let parsed;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      throw codedError("INVALID_JSON", "JSON input is malformed.");
    }
    if (!Array.isArray(parsed) && !isPlainObject(parsed)) {
      throw codedError("INVALID_JSON_ROOT", "JSON input must contain an object or array at its root.");
    }
    return parsed;
  }

  function pointerTokens(pointer) {
    if (typeof pointer !== "string") throw codedError("INVALID_JSON_POINTER", "JSON Pointer must be a string.");
    if (pointer === "") return [];
    if (!pointer.startsWith("/")) throw codedError("INVALID_JSON_POINTER", "JSON Pointer must be empty or start with '/'.");
    return pointer.slice(1).split("/").map((token) => {
      if (/~(?:[^01]|$)/.test(token)) throw codedError("INVALID_JSON_POINTER", `Invalid escape in JSON Pointer: ${pointer}`);
      return token.replace(/~1/g, "/").replace(/~0/g, "~");
    });
  }

  /** Resolve an RFC 6901 pointer without walking inherited properties or evaluating code. */
  function resolveJsonPointer(document, pointer) {
    const tokens = pointerTokens(pointer);
    let value = document;
    for (const token of tokens) {
      if (Array.isArray(value)) {
        if (!/^(?:0|[1-9]\d*)$/.test(token)) return { found: false, value: undefined };
        const index = Number(token);
        if (!Number.isSafeInteger(index) || index >= value.length || !hasOwn(value, index)) {
          return { found: false, value: undefined };
        }
        value = value[index];
      } else if (value !== null && typeof value === "object" && hasOwn(value, token)) {
        value = value[token];
      } else {
        return { found: false, value: undefined };
      }
    }
    return { found: true, value };
  }

  function deepCloneJson(value) {
    if (Array.isArray(value)) return value.map(deepCloneJson);
    if (!isPlainObject(value)) return value;
    const copy = {};
    for (const key of Object.keys(value)) {
      Object.defineProperty(copy, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: deepCloneJson(value[key]),
      });
    }
    return copy;
  }

  function sortedJsonValue(value) {
    if (Array.isArray(value)) return value.map(sortedJsonValue);
    if (!isPlainObject(value)) return value;
    const result = {};
    for (const key of Object.keys(value).sort()) {
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: sortedJsonValue(value[key]),
      });
    }
    return result;
  }

  function stableStringify(value) {
    return JSON.stringify(sortedJsonValue(value));
  }

  function cleanText(value) {
    return typeof value === "string" ? value.trim() : String(value == null ? "" : value).trim();
  }

  function nullableText(value) {
    if (value == null) return null;
    const text = typeof value === "string" ? value : textValue(value);
    return text.trim() ? text : null;
  }

  function textValue(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return stableStringify(value);
  }

  function finiteNumber(value) {
    if (value == null || (typeof value === "string" && !value.trim())) return { ok: true, value: null };
    if (typeof value === "number") return Number.isFinite(value) ? { ok: true, value } : { ok: false, value: null };
    if (typeof value !== "string") return { ok: false, value: null };
    const normalized = value.trim();
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return { ok: false, value: null };
    const number = Number(normalized);
    return Number.isFinite(number) ? { ok: true, value: number } : { ok: false, value: null };
  }

  function booleanValue(value) {
    if (value == null || (typeof value === "string" && !value.trim())) return { ok: true, value: null };
    if (typeof value === "boolean") return { ok: true, value };
    if (value === 1 || value === 0) return { ok: true, value: Boolean(value) };
    if (typeof value !== "string") return { ok: false, value: null };
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "1", "checked", "complete", "completed"].includes(normalized)) return { ok: true, value: true };
    if (["false", "no", "n", "0", "unchecked", "incomplete", "open"].includes(normalized)) return { ok: true, value: false };
    return { ok: false, value: null };
  }

  function dateValue(value) {
    if (value == null || (typeof value === "string" && !value.trim())) return { ok: true, value: null };
    if (typeof value !== "string") return { ok: false, value: null };
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    if (!match) return { ok: false, value: null };
    const normalized = `${match[1]}-${match[2]}-${match[3]}`;
    const probe = new Date(`${normalized}T00:00:00Z`);
    if (Number.isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== normalized) return { ok: false, value: null };
    return { ok: true, value: normalized };
  }

  function integerValue(value, fallback) {
    const parsed = finiteNumber(value);
    const number = parsed.ok && parsed.value !== null ? Math.trunc(parsed.value) : fallback;
    return Math.max(PG_INT4_MIN, Math.min(PG_INT4_MAX, number));
  }

  function normalizeTemplateKey(value, fallback = "custom") {
    const key = cleanText(value).toLowerCase();
    return IMPORT_TEMPLATE_KEYS.includes(key) ? key : fallback;
  }

  function normalizeFieldType(value) {
    const key = cleanText(value).toLowerCase().replace(/[ -]+/g, "_");
    const aliases = {
      string: "text",
      url: "link",
      uri: "link",
      integer: "number",
      float: "number",
      decimal: "number",
      boolean: "checkbox",
      bool: "checkbox",
      datetime: "date",
      select: "dropdown",
      enum: "dropdown",
      textarea: "long_text",
    };
    const normalized = aliases[key] || key;
    return FIELD_TYPES.includes(normalized) ? normalized : "text";
  }

  function normalizeChoices(value) {
    const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\r\n]/) : [];
    const seen = new Set();
    return source.map(cleanText).filter((choice) => {
      const key = choice.toLowerCase();
      if (!choice || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function portableKey(value, prefix, index) {
    const normalized = cleanText(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72);
    return normalized || `${prefix}-${index + 1}`;
  }

  function allocatePortableKey(value, prefix, index, used, strictExplicit) {
    const base = portableKey(value, prefix, index);
    if (strictExplicit && used.has(base)) throw codedError("AMBIGUOUS_KEY", `Duplicate ${prefix} key: ${base}`);
    let key = base;
    let suffix = 2;
    while (used.has(key)) {
      key = `${base.slice(0, 68)}-${suffix}`;
      suffix += 1;
    }
    used.add(key);
    return key;
  }

  function addLookup(lookup, alias, key) {
    if (alias == null) return;
    const text = cleanText(alias);
    if (!text) return;
    if (!lookup.exact.has(text)) lookup.exact.set(text, key);
    const folded = text.toLowerCase();
    if (!lookup.folded.has(folded)) lookup.folded.set(folded, key);
  }

  function resolveLookup(lookup, reference) {
    if (reference == null || reference === "") return null;
    let raw = reference;
    if (isPlainObject(reference)) raw = reference.key ?? reference.id ?? reference.name;
    const text = cleanText(raw);
    return lookup.exact.get(text) || lookup.folded.get(text.toLowerCase()) || null;
  }

  function normalizeCategories(source, options = {}) {
    if (!Array.isArray(source)) throw codedError("INVALID_CATEGORIES", "Categories must be an array.");
    if (source.length > MAX_CATEGORIES) throw codedError("TOO_MANY_CATEGORIES", `Import is limited to ${MAX_CATEGORIES} categories.`);
    const rows = [];
    const lookup = { exact: new Map(), folded: new Map() };
    const used = new Set();
    source.forEach((entry, index) => {
      const object = isPlainObject(entry) ? entry : { name: entry };
      const name = cleanText(object.name ?? object.label ?? object.key);
      if (!name) throw codedError("INVALID_CATEGORY", `Category ${index + 1} needs a name.`);
      const explicitKey = cleanText(object.key);
      const key = allocatePortableKey(explicitKey || name, "category", index, used, Boolean(options.strictKeys && explicitKey));
      rows.push({
        key,
        name: name.slice(0, 120),
        sort_order: integerValue(object.sort_order, (index + 1) * 100),
        collapsed: Boolean(object.collapsed),
      });
      [object.key, object.id, object.name, object.label, name, key].forEach((alias) => addLookup(lookup, alias, key));
    });
    return { rows, lookup };
  }

  function normalizeStatuses(source, options = {}) {
    if (!Array.isArray(source)) throw codedError("INVALID_STATUSES", "Statuses must be an array.");
    if (source.length > MAX_STATUSES) throw codedError("TOO_MANY_STATUSES", `Import is limited to ${MAX_STATUSES} statuses.`);
    const rows = [];
    const lookup = { exact: new Map(), folded: new Map() };
    const used = new Set();
    source.forEach((entry, index) => {
      const object = isPlainObject(entry) ? entry : { name: entry };
      const name = cleanText(object.name ?? object.label ?? object.key);
      if (!name) throw codedError("INVALID_STATUS", `Status ${index + 1} needs a name.`);
      const explicitKey = cleanText(object.key);
      const key = allocatePortableKey(explicitKey || name, "status", index, used, Boolean(options.strictKeys && explicitKey));
      const color = /^#[0-9a-f]{6}$/i.test(cleanText(object.color)) ? cleanText(object.color) : DEFAULT_STATUS_COLORS[index % DEFAULT_STATUS_COLORS.length];
      rows.push({ key, name: name.slice(0, 120), color, sort_order: integerValue(object.sort_order, (index + 1) * 100) });
      [object.key, object.id, object.name, object.label, name, key].forEach((alias) => addLookup(lookup, alias, key));
    });
    return { rows, lookup };
  }

  function normalizeFields(source, options = {}) {
    if (!Array.isArray(source)) throw codedError("INVALID_FIELDS", "Fields must be an array.");
    if (source.length > MAX_FIELDS) throw codedError("TOO_MANY_FIELDS", `Import is limited to ${MAX_FIELDS} fields.`);
    const rows = [];
    const lookup = { exact: new Map(), folded: new Map() };
    const used = new Set();
    source.forEach((entry, index) => {
      const object = isPlainObject(entry) ? entry : { name: entry };
      const name = cleanText(object.name ?? object.label ?? object.key);
      if (!name) throw codedError("INVALID_FIELD", `Field ${index + 1} needs a name.`);
      const explicitKey = cleanText(object.key);
      const key = allocatePortableKey(explicitKey || name, "field", index, used, Boolean(options.strictKeys && explicitKey));
      let fieldType = normalizeFieldType(object.field_type ?? object.type);
      let choices = normalizeChoices(object.dropdown_options ?? object.options);
      if (fieldType === "text" && choices.includes(LINK_FIELD_MARKER)) {
        fieldType = "link";
        choices = choices.filter((choice) => choice !== LINK_FIELD_MARKER);
      }
      if (fieldType !== "dropdown") choices = [];
      if (choices.length > MAX_DROPDOWN_CHOICES) {
        throw codedError("TOO_MANY_DROPDOWN_CHOICES", `Field ${name} exceeds the ${MAX_DROPDOWN_CHOICES}-choice limit.`);
      }
      rows.push({
        key,
        name: name.slice(0, 120),
        field_type: fieldType,
        dropdown_options: choices,
        sort_order: integerValue(object.sort_order, (index + 1) * 100),
        visible: object.visible !== false,
      });
      [object.key, object.id, object.name, object.label, name, key].forEach((alias) => addLookup(lookup, alias, key));
    });
    return { rows, lookup };
  }

  function normalizeBehaviors(value, counts = {}, preserveExplicit = false) {
    const source = isPlainObject(value) ? value : {};
    if (preserveExplicit) {
      return {
        checklist: Boolean(source.checklist),
        ranked: Boolean(source.ranked),
        scored: Boolean(source.scored),
        categorized: Boolean(source.categorized),
        status: Boolean(source.status),
        custom_fields: Boolean(source.custom_fields),
        rating: Boolean(source.rating),
      };
    }
    return {
      checklist: Boolean(source.checklist),
      ranked: Boolean(source.ranked),
      scored: Boolean(source.scored),
      categorized: Boolean(source.categorized) || Boolean(counts.categories),
      status: Boolean(source.status) || Boolean(counts.statuses),
      custom_fields: Boolean(source.custom_fields) || Boolean(counts.fields),
      rating: Boolean(source.rating) || Boolean(counts.ratingType),
    };
  }

  function normalizeList(source, definitions, options = {}) {
    const object = isPlainObject(source) ? source : {};
    const title = cleanText(object.title) || cleanText(options.defaultTitle) || "Imported List";
    let ratingType = RATING_TYPES.includes(cleanText(object.rating_type)) ? cleanText(object.rating_type) : null;
    if (!ratingType && isPlainObject(object.behaviors) && object.behaviors.rating) ratingType = "stars_5";
    const settings = isPlainObject(object.settings) ? deepCloneJson(object.settings) : {};
    if (!["keep", "bottom", "hide"].includes(settings.completedItems)) settings.completedItems = "keep";
    return {
      title: title.slice(0, 180),
      description: nullableText(object.description),
      template_key: normalizeTemplateKey(object.template_key, options.defaultTemplate || "custom"),
      behaviors: normalizeBehaviors(object.behaviors, {
        categories: definitions.categories.length,
        statuses: definitions.statuses.length,
        fields: definitions.fields.length,
        ratingType,
      }, Boolean(options.preserveBehaviors && isPlainObject(object.behaviors))),
      rating_type: ratingType,
      default_view: ["list", "table"].includes(object.default_view) ? object.default_view : definitions.fields.length ? "table" : "list",
      settings,
    };
  }

  function fieldCanRepresent(fieldType, value) {
    if (value == null || (typeof value === "string" && !value.trim())) return true;
    if (["text", "link", "long_text"].includes(fieldType)) return true;
    if (fieldType === "number") return finiteNumber(value).ok;
    if (fieldType === "checkbox") return booleanValue(value).ok;
    if (fieldType === "date") return dateValue(value).ok;
    if (fieldType === "dropdown") return ["string", "number", "boolean"].includes(typeof value);
    return false;
  }

  function typedFieldValue(field, rawValue) {
    const result = {
      field_key: field.key,
      text_value: null,
      number_value: null,
      boolean_value: null,
      date_value: null,
    };
    if (rawValue == null) return null;
    if (["text", "link", "long_text", "dropdown"].includes(field.field_type)) {
      result.text_value = textValue(rawValue);
      return result;
    }
    if (typeof rawValue === "string" && !rawValue.trim()) return null;
    if (field.field_type === "number") {
      const parsed = finiteNumber(rawValue);
      if (!parsed.ok || parsed.value === null) return null;
      result.number_value = parsed.value;
      return result;
    }
    if (field.field_type === "checkbox") {
      const parsed = booleanValue(rawValue);
      if (!parsed.ok || parsed.value === null) return null;
      result.boolean_value = parsed.value;
      return result;
    }
    if (field.field_type === "date") {
      const parsed = dateValue(rawValue);
      if (!parsed.ok || parsed.value === null) return null;
      result.date_value = parsed.value;
      return result;
    }
    return null;
  }

  function rawAtomicValue(value) {
    if (!isPlainObject(value)) return { present: value != null, value };
    const columns = ["text_value", "number_value", "boolean_value", "date_value"]
      .filter((column) => hasOwn(value, column) && value[column] !== null && value[column] !== undefined);
    if (columns.length > 1) throw codedError("AMBIGUOUS_FIELD_VALUE", "A field value may populate only one typed value column.");
    if (columns.length === 1) return { present: true, value: value[columns[0]] };
    if (hasOwn(value, "value")) return { present: value.value != null, value: value.value };
    return { present: false, value: null };
  }

  function additionalDataField(fields) {
    const reusable = fields.find((field) => field.name.toLowerCase() === ADDITIONAL_DATA_FIELD_NAME.toLowerCase()
      && ["text", "long_text"].includes(field.field_type));
    if (reusable) return reusable;
    if (fields.length >= MAX_FIELDS) {
      throw codedError("TOO_MANY_FIELDS", `Unmapped data needs an ${ADDITIONAL_DATA_FIELD_NAME} field, but the ${MAX_FIELDS}-field limit is already reached.`);
    }
    const used = new Set(fields.map((field) => field.key));
    const key = allocatePortableKey("additional-data", "field", fields.length, used, false);
    const field = {
      key,
      name: ADDITIONAL_DATA_FIELD_NAME,
      field_type: "long_text",
      dropdown_options: [],
      sort_order: (fields.length + 1) * 100,
      visible: true,
    };
    fields.push(field);
    return field;
  }

  function mergeAdditionalValue(item, field, additional) {
    if (additional === undefined) return;
    const serialized = typeof additional === "string" ? additional : stableStringify(additional);
    if (!serialized) return;
    const existing = item.values.find((value) => value.field_key === field.key);
    if (existing) {
      existing.text_value = stableStringify({ mapped_value: existing.text_value, unmapped: additional });
      existing.number_value = null;
      existing.boolean_value = null;
      existing.date_value = null;
      return;
    }
    item.values.push({
      field_key: field.key,
      text_value: serialized,
      number_value: null,
      boolean_value: null,
      date_value: null,
    });
  }

  function normalizeAtomicImportPayload(candidate, options = {}) {
    if (!isPlainObject(candidate)) throw codedError("INVALID_IMPORT_PAYLOAD", "Import payload must be an object.");
    const sourceItems = candidate.items;
    if (!Array.isArray(sourceItems)) throw codedError("INVALID_ITEMS", "Import payload items must be an array.");
    if (sourceItems.length > MAX_IMPORT_ITEMS) throw codedError("TOO_MANY_ITEMS", `Import is limited to ${MAX_IMPORT_ITEMS} items.`);

    const categoriesResult = normalizeCategories(candidate.categories || [], { strictKeys: options.strictKeys });
    const statusesResult = normalizeStatuses(candidate.statuses || [], { strictKeys: options.strictKeys });
    const fieldsResult = normalizeFields(candidate.fields || [], { strictKeys: options.strictKeys });
    const fields = fieldsResult.rows;
    const pendingItems = [];
    const rawValuesByField = new Map(fields.map((field) => [field.key, []]));

    sourceItems.forEach((sourceItem, index) => {
      const item = isPlainObject(sourceItem) ? sourceItem : { title: sourceItem };
      const values = item.values == null ? [] : item.values;
      if (!Array.isArray(values)) throw codedError("INVALID_FIELD_VALUES", `Item ${index + 1} values must be an array.`);
      const seenFields = new Set();
      const pendingValues = [];
      const unmappedValues = [];
      values.forEach((value, valueIndex) => {
        if (!isPlainObject(value)) throw codedError("INVALID_FIELD_VALUE", `Item ${index + 1} value ${valueIndex + 1} must be an object.`);
        const fieldKey = resolveLookup(fieldsResult.lookup, value.field_key ?? value.field_id ?? value.field);
        const raw = rawAtomicValue(value);
        if (!fieldKey) {
          if (options.strictReferences) throw codedError("UNKNOWN_FIELD_REFERENCE", `Unknown field reference on item ${index + 1}.`);
          if (raw.present) unmappedValues.push({ field_key: value.field_key ?? value.field_id ?? value.field ?? null, value: raw.value });
          return;
        }
        if (seenFields.has(fieldKey)) throw codedError("AMBIGUOUS_FIELD_VALUE", `Item ${index + 1} has duplicate values for field ${fieldKey}.`);
        seenFields.add(fieldKey);
        if (!raw.present) return;
        pendingValues.push({ fieldKey, raw: raw.value });
        rawValuesByField.get(fieldKey).push(raw.value);
      });
      pendingItems.push({ item, index, pendingValues, unmappedValues });
    });

    for (const field of fields) {
      const rawValues = rawValuesByField.get(field.key) || [];
      if (rawValues.some((value) => !fieldCanRepresent(field.field_type, value))) {
        field.field_type = "text";
        field.dropdown_options = [];
      } else if (field.field_type === "dropdown") {
        const choices = normalizeChoices([...field.dropdown_options, ...rawValues.map(textValue)]);
        if (choices.length > MAX_DROPDOWN_CHOICES) {
          field.field_type = "text";
          field.dropdown_options = [];
        } else field.dropdown_options = choices;
      }
    }

    const additionalByItem = new Map();
    const items = pendingItems.map(({ item, index, pendingValues, unmappedValues }) => {
      const categoryReference = item.category_key ?? item.category_id ?? item.category;
      const statusReference = item.status_key ?? item.status_id ?? item.status;
      const categoryKey = resolveLookup(categoriesResult.lookup, categoryReference);
      const statusKey = resolveLookup(statusesResult.lookup, statusReference);
      const additional = {};
      if (categoryReference != null && categoryReference !== "" && !categoryKey) {
        if (options.strictReferences) throw codedError("UNKNOWN_CATEGORY_REFERENCE", `Unknown category reference on item ${index + 1}.`);
        additional.category = deepCloneJson(categoryReference);
      }
      if (statusReference != null && statusReference !== "" && !statusKey) {
        if (options.strictReferences) throw codedError("UNKNOWN_STATUS_REFERENCE", `Unknown status reference on item ${index + 1}.`);
        additional.status = deepCloneJson(statusReference);
      }
      if (unmappedValues.length) additional.values = unmappedValues;
      const normalized = {
        title: cleanText(item.title) || "Untitled item",
        completed: Boolean(booleanValue(item.completed).ok ? booleanValue(item.completed).value : false),
        manual_order: integerValue(item.manual_order, (index + 1) * 100),
        score: finiteNumber(item.score).ok ? finiteNumber(item.score).value : null,
        rating: finiteNumber(item.rating).ok ? finiteNumber(item.rating).value : null,
        category_key: categoryKey,
        status_key: statusKey,
        notes: nullableText(item.notes),
        values: pendingValues.map(({ fieldKey, raw }) => typedFieldValue(fields.find((field) => field.key === fieldKey), raw)).filter(Boolean),
      };
      if (Object.keys(additional).length) additionalByItem.set(normalized, additional);
      return normalized;
    });

    if (additionalByItem.size) {
      const field = additionalDataField(fields);
      for (const [item, additional] of additionalByItem) mergeAdditionalValue(item, field, additional);
    }

    const list = normalizeList(candidate.list, {
      categories: categoriesResult.rows,
      statuses: statusesResult.rows,
      fields,
    }, {
      defaultTemplate: options.defaultTemplate || "custom",
      defaultTitle: options.defaultTitle,
      preserveBehaviors: options.preserveBehaviors,
    });

    return {
      list,
      categories: categoriesResult.rows,
      statuses: statusesResult.rows,
      fields,
      items,
    };
  }

  function isNativeV1(input) {
    let document;
    try {
      document = parseJsonInput(input);
    } catch {
      return false;
    }
    return isPlainObject(document)
      && document.format === NATIVE_FORMAT
      && document.version === NATIVE_VERSION
      && isPlainObject(document.list)
      && Array.isArray(document.categories)
      && Array.isArray(document.statuses)
      && Array.isArray(document.fields)
      && Array.isArray(document.items);
  }

  function normalizeNativeV1(input) {
    const document = parseJsonInput(input);
    if (!isPlainObject(document) || document.format !== NATIVE_FORMAT) {
      throw codedError("NOT_NATIVE_FORMAT", `Expected ${NATIVE_FORMAT} JSON.`);
    }
    if (document.version !== NATIVE_VERSION) {
      throw codedError("UNSUPPORTED_NATIVE_VERSION", `Unsupported ${NATIVE_FORMAT} version: ${String(document.version)}.`);
    }
    if (!isPlainObject(document.list) || !cleanText(document.list.title)
      || !Array.isArray(document.categories) || !Array.isArray(document.statuses)
      || !Array.isArray(document.fields) || !Array.isArray(document.items)) {
      throw codedError("INVALID_NATIVE_FORMAT", "Native ListMaker v1 JSON is incomplete.");
    }
    return normalizeAtomicImportPayload(document, {
      strictKeys: true,
      strictReferences: true,
      defaultTemplate: "custom",
      preserveBehaviors: true,
    });
  }

  function normalizePointer(value, name, required, provided = true, allowEmpty = false) {
    if (!provided || value == null) {
      if (required) throw codedError("MISSING_ITEMS_POINTER", `${name} is required.`);
      return null;
    }
    if (typeof value !== "string") throw codedError("INVALID_JSON_POINTER", `${name} must be a JSON Pointer string.`);
    if (value === "" && !allowEmpty) return null;
    pointerTokens(value);
    return value;
  }

  function templateConfiguration(templateKey) {
    const config = TEMPLATE_CONFIG[templateKey];
    if (!config) return null;
    const categories = normalizeCategories(config.categories || []).rows;
    const statuses = normalizeStatuses(config.statuses || []).rows;
    const fields = normalizeFields(config.fields || []).rows;
    const list = normalizeList({
      template_key: templateKey,
      behaviors: config.behaviors || {},
      rating_type: config.rating_type || null,
      default_view: config.default_view || "list",
      settings: { completedItems: "keep" },
    }, { categories, statuses, fields }, { defaultTemplate: templateKey });
    return { list, categories, statuses, fields };
  }

  function appendMappedField(fields, mapping, desiredField, valuePointer) {
    const alreadyMappedKeys = new Set(mapping.custom_fields.map((entry) => entry.field_key));
    let field = fields.find((candidate) => candidate.name.toLowerCase() === desiredField.name.toLowerCase()
      && !alreadyMappedKeys.has(candidate.key));
    if (!field) {
      if (fields.length >= MAX_FIELDS) {
        throw codedError("TOO_MANY_FIELDS", `Template override needs more than ${MAX_FIELDS} fields to preserve all mapped data.`);
      }
      const used = new Set(fields.map((candidate) => candidate.key));
      const key = allocatePortableKey(desiredField.key || desiredField.name, "field", fields.length, used, false);
      field = {
        key,
        name: desiredField.name.slice(0, 120),
        field_type: normalizeFieldType(desiredField.field_type),
        dropdown_options: normalizeChoices(desiredField.dropdown_options),
        sort_order: (fields.length + 1) * 100,
        visible: true,
      };
      fields.push(field);
    }
    mapping.custom_fields.push({ field_key: field.key, value_pointer: valuePointer });
    return field;
  }

  function applyTemplateToAnalysis(baseList, baseMapping, templateKey) {
    if (templateKey === "custom") {
      return {
        list: { ...baseList, template_key: "custom" },
        mapping: baseMapping,
      };
    }
    const template = templateConfiguration(templateKey);
    if (!template) throw codedError("INVALID_TEMPLATE", `Unknown template override: ${templateKey}`);
    const fields = template.fields.map((field) => ({ ...field, dropdown_options: field.dropdown_options.slice() }));
    const mapping = {
      ...baseMapping,
      custom_fields: [],
    };
    const sourceFieldByKey = new Map(baseList.fields.map((field) => [field.key, field]));
    baseMapping.custom_fields.forEach((entry) => {
      const sourceField = sourceFieldByKey.get(entry.field_key);
      if (!sourceField) return;
      appendMappedField(fields, mapping, sourceField, entry.value_pointer);
    });

    const behaviors = template.list.behaviors;
    const gatedPointers = [
      ["completed_pointer", behaviors.checklist, { key: "completed", name: "Completed", field_type: "checkbox" }],
      ["manual_order_pointer", behaviors.ranked, { key: "manual-order", name: "Manual Order", field_type: "number" }],
      ["score_pointer", behaviors.scored, { key: "score", name: "Score", field_type: "number" }],
      ["rating_pointer", behaviors.rating, { key: "rating", name: "Rating", field_type: "number" }],
      ["category_pointer", behaviors.categorized, { key: "category", name: "Category", field_type: "text" }],
      ["status_pointer", behaviors.status, { key: "status", name: "Status", field_type: "text" }],
      ["notes_pointer", templateKey === "notes", { key: "notes", name: "Notes", field_type: "long_text" }],
    ];
    gatedPointers.forEach(([pointerName, enabled, field]) => {
      const pointer = mapping[pointerName];
      if (enabled || pointer == null) return;
      if (!mapping.custom_fields.some((entry) => entry.value_pointer === pointer)) appendMappedField(fields, mapping, field, pointer);
      mapping[pointerName] = null;
    });

    const finalBehaviors = {
      ...template.list.behaviors,
      custom_fields: Boolean(fields.length),
    };
    return {
      list: {
        ...baseList,
        template_key: templateKey,
        behaviors: finalBehaviors,
        rating_type: template.list.rating_type,
        default_view: template.list.default_view,
        categories: template.categories,
        statuses: template.statuses,
        fields,
      },
      mapping,
    };
  }

  function normalizeReviewPayload(input) {
    const document = typeof input === "string" ? parseJsonInput(input) : input;
    if (isPlainObject(document) && document.format === NATIVE_FORMAT) return normalizeNativeV1(document);
    if (isLegacyExport(document)) return normalizeLegacyExport(document);
    return normalizeAtomicImportPayload(document, {
      strictKeys: true,
      strictReferences: true,
      preserveBehaviors: true,
      defaultTemplate: "custom",
    });
  }

  function applyTemplateOverride(input, templateKeyInput) {
    const templateKey = cleanText(templateKeyInput).toLowerCase();
    if (!IMPORT_TEMPLATE_KEYS.includes(templateKey)) throw codedError("INVALID_TEMPLATE", `Unknown template override: ${templateKey}`);
    const source = normalizeReviewPayload(input);
    if (templateKey === "custom") {
      return { ...source, list: { ...source.list, template_key: "custom" } };
    }
    const template = templateConfiguration(templateKey);
    const categoriesResult = normalizeCategories(template.categories, { strictKeys: true });
    const statusesResult = normalizeStatuses(template.statuses, { strictKeys: true });
    const fields = template.fields.map((field) => ({ ...field, dropdown_options: field.dropdown_options.slice() }));
    const usedFieldKeys = new Set(fields.map((field) => field.key));
    const occupiedTemplateFields = new Set();
    const fieldKeyMap = new Map();

    source.fields.forEach((sourceField, index) => {
      let target = fields.find((field) => !occupiedTemplateFields.has(field.key)
        && (field.key === sourceField.key || field.name.toLowerCase() === sourceField.name.toLowerCase()));
      if (!target) {
        if (fields.length >= MAX_FIELDS) throw codedError("TOO_MANY_FIELDS", `Template override exceeds the ${MAX_FIELDS}-field limit.`);
        const key = allocatePortableKey(sourceField.key || sourceField.name, "field", fields.length + index, usedFieldKeys, false);
        target = { ...sourceField, key, sort_order: (fields.length + 1) * 100, dropdown_options: sourceField.dropdown_options.slice() };
        fields.push(target);
      }
      occupiedTemplateFields.add(target.key);
      fieldKeyMap.set(sourceField.key, target.key);
    });

    function ensureDemotionField(name, preferredKey, fieldType) {
      let field = fields.find((candidate) => !occupiedTemplateFields.has(candidate.key)
        && candidate.name.toLowerCase() === name.toLowerCase());
      if (!field) {
        if (fields.length >= MAX_FIELDS) throw codedError("TOO_MANY_FIELDS", `Template override needs more than ${MAX_FIELDS} fields to preserve data.`);
        const key = allocatePortableKey(preferredKey, "field", fields.length, usedFieldKeys, false);
        field = {
          key,
          name,
          field_type: fieldType,
          dropdown_options: [],
          sort_order: (fields.length + 1) * 100,
          visible: true,
        };
        fields.push(field);
      }
      occupiedTemplateFields.add(field.key);
      return field;
    }

    const sourceCategoryByKey = new Map(source.categories.map((category) => [category.key, category]));
    const sourceStatusByKey = new Map(source.statuses.map((status) => [status.key, status]));
    const targetCategoryLookup = categoriesResult.lookup;
    const targetStatusLookup = statusesResult.lookup;
    const targetBehaviors = template.list.behaviors;
    const shouldDemoteCompleted = !targetBehaviors.checklist
      && (source.list.behaviors.checklist || source.items.some((item) => item.completed));
    const shouldDemoteOrder = !targetBehaviors.ranked && source.list.behaviors.ranked;
    const shouldDemoteScore = !targetBehaviors.scored
      && (source.list.behaviors.scored || source.items.some((item) => item.score !== null));
    const shouldDemoteRating = !targetBehaviors.rating
      && (source.list.behaviors.rating || source.items.some((item) => item.rating !== null));
    const hasUnmatchedCategory = source.items.some((item) => {
      if (!item.category_key) return false;
      const sourceCategory = sourceCategoryByKey.get(item.category_key);
      return !targetBehaviors.categorized || !resolveLookup(targetCategoryLookup, sourceCategory?.name || item.category_key);
    });
    const hasUnmatchedStatus = source.items.some((item) => {
      if (!item.status_key) return false;
      const sourceStatus = sourceStatusByKey.get(item.status_key);
      return !targetBehaviors.status || !resolveLookup(targetStatusLookup, sourceStatus?.name || item.status_key);
    });
    const shouldDemoteNotes = templateKey !== "notes" && source.items.some((item) => item.notes !== null);
    const demotionFields = {
      completed: shouldDemoteCompleted ? ensureDemotionField("Completed", "completed", "checkbox") : null,
      manualOrder: shouldDemoteOrder ? ensureDemotionField("Manual Order", "manual-order", "number") : null,
      score: shouldDemoteScore ? ensureDemotionField("Score", "score", "number") : null,
      rating: shouldDemoteRating ? ensureDemotionField("Rating", "rating", "number") : null,
      category: hasUnmatchedCategory ? ensureDemotionField("Category", "category", "text") : null,
      status: hasUnmatchedStatus ? ensureDemotionField("Status", "status", "text") : null,
      notes: shouldDemoteNotes ? ensureDemotionField("Notes", "notes", "long_text") : null,
    };

    const items = source.items.map((sourceItem) => {
      const values = sourceItem.values.map((value) => ({ ...value, field_key: fieldKeyMap.get(value.field_key) || value.field_key }));
      const addValue = (field, value) => {
        if (!field || value === null || value === undefined) return;
        const typed = typedFieldValue(field, value);
        if (typed) values.push(typed);
      };
      if (demotionFields.completed) addValue(demotionFields.completed, sourceItem.completed);
      if (demotionFields.manualOrder) addValue(demotionFields.manualOrder, sourceItem.manual_order);
      if (demotionFields.score) addValue(demotionFields.score, sourceItem.score);
      if (demotionFields.rating) addValue(demotionFields.rating, sourceItem.rating);
      const sourceCategory = sourceCategoryByKey.get(sourceItem.category_key);
      const categoryKey = targetBehaviors.categorized
        ? resolveLookup(targetCategoryLookup, sourceCategory?.name || sourceItem.category_key)
        : null;
      if (!categoryKey && sourceItem.category_key) addValue(demotionFields.category, sourceCategory?.name || sourceItem.category_key);
      const sourceStatus = sourceStatusByKey.get(sourceItem.status_key);
      const statusKey = targetBehaviors.status
        ? resolveLookup(targetStatusLookup, sourceStatus?.name || sourceItem.status_key)
        : null;
      if (!statusKey && sourceItem.status_key) addValue(demotionFields.status, sourceStatus?.name || sourceItem.status_key);
      if (demotionFields.notes) addValue(demotionFields.notes, sourceItem.notes);
      return {
        title: sourceItem.title,
        completed: targetBehaviors.checklist ? sourceItem.completed : false,
        manual_order: targetBehaviors.ranked ? sourceItem.manual_order : sourceItem.manual_order,
        score: targetBehaviors.scored ? sourceItem.score : null,
        rating: targetBehaviors.rating ? sourceItem.rating : null,
        category_key: categoryKey,
        status_key: statusKey,
        notes: templateKey === "notes" ? sourceItem.notes : null,
        values,
      };
    });

    return normalizeAtomicImportPayload({
      list: {
        title: source.list.title,
        description: source.list.description,
        template_key: templateKey,
        behaviors: { ...targetBehaviors, custom_fields: Boolean(fields.length) },
        rating_type: template.list.rating_type,
        default_view: template.list.default_view,
        settings: source.list.settings,
      },
      categories: categoriesResult.rows,
      statuses: statusesResult.rows,
      fields,
      items,
    }, {
      strictKeys: true,
      strictReferences: true,
      preserveBehaviors: true,
      defaultTemplate: templateKey,
    });
  }

  function normalizeAiAnalysis(input, options = {}) {
    const document = parseJsonInput(input);
    if (!isPlainObject(document)) throw codedError("INVALID_ANALYSIS", "AI analysis must be an object.");
    const listSource = document.list == null ? {} : document.list;
    const mappingSource = document.mapping;
    if (!isPlainObject(listSource) || !isPlainObject(mappingSource)) {
      throw codedError("INVALID_ANALYSIS", "AI analysis needs list and mapping objects.");
    }
    const categoriesResult = normalizeCategories(listSource.categories || [], { strictKeys: true });
    const statusesResult = normalizeStatuses(listSource.statuses || [], { strictKeys: true });
    const fieldsResult = normalizeFields(listSource.fields || [], { strictKeys: true });
    const inferredTemplateKey = normalizeTemplateKey(document.match?.template_key, "custom");
    let templateKey;
    if (options.templateKeyOverride != null) {
      const override = cleanText(options.templateKeyOverride).toLowerCase();
      if (!IMPORT_TEMPLATE_KEYS.includes(override)) throw codedError("INVALID_TEMPLATE", `Unknown template override: ${override}`);
      templateKey = override;
    } else {
      templateKey = inferredTemplateKey;
    }
    const list = normalizeList({ ...listSource, template_key: templateKey }, {
      categories: categoriesResult.rows,
      statuses: statusesResult.rows,
      fields: fieldsResult.rows,
    }, { defaultTemplate: templateKey });
    const mapping = {
      items_pointer: normalizePointer(mappingSource.items_pointer, "mapping.items_pointer", true, hasOwn(mappingSource, "items_pointer"), true),
      custom_fields: [],
    };
    BUILT_IN_POINTERS.forEach((name) => {
      mapping[name] = normalizePointer(mappingSource[name], `mapping.${name}`, false, hasOwn(mappingSource, name), name === "title_pointer");
    });
    const customFields = mappingSource.custom_fields == null ? [] : mappingSource.custom_fields;
    if (!Array.isArray(customFields)) throw codedError("INVALID_CUSTOM_FIELD_MAPPING", "mapping.custom_fields must be an array.");
    const mappedFieldKeys = new Set();
    customFields.forEach((entry, index) => {
      if (!isPlainObject(entry)) throw codedError("INVALID_CUSTOM_FIELD_MAPPING", `Custom field mapping ${index + 1} must be an object.`);
      const fieldKey = resolveLookup(fieldsResult.lookup, entry.field_key);
      if (!fieldKey) throw codedError("UNKNOWN_FIELD_REFERENCE", `Unknown custom field key: ${String(entry.field_key)}`);
      if (mappedFieldKeys.has(fieldKey)) throw codedError("AMBIGUOUS_FIELD_MAPPING", `Field ${fieldKey} is mapped more than once.`);
      mappedFieldKeys.add(fieldKey);
      mapping.custom_fields.push({
        field_key: fieldKey,
        value_pointer: normalizePointer(entry.value_pointer, `mapping.custom_fields[${index}].value_pointer`, true, hasOwn(entry, "value_pointer"), true),
      });
    });
    const baseList = {
        title: list.title,
        description: list.description,
        template_key: templateKey,
        behaviors: list.behaviors,
        rating_type: list.rating_type,
        default_view: list.default_view,
        categories: categoriesResult.rows,
        statuses: statusesResult.rows,
        fields: fieldsResult.rows,
    };
    const configured = options.templateKeyOverride != null
      ? applyTemplateToAnalysis(baseList, mapping, templateKey)
      : { list: baseList, mapping };
    const confidence = finiteNumber(document.match?.confidence);
    const warningsSource = document.warnings == null ? [] : document.warnings;
    if (!Array.isArray(warningsSource)) throw codedError("INVALID_ANALYSIS", "AI analysis warnings must be an array.");
    return {
      match: {
        template_key: templateKey,
        confidence: confidence.ok && confidence.value !== null ? Math.max(0, Math.min(1, confidence.value)) : null,
        rationale: nullableText(document.match?.rationale),
        inferred_template_key: inferredTemplateKey,
      },
      list: configured.list,
      mapping: configured.mapping,
      warnings: normalizeChoices(warningsSource).map((warning) => warning.slice(0, 500)),
    };
  }

  function pointerRemovalTrie(pointers) {
    const root = { terminal: false, children: new Map() };
    pointers.forEach((pointer) => {
      let node = root;
      pointerTokens(pointer).forEach((token) => {
        if (!node.children.has(token)) node.children.set(token, { terminal: false, children: new Map() });
        node = node.children.get(token);
      });
      node.terminal = true;
    });
    return root;
  }

  const OMITTED = Symbol("omitted");

  function omitWithTrie(value, trie) {
    if (trie?.terminal) return OMITTED;
    if (!trie || !trie.children.size || value === null || typeof value !== "object") return deepCloneJson(value);
    if (Array.isArray(value)) {
      const output = [];
      let removed = false;
      value.forEach((entry, index) => {
        const childTrie = trie.children.get(String(index));
        const child = omitWithTrie(entry, childTrie);
        if (child === OMITTED) removed = true;
        else output.push(child);
      });
      return removed && !output.length ? OMITTED : output;
    }
    const output = {};
    let removed = false;
    Object.keys(value).forEach((key) => {
      const childTrie = trie.children.get(key);
      const child = omitWithTrie(value[key], childTrie);
      if (child === OMITTED) removed = true;
      else Object.defineProperty(output, key, { configurable: true, enumerable: true, writable: true, value: child });
    });
    return removed && !Object.keys(output).length ? OMITTED : output;
  }

  function removeMappedValues(source, pointers) {
    if (!pointers.length) return deepCloneJson(source);
    const residual = omitWithTrie(source, pointerRemovalTrie(pointers));
    return residual === OMITTED ? undefined : residual;
  }

  function applyAnalysisMapping(rawInput, analysisInput, options = {}) {
    const rawDocument = parseJsonInput(rawInput);
    const analysis = normalizeAiAnalysis(analysisInput, options);
    const itemsResult = resolveJsonPointer(rawDocument, analysis.mapping.items_pointer);
    if (!itemsResult.found || !Array.isArray(itemsResult.value)) {
      throw codedError("ITEMS_POINTER_NOT_ARRAY", "mapping.items_pointer must resolve to an array.");
    }
    if (itemsResult.value.length > MAX_IMPORT_ITEMS) {
      throw codedError("TOO_MANY_ITEMS", `Import is limited to ${MAX_IMPORT_ITEMS} items.`);
    }

    const categoriesResult = normalizeCategories(analysis.list.categories, { strictKeys: true });
    const statusesResult = normalizeStatuses(analysis.list.statuses, { strictKeys: true });
    const fieldsResult = normalizeFields(analysis.list.fields, { strictKeys: true });
    const fields = fieldsResult.rows;
    const mappedRawValues = new Map(fields.map((field) => [field.key, []]));
    const extracted = itemsResult.value.map((source, index) => {
      const consumedPointers = [];
      const builtIn = {};
      BUILT_IN_POINTERS.forEach((pointerName) => {
        const pointer = analysis.mapping[pointerName];
        if (pointer == null) return;
        if (pointerName === "title_pointer" && pointer === "" && source !== null && typeof source === "object") return;
        const resolved = resolveJsonPointer(source, pointer);
        if (resolved.found) builtIn[pointerName] = { pointer, raw: resolved.value };
      });
      const custom = [];
      analysis.mapping.custom_fields.forEach((mapping) => {
        const resolved = resolveJsonPointer(source, mapping.value_pointer);
        if (!resolved.found) return;
        custom.push({ fieldKey: mapping.field_key, pointer: mapping.value_pointer, raw: resolved.value });
        mappedRawValues.get(mapping.field_key).push(resolved.value);
        consumedPointers.push(mapping.value_pointer);
      });
      return { source, index, builtIn, custom, consumedPointers };
    });

    const builtInTypeRules = [
      ["completed_pointer", "completed", "Completed", booleanValue],
      ["manual_order_pointer", "manual-order", "Manual Order", finiteNumber],
      ["score_pointer", "score", "Score", finiteNumber],
      ["rating_pointer", "rating", "Rating", finiteNumber],
    ];
    builtInTypeRules.forEach(([pointerName, preferredKey, name, validator]) => {
      const pointer = analysis.mapping[pointerName];
      if (pointer == null) return;
      const present = extracted.filter((entry) => entry.builtIn[pointerName]);
      if (!present.some((entry) => !validator(entry.builtIn[pointerName].raw).ok)) return;
      const existingMapping = analysis.mapping.custom_fields.find((entry) => entry.value_pointer === pointer);
      let field = existingMapping ? fields.find((candidate) => candidate.key === existingMapping.field_key) : null;
      if (!field) {
        if (fields.length >= MAX_FIELDS) {
          throw codedError("TOO_MANY_FIELDS", `Invalid ${name} values need a text field, but the ${MAX_FIELDS}-field limit is already reached.`);
        }
        const used = new Set(fields.map((candidate) => candidate.key));
        field = {
          key: allocatePortableKey(preferredKey, "field", fields.length, used, false),
          name,
          field_type: "text",
          dropdown_options: [],
          sort_order: (fields.length + 1) * 100,
          visible: true,
        };
        fields.push(field);
        mappedRawValues.set(field.key, []);
        present.forEach((entry) => {
          const raw = entry.builtIn[pointerName].raw;
          entry.custom.push({ fieldKey: field.key, pointer, raw });
          entry.consumedPointers.push(pointer);
          mappedRawValues.get(field.key).push(raw);
        });
      } else {
        field.field_type = "text";
        field.dropdown_options = [];
      }
      extracted.forEach((entry) => delete entry.builtIn[pointerName]);
    });

    for (const field of fields) {
      const values = mappedRawValues.get(field.key) || [];
      if (values.some((value) => !fieldCanRepresent(field.field_type, value))) {
        field.field_type = "text";
        field.dropdown_options = [];
      } else if (field.field_type === "dropdown") {
        const choices = normalizeChoices([...field.dropdown_options, ...values.map(textValue)]);
        if (choices.length > MAX_DROPDOWN_CHOICES) {
          field.field_type = "text";
          field.dropdown_options = [];
        } else field.dropdown_options = choices;
      }
    }

    let additionalField = null;
    const items = extracted.map(({ source, index, builtIn, custom, consumedPointers }) => {
      const titleRaw = builtIn.title_pointer?.raw;
      if (builtIn.title_pointer) consumedPointers.push(builtIn.title_pointer.pointer);
      const completed = builtIn.completed_pointer ? booleanValue(builtIn.completed_pointer.raw) : { ok: true, value: false };
      if (builtIn.completed_pointer && completed.ok) consumedPointers.push(builtIn.completed_pointer.pointer);
      const manualOrder = builtIn.manual_order_pointer ? finiteNumber(builtIn.manual_order_pointer.raw) : { ok: true, value: null };
      if (builtIn.manual_order_pointer && manualOrder.ok) consumedPointers.push(builtIn.manual_order_pointer.pointer);
      const score = builtIn.score_pointer ? finiteNumber(builtIn.score_pointer.raw) : { ok: true, value: null };
      if (builtIn.score_pointer && score.ok) consumedPointers.push(builtIn.score_pointer.pointer);
      const rating = builtIn.rating_pointer ? finiteNumber(builtIn.rating_pointer.raw) : { ok: true, value: null };
      if (builtIn.rating_pointer && rating.ok) consumedPointers.push(builtIn.rating_pointer.pointer);
      const categoryKey = builtIn.category_pointer ? resolveLookup(categoriesResult.lookup, builtIn.category_pointer.raw) : null;
      if (builtIn.category_pointer && (categoryKey || builtIn.category_pointer.raw == null || builtIn.category_pointer.raw === "")) {
        consumedPointers.push(builtIn.category_pointer.pointer);
      }
      const statusKey = builtIn.status_pointer ? resolveLookup(statusesResult.lookup, builtIn.status_pointer.raw) : null;
      if (builtIn.status_pointer && (statusKey || builtIn.status_pointer.raw == null || builtIn.status_pointer.raw === "")) {
        consumedPointers.push(builtIn.status_pointer.pointer);
      }
      const notes = builtIn.notes_pointer ? nullableText(builtIn.notes_pointer.raw) : null;
      if (builtIn.notes_pointer) consumedPointers.push(builtIn.notes_pointer.pointer);
      const item = {
        title: cleanText(textValue(titleRaw)) || "Untitled item",
        completed: Boolean(completed.ok ? completed.value : false),
        manual_order: integerValue(manualOrder.ok ? manualOrder.value : null, (index + 1) * 100),
        score: score.ok ? score.value : null,
        rating: rating.ok ? rating.value : null,
        category_key: categoryKey,
        status_key: statusKey,
        notes,
        values: custom.map(({ fieldKey, raw }) => typedFieldValue(fields.find((field) => field.key === fieldKey), raw)).filter(Boolean),
      };
      const residual = removeMappedValues(source, consumedPointers);
      if (residual !== undefined) {
        if (!additionalField) additionalField = additionalDataField(fields);
        mergeAdditionalValue(item, additionalField, residual);
      }
      return item;
    });

    return normalizeAtomicImportPayload({
      list: {
        title: analysis.list.title,
        description: analysis.list.description,
        template_key: analysis.match.template_key,
        behaviors: analysis.list.behaviors,
        rating_type: analysis.list.rating_type,
        default_view: analysis.list.default_view,
        settings: { completedItems: "keep" },
      },
      categories: categoriesResult.rows,
      statuses: statusesResult.rows,
      fields,
      items,
    }, { strictKeys: true, strictReferences: true, defaultTemplate: analysis.match.template_key });
  }

  function sourceValuesForItem(source, item, fieldsResult) {
    const itemId = item.id ?? item.key;
    const globalValues = [source.values, source.fieldValues, Array.isArray(source.field_values) ? source.field_values : null]
      .filter(Array.isArray).flat().filter((value) => {
        const reference = value.item_id ?? value.item_key;
        return reference != null && itemId != null && String(reference) === String(itemId);
      });
    const localValues = Array.isArray(item.values) ? item.values : [];
    const byField = new Map();
    [...globalValues, ...localValues].forEach((value) => {
      if (!isPlainObject(value)) return;
      const fieldKey = resolveLookup(fieldsResult.lookup, value.field_key ?? value.field_id ?? value.field);
      const rawKey = fieldKey || cleanText(value.field_key ?? value.field_id ?? value.field) || "unknown-field";
      byField.set(rawKey, { ...value, field_key: rawKey });
    });
    if (isPlainObject(item.field_values)) {
      Object.keys(item.field_values).forEach((reference) => {
        const fieldKey = resolveLookup(fieldsResult.lookup, reference);
        const rawKey = fieldKey || reference;
        byField.set(rawKey, { field_key: rawKey, value: item.field_values[reference] });
      });
    }
    return [...byField.values()];
  }

  function isLegacyExport(input) {
    let document;
    try {
      document = typeof input === "string" ? parseJsonInput(input) : input;
    } catch {
      return false;
    }
    return isPlainObject(document)
      && !hasOwn(document, "format")
      && !hasOwn(document, "version")
      && !hasOwn(document, "list")
      && typeof document.title === "string"
      && (document.behaviors == null || isPlainObject(document.behaviors))
      && Array.isArray(document.fields)
      && Array.isArray(document.items);
  }

  function normalizeLegacyExport(input) {
    const document = typeof input === "string" ? parseJsonInput(input) : parseJsonInput(input);
    if (!isLegacyExport(document)) {
      throw codedError("NOT_LEGACY_FORMAT", "JSON is not a recognized unversioned ListMaker export.");
    }
    const native = exportNativeV1({
      list: {
        title: document.title,
        description: document.description,
        template_key: normalizeTemplateKey(document.template_key, "custom"),
        behaviors: document.behaviors || {},
        rating_type: document.rating_type,
        default_view: document.default_view,
        settings: document.settings,
      },
      categories: Array.isArray(document.categories) ? document.categories : [],
      statuses: Array.isArray(document.statuses) ? document.statuses : [],
      fields: document.fields,
      items: document.items,
      values: Array.isArray(document.values) ? document.values : [],
    });
    const { format, version, ...payload } = native;
    return payload;
  }

  function exportNativeV1(source) {
    if (!isPlainObject(source)) throw codedError("INVALID_EXPORT_SOURCE", "Export source must be an object.");
    if (source.format === NATIVE_FORMAT) {
      const payload = normalizeNativeV1(source);
      payload.items = payload.items.map((item, index) => ({ item, index }))
        .sort((left, right) => left.item.manual_order - right.item.manual_order || left.index - right.index)
        .map(({ item }) => item);
      return { format: NATIVE_FORMAT, version: NATIVE_VERSION, ...payload };
    }
    const categoriesResult = normalizeCategories(source.categories || []);
    const statusesResult = normalizeStatuses(source.statuses || []);
    const fieldsResult = normalizeFields(source.fields || []);
    const liveItems = (Array.isArray(source.items) ? source.items : [])
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !isPlainObject(item) || !item.deleted_at)
      .sort((left, right) => {
        const leftOrder = integerValue(isPlainObject(left.item) ? left.item.manual_order : null, (left.index + 1) * 100);
        const rightOrder = integerValue(isPlainObject(right.item) ? right.item.manual_order : null, (right.index + 1) * 100);
        return leftOrder - rightOrder || left.index - right.index;
      })
      .map(({ item }) => item);
    const items = liveItems.map((item, index) => {
      const object = isPlainObject(item) ? item : { title: item };
      return {
        title: object.title,
        completed: object.completed,
        manual_order: object.manual_order ?? (index + 1) * 100,
        score: object.score,
        rating: object.rating,
        category_key: resolveLookup(categoriesResult.lookup, object.category_key ?? object.category_id ?? object.category)
          || object.category_key || object.category_id || object.category || null,
        status_key: resolveLookup(statusesResult.lookup, object.status_key ?? object.status_id ?? object.status)
          || object.status_key || object.status_id || object.status || null,
        notes: object.notes,
        values: sourceValuesForItem(source, object, fieldsResult),
      };
    });
    const payload = normalizeAtomicImportPayload({
      list: source.list || {},
      categories: categoriesResult.rows,
      statuses: statusesResult.rows,
      fields: fieldsResult.rows,
      items,
    }, { strictKeys: true, strictReferences: false, defaultTemplate: "custom", preserveBehaviors: true });
    return { format: NATIVE_FORMAT, version: NATIVE_VERSION, ...payload };
  }

  return Object.freeze({
    MAX_JSON_BYTES,
    MAX_IMPORT_ITEMS,
    MAX_CATEGORIES,
    MAX_STATUSES,
    MAX_FIELDS,
    MAX_DROPDOWN_CHOICES,
    NATIVE_FORMAT,
    NATIVE_VERSION,
    TEMPLATE_KEYS,
    IMPORT_TEMPLATE_KEYS,
    TEMPLATE_CONFIG,
    FIELD_TYPES,
    RATING_TYPES,
    ADDITIONAL_DATA_FIELD_NAME,
    parseJsonInput,
    resolveJsonPointer,
    isNativeV1,
    normalizeNativeV1,
    isLegacyExport,
    normalizeLegacyExport,
    normalizeAiAnalysis,
    applyAnalysisMapping,
    normalizeAtomicImportPayload,
    applyTemplateOverride,
    exportNativeV1,
  });
});
