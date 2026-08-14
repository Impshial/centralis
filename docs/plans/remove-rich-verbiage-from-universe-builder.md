# Remove Old Rich Verbiage From Universe Builder

## Summary

Replace the old Universe Builder `Rich Details` naming with current Chronicle/default element template terminology. Do this in phases so user-facing language can be cleaned up first, runtime identifiers can be renamed safely, and any database rename can be handled with an explicit compatibility migration instead of a risky broad edit.

## Goals

- Remove visible `Rich Details` wording from Universe Builder UI.
- Rename active JavaScript state, helpers, data attributes, events, CSS classes, and export metadata that still use `rich` as a feature name.
- Decide whether `elements.rich_template_id` should be renamed to a current column name, then provide a migration path if so.
- Keep the `rich_text` field type unless a separate field-type rename is intentionally planned; it is a generic field type, not necessarily old feature branding.
- Preserve existing Chronicle/template behavior while changing names.

## Current Leftovers

- `flow-canvas.js`
  - Active constants and state use `RICH_DETAILS_EXPORT_FORMAT`, `richDetails`, `richDetailsData`, `richDetailsMode`, and `richTemplateId`.
  - Active helpers use names like `fetchRichDetailsData`, `renderRichDetails`, `saveRichDetails`, `exportRichDetails`, and `buildRichTemplateSectionModels`.
  - Supabase queries still select and update `rich_template_id`.
  - User-facing text still includes `Rich Details template` and import/export status messages.

- `universe-canvas.html`
  - The transfer checkbox is named `richDetails` and displays `Rich Details`.
  - The Chronicle preview modal uses `rich-details-*` ids, classes, and data attributes.
  - Template chooser copy says `Select a Rich Details template for this element.`

- `styles.css`
  - Active selectors use `.rich-details-*`, `.rich-template-*`, `.rich-view-field`, and related names.

- Supabase functions and migrations
  - `supabase/functions/generate-chronicle-details/index.ts` selects `rich_template_id`.
  - `supabase/functions/_shared/universe-ai.ts` includes `rich_template_id`.
  - Historical migrations include `rich_template_id`, `rich_details`, and `Rich Details`.
  - Admin purge migrations and RPCs clear `rich_template_id` references.

- Root bootstrap/library code
  - `script.js` contains old console messages such as `Rich template field seeding summary`.

## Phase 1: User-Facing Language

- Replace visible `Rich Details` labels with Chronicle/template wording.
  - Transfer checkbox: use `Chronicle Details` or `Chronicle Modules`.
  - Template chooser subtitle: use `Select a Chronicle template for this element.`
  - Delete confirmation: use `Elements using it will lose their selected Chronicle template.`
  - Import/export messages: use `Chronicle details` or `Chronicle template`.
- Update generated filenames and JSON labels only if backward compatibility is preserved.
- Leave internal variable names and database columns alone in this phase.

## Phase 2: Frontend Runtime Naming

- Rename JavaScript feature identifiers in `flow-canvas.js`.
  - `RICH_DETAILS_EXPORT_FORMAT` to `CHRONICLE_DETAILS_EXPORT_FORMAT`.
  - `richDetailsData` to `chronicleDetailsData`.
  - `richDetailsMode` to `chronicleDetailsMode`.
  - `richDetailsNodeId` to `chronicleDetailsNodeId`.
  - `richTemplateId` to `chronicleTemplateId` or `elementTemplateId`.
  - `fetchRichDetailsData` to `fetchChronicleDetailsData`.
  - `renderRichDetails` to `renderChronicleDetails`.
  - `saveRichDetails` to `saveChronicleDetails`.
  - `exportRichDetails` to `exportChronicleDetails`.
- Rename DOM events and data attributes.
  - `centralis:open-rich-details` to `centralis:open-chronicle-details`.
  - `data-rich-details-*` to `data-chronicle-details-*`.
  - `data-details-rich` to `data-details-chronicle`.
- Rename transfer/import/export payload keys that are internal to the app.
  - `richDetails` to `chronicleDetails`.
  - `rich_template_name` to `chronicle_template_name`.
  - `rich_values` to `chronicle_values`.
- Keep compatibility reads for existing exported JSON files using the old `centralis.rich-details.v1` format, or introduce a new version while accepting the old one.

## Phase 3: CSS Selector Rename

- Rename selectors in `styles.css` to match the new HTML data/classes.
  - `.rich-details-*` to `.chronicle-details-*`.
  - `.rich-template-*` to `.chronicle-template-*`.
  - `.rich-view-field` to `.chronicle-view-field`.
  - `.rich-checkbox-field` to `.chronicle-checkbox-field`.
- Update every matching class in `universe-canvas.html` and string-generated markup in `flow-canvas.js`.
- Avoid styling refactors in this pass; this should be a naming-only change.

## Phase 4: Database Column Decision

- Decide whether to keep `elements.rich_template_id` as a legacy DB column or rename it.
- Recommended new names:
  - `chronicle_template_id` if the selected template is specifically tied to Chronicle.
  - `element_template_id` if the selected template is a general element type template.
- If renaming, create a migration that:
  - Adds the new nullable column.
  - Backfills it from `rich_template_id`.
  - Adds a foreign key to `element_type_templates(id)` with `on delete set null`.
  - Adds an index on the new column.
  - Updates triggers/RPCs/functions to use the new column.
  - Optionally keeps `rich_template_id` during a transition period, synced from the new column if needed.
  - Drops the old column only after all app and edge function deployments are verified.
- Update Supabase Edge Functions:
  - `generate-chronicle-details`
  - `_shared/universe-ai.ts`
- Update admin purge RPCs and any database-module reports that clear template references.

## Phase 5: Historical Migration Handling

- Do not rewrite old applied migrations unless the project intentionally squashes migrations.
- Add new migrations for live schema changes.
- Leave old strings in historical migrations as historical record unless they are in reusable SQL functions that are recreated by newer migrations.
- Update `centralis_db_schema.md` after the live schema is changed.

## Compatibility Notes

- Existing exported JSON files may contain `centralis.rich-details.v1`, `rich_template_name`, or `rich_values`.
- The import path should accept both old and new payload keys during at least one compatibility window.
- The `rich_text` field type should remain valid in schemas/importers unless replaced by a separate migration and compatibility layer.
- Any DB column rename requires coordinated deployment because browser code and Edge Functions both read `rich_template_id` today.

## Test Plan

- Search verification:
  - `rg -n "Rich Details|rich-details|richDetails|richTemplate|rich_template_name|rich_values" flow-canvas.js universe-canvas.html styles.css script.js supabase/functions`
  - `rg -n "rich_template_id" flow-canvas.js supabase/functions supabase/migrations centralis_db_schema.md`
  - Confirm remaining matches are either compatibility handling, historical migrations, or intentional `rich_text`.
- Syntax checks:
  - `node --check .\flow-canvas.js`
  - `node --check .\script.js`
- Edge Function checks:
  - Type-check or deploy-check updated Supabase functions if DB/API names changed.
- Browser smoke tests:
  - Open Universe Builder.
  - Open Chronicle details from an element.
  - Edit and save Chronicle details.
  - Switch templates.
  - Export and import Chronicle details.
  - Transfer a universe with Chronicle details enabled.
  - Generate Chronicle details and universe AI responses that read element template data.
- Database verification if the column is renamed:
  - Existing elements retain their selected template.
  - Deleting an element type still clears affected element template references.
  - Admin purge functions still remove user template data cleanly.

## Assumptions

- The desired product language is Chronicle/default element templates, not `Rich Details`.
- `rich_text` remains an allowed field type.
- User-facing copy can change before internal/database names.
- A DB rename should be explicit and staged, not bundled into a broad frontend cleanup unless deployment timing is controlled.
