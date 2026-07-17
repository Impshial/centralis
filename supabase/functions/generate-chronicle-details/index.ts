import {
  createAdminClient,
  describeError,
  getAuthUser,
  handleCors,
  jsonResponse,
} from "../_shared/image-storage.ts";
import {
  cleanUniverseId,
  getAppUser,
  getOrCreateAiSource,
  loadUserUniverseAiSettings,
  loadUniverseContext,
  sendChronicleDetailsRequest,
} from "../_shared/universe-ai.ts";

const MAX_INSTRUCTIONS_LENGTH = 6000;
const MAX_FIELD_VALUE_LENGTH = 12000;
const MAX_FIELD_OUTPUT_LENGTH = 6000;
const GENERATABLE_FIELD_TYPES = new Set([
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "multi_select",
  "checkbox",
  "url",
  "rich_text",
]);

type TemplateSection = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number | null;
};

type TemplateField = {
  id: string;
  template_id: string;
  section_id: string | null;
  field_key: string | null;
  label: string;
  field_type: string | null;
  description: string | null;
  placeholder: string | null;
  options: unknown;
  is_required: boolean | null;
  sort_order: number | null;
};

function cleanText(value: unknown, maxLength = MAX_FIELD_VALUE_LENGTH) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function cleanInstructions(value: unknown) {
  return cleanText(value, MAX_INSTRUCTIONS_LENGTH);
}

function cleanIdList(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 80);
}

function getFieldType(field: TemplateField) {
  return String(field.field_type || "text").trim().toLowerCase();
}

function getFieldOptions(field: TemplateField) {
  const options = field.options;
  if (Array.isArray(options)) {
    return options.map((option) => String((option as Record<string, unknown>)?.label ?? (option as Record<string, unknown>)?.value ?? option).trim()).filter(Boolean);
  }
  if (options && typeof options === "object") {
    const record = options as Record<string, unknown>;
    if (Array.isArray(record.choices)) {
      return record.choices.map((option) => String((option as Record<string, unknown>)?.label ?? (option as Record<string, unknown>)?.value ?? option).trim()).filter(Boolean);
    }
    return Object.values(record)
      .filter((item) => typeof item === "string" || typeof item === "number")
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  return [];
}

function parseClientFieldValues(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return new Map<string, string>();
  }
  return new Map(Object.entries(value as Record<string, unknown>)
    .map(([fieldId, fieldValue]) => [String(fieldId).trim(), cleanText(fieldValue)] as const)
    .filter(([fieldId]) => Boolean(fieldId)));
}

function fieldHasValue(value: unknown) {
  return cleanText(value).length > 0;
}

function isGeneratableField(field: TemplateField) {
  return GENERATABLE_FIELD_TYPES.has(getFieldType(field));
}

function describeField(field: TemplateField) {
  const type = getFieldType(field);
  const options = getFieldOptions(field);
  return [
    `Field ID: ${field.id}`,
    `Label: ${field.label || field.field_key || "Untitled field"}`,
    `Type: ${type}`,
    field.description ? `Help: ${cleanText(field.description, 800)}` : "",
    field.placeholder ? `Placeholder: ${cleanText(field.placeholder, 400)}` : "",
    options.length ? `Allowed values: ${options.join(" | ")}` : "",
    field.is_required ? "Required: yes" : "",
  ].filter(Boolean).join("; ");
}

function buildPrompt(options: {
  universeName: string;
  element: Record<string, unknown>;
  elementTypeName: string;
  templateName: string;
  instructions: string;
  assignedModuleNames: string[];
  currentChronicleDetails: string;
  candidates: Array<{
    section: TemplateSection;
    isExisting: boolean;
    fields: TemplateField[];
  }>;
}) {
  const candidateText = options.candidates.map(({ section, isExisting, fields }) => [
    `## Module: ${section.name || "Untitled module"}`,
    `Section ID: ${section.id}`,
    `Already assigned: ${isExisting ? "yes" : "no"}`,
    section.description ? `Purpose: ${cleanText(section.description, 1000)}` : "",
    "Eligible blank fields:",
    ...fields.map((field) => `- ${describeField(field)}`),
  ].filter(Boolean).join("\n")).join("\n\n");

  return [
    "Choose only modules that materially improve this element. Inspect each module's field definitions and purpose, not its title alone.",
    "For an already assigned module, suggest values only for the eligible blank fields listed. Do not replace or repeat existing information.",
    "For a new module, include it only when its eligible fields add specific, useful canon. It is valid to return no modules.",
    "Treat file-search canon as authoritative. Clearly prefer direct support from the universe canon over invented facts; new material must be compatible suggestions, not stated as established canon.",
    "Return exactly this JSON shape: {\"modules\":[{\"section_id\":\"...\",\"fields\":[{\"field_id\":\"...\",\"value\":\"...\"}]}]}. Use only Section IDs and Field IDs listed below.",
    `Universe: ${options.universeName || "Untitled Universe"}`,
    `Element name: ${cleanText(options.element.name, 300) || "Untitled Element"}`,
    `Element type: ${options.elementTypeName || "No type"}`,
    `Element description: ${cleanText(options.element.description, 12000) || "No description has been defined."}`,
    `Chronicle template: ${options.templateName || "Untitled Template"}`,
    options.assignedModuleNames.length
      ? `Assigned modules: ${options.assignedModuleNames.join(" | ")}`
      : "No template modules are currently assigned.",
    options.currentChronicleDetails
      ? `Current assigned Chronicle modules and field values:\n${options.currentChronicleDetails}`
      : "No Chronicle module field values have been saved or staged yet.",
    options.instructions ? `User generation instructions:\n${options.instructions}` : "No additional user instructions were provided.",
    `Candidate modules and eligible fields:\n${candidateText}`,
  ].join("\n\n");
}

function normalizeSuggestionValue(value: unknown, field: TemplateField) {
  const type = getFieldType(field);
  const options = getFieldOptions(field);

  if (type === "checkbox") {
    if (value === true || ["true", "1", "yes", "on"].includes(cleanText(value).toLowerCase())) return "true";
    if (value === false || ["false", "0", "no", "off"].includes(cleanText(value).toLowerCase())) return "false";
    return "";
  }

  if (type === "multi_select") {
    const rawValues = Array.isArray(value)
      ? value.map((item) => cleanText(item, 300))
      : cleanText(value, MAX_FIELD_OUTPUT_LENGTH).split(/\r?\n|,/).map((item) => item.trim());
    const optionByKey = new Map(options.map((option) => [option.toLocaleLowerCase(), option]));
    const normalized = [...new Set(rawValues
      .map((item) => optionByKey.get(item.toLocaleLowerCase()))
      .filter(Boolean))];
    return normalized.join("\n");
  }

  const text = cleanText(value, MAX_FIELD_OUTPUT_LENGTH);
  if (!text) return "";

  if (type === "select" && options.length) {
    const selected = options.find((option) => option.toLocaleLowerCase() === text.toLocaleLowerCase());
    return selected || "";
  }
  if (type === "number") {
    const number = Number(text.replace(/,/g, ""));
    return Number.isFinite(number) ? String(number) : "";
  }
  if (type === "date") {
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
  }
  if (type === "url") {
    try {
      const url = new URL(text);
      return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
    } catch {
      return "";
    }
  }
  return text;
}

function cleanProposal(rawValue: unknown, candidates: Array<{
  section: TemplateSection;
  isExisting: boolean;
  fields: TemplateField[];
}>) {
  const rawModules = rawValue && typeof rawValue === "object" && Array.isArray((rawValue as Record<string, unknown>).modules)
    ? (rawValue as Record<string, unknown>).modules as Array<Record<string, unknown>>
    : [];
  const candidatesBySectionId = new Map(candidates.map((candidate) => [candidate.section.id, candidate]));
  const usedSections = new Set<string>();

  return rawModules.map((rawModule) => {
    const sectionId = String(rawModule?.section_id || "").trim();
    const candidate = candidatesBySectionId.get(sectionId);
    if (!candidate || usedSections.has(sectionId)) return null;
    usedSections.add(sectionId);

    const eligibleFields = new Map(candidate.fields.map((field) => [field.id, field]));
    const usedFields = new Set<string>();
    const fields = (Array.isArray(rawModule.fields) ? rawModule.fields : [])
      .map((rawField) => {
        const fieldId = String((rawField as Record<string, unknown>)?.field_id || "").trim();
        const field = eligibleFields.get(fieldId);
        if (!field || usedFields.has(fieldId)) return null;
        const value = normalizeSuggestionValue((rawField as Record<string, unknown>)?.value, field);
        if (!fieldHasValue(value)) return null;
        usedFields.add(fieldId);
        return {
          fieldId,
          label: field.label || field.field_key || "Untitled Field",
          fieldType: getFieldType(field),
          options: getFieldOptions(field),
          value,
        };
      })
      .filter(Boolean);

    if (!fields.length) return null;
    return {
      sectionId,
      sectionName: candidate.section.name || "Untitled Module",
      sectionDescription: candidate.section.description || "",
      isExisting: candidate.isExisting,
      fields,
    };
  }).filter(Boolean);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const authUser = await getAuthUser(req);
    const appUser = await getAppUser(authUser.id);
    const body = await req.json().catch(() => ({}));
    const elementId = String(body.elementId || "").trim();
    const templateId = String(body.templateId || "").trim();
    const selectedSectionIds = cleanIdList(body.sectionIds);

    if (!elementId || !templateId || !selectedSectionIds.length) {
      return jsonResponse({ error: "An element, template, and at least one module are required." }, 400);
    }

    const supabase = createAdminClient();
    const { data: element, error: elementError } = await supabase
      .from("elements")
      .select("id,name,description,element_type_id,universe_id,rich_template_id")
      .eq("id", elementId)
      .eq("user_id", appUser.id)
      .maybeSingle();

    if (elementError || !element) {
      throw elementError || new Error("That Chronicle element could not be found.");
    }

    const universeId = cleanUniverseId(element.universe_id);
    if (!universeId) {
      return jsonResponse({ error: "Attach this element to a Universe before using Chronicle AI." }, 400);
    }
    if (!element.element_type_id) {
      return jsonResponse({ error: "Choose an element type before using Chronicle AI." }, 400);
    }

    const { data: template, error: templateError } = await supabase
      .from("element_type_templates")
      .select("id,name,description,element_type_id")
      .eq("id", templateId)
      .eq("element_type_id", element.element_type_id)
      .maybeSingle();

    if (templateError || !template) {
      return jsonResponse({ error: "The selected Chronicle template is not available for this element." }, 400);
    }

    const [context, source, settings, sectionsResponse, fieldsResponse, modulesResponse, valuesResponse, typeResponse] = await Promise.all([
      loadUniverseContext(supabase, universeId, appUser.id),
      getOrCreateAiSource(supabase, universeId, appUser.id),
      loadUserUniverseAiSettings(supabase, appUser.id),
      supabase.from("element_template_sections").select("id,name,description,sort_order,is_hidden").eq("template_id", templateId).order("sort_order", { ascending: true }),
      supabase.from("element_type_template_fields").select("id,template_id,section_id,field_key,label,field_type,description,placeholder,options,is_required,sort_order,is_hidden").eq("template_id", templateId).order("sort_order", { ascending: true }),
      supabase.from("chronicle_modules").select("id,module_type,data").eq("element_id", elementId).eq("user_id", appUser.id).eq("module_type", "template_section"),
      supabase.from("element_template_field_values").select("template_field_id,value").eq("element_id", elementId),
      supabase.from("element_types").select("id,name").eq("id", element.element_type_id).eq("user_id", appUser.id).maybeSingle(),
    ]);

    if (sectionsResponse.error) throw sectionsResponse.error;
    if (fieldsResponse.error) throw fieldsResponse.error;
    if (modulesResponse.error) throw modulesResponse.error;
    if (valuesResponse.error) throw valuesResponse.error;
    if (typeResponse.error) throw typeResponse.error;

    const vectorStoreId = String(source.vector_store_id || "");
    if (source.sync_status !== "ready" || !vectorStoreId) {
      return jsonResponse({ error: "Universe knowledge needs to finish syncing before Chronicle AI can generate details." }, 409);
    }

    const allVisibleSections = ((sectionsResponse.data || []) as TemplateSection[])
      .filter((section) => !((section as Record<string, unknown>).is_hidden));
    const sections = allVisibleSections
      .filter((section) => selectedSectionIds.includes(section.id));
    const fields = ((fieldsResponse.data || []) as TemplateField[])
      .filter((field) => !((field as Record<string, unknown>).is_hidden));
    const fieldsBySection = fields.reduce((map, field) => {
      const sectionFields = map.get(String(field.section_id || "")) || [];
      sectionFields.push(field);
      map.set(String(field.section_id || ""), sectionFields);
      return map;
    }, new Map<string, TemplateField[]>());
    const storedValues = new Map((valuesResponse.data || []).map((value) => [String(value.template_field_id), cleanText(value.value)]));
    const clientValues = parseClientFieldValues(body.fieldValues);
    const assignedSectionIds = new Set((modulesResponse.data || [])
      .map((module) => String((module.data as Record<string, unknown>)?.section_id || ""))
      .filter(Boolean));
    const sectionNamesById = new Map(allVisibleSections.map((section) => [section.id, section.name || "Untitled Module"]));
    const assignedModuleNames = [...assignedSectionIds]
      .map((sectionId) => sectionNamesById.get(sectionId))
      .filter(Boolean) as string[];
    const currentChronicleDetails = fields
      .map((field) => {
        const storedValue = storedValues.get(field.id);
        const draftValue = clientValues.get(field.id);
        const value = fieldHasValue(storedValue) ? storedValue : draftValue;
        if (!fieldHasValue(value)) return "";
        const moduleName = sectionNamesById.get(String(field.section_id || "")) || "General Details";
        return `${moduleName} — ${field.label || field.field_key || "Untitled Field"}: ${cleanText(value, 1600)}`;
      })
      .filter(Boolean)
      .join("\n")
      .slice(0, 30000);

    const candidates = sections.map((section) => {
      const eligibleFields = (fieldsBySection.get(section.id) || [])
        .filter(isGeneratableField)
        .filter((field) => {
          // Database values are authoritative: a client must never be able to
          // present a populated field as blank to make AI overwrite it. The
          // client values only protect in-progress, unsaved editor input.
          const storedValue = storedValues.get(field.id);
          const draftValue = clientValues.get(field.id);
          return !fieldHasValue(storedValue) && !fieldHasValue(draftValue);
        });
      return {
        section,
        isExisting: assignedSectionIds.has(section.id),
        fields: eligibleFields,
      };
    }).filter((candidate) => candidate.fields.length);

    if (!candidates.length) {
      return jsonResponse({ proposal: { modules: [] } });
    }

    const elementDraft = body.elementDraft && typeof body.elementDraft === "object"
      ? body.elementDraft as Record<string, unknown>
      : {};
    const prompt = buildPrompt({
      universeName: context.universe.name,
      element: {
        name: cleanText(elementDraft.name || element.name, 300),
        description: cleanText(elementDraft.description || element.description, 12000),
      },
      elementTypeName: String(typeResponse.data?.name || "No type"),
      templateName: String(template.name || "Untitled Template"),
      instructions: cleanInstructions(body.instructions),
      assignedModuleNames,
      currentChronicleDetails,
      candidates,
    });
    const rawProposal = await sendChronicleDetailsRequest({ vectorStoreId, prompt, settings });
    const modules = cleanProposal(rawProposal, candidates);

    return jsonResponse({
      proposal: {
        elementId,
        templateId,
        modules,
      },
    });
  } catch (error) {
    console.error(error);
    return jsonResponse(describeError(error, "Could not generate Chronicle details."), 500);
  }
});
