# Centralis Module Low-Level Guide

Last updated: 2026-08-16

This document is a deliberately full technical map of Centralis as it exists in this repository. It is meant for future implementation work, debugging, onboarding, and "where does this thing live?" questions. It favors concrete filenames, data surfaces, runtime flows, and cross-module dependencies over marketing-level descriptions.

## 1. System Shape

Centralis is a static, multi-page web application backed by Supabase tables, Supabase Auth, Supabase Storage, and Supabase Edge Functions.

The app is not a single SPA router. Most modules are separate HTML entry points with their own JavaScript file. A few older/shared flows still live in the large shared `script.js`.

Core local runtime:

- `index.html`: signed-in homepage and auth shell.
- `script.js`: shared auth, theme, homepage, Universe Builder, document-upload, settings support, global menus, generation activity, and several shared helpers.
- `styles.css`: primary stylesheet for nearly every module.
- `tailwind.generated.css`: generated utility stylesheet used by some pages.
- `theme-bootstrap.js`: early theme initialization.
- `supabase-config.js`: Supabase URL/key bootstrap.
- `.local-static-server.js`: local static server and a few local API proxy helpers.
- `package.json`: local scripts, currently `dev`, `start`, and Tailwind build/watch.

Core external/runtime libraries:

- Supabase browser client via CDN.
- React 18 UMD and ReactDOM for canvas-heavy modules.
- React Flow for Universe Canvas.
- ELK for graph layout.
- Phosphor custom elements from local vendored assets in `assets/vendor/phosphor`.

Global data model tendencies:

- Most user-owned rows contain `user_id`.
- Most modern user-owned content uses soft-delete fields: `deleted`, `deleted_at`, `deleted_by`.
- Admin visibility is controlled through the `users.admin` flag and admin-only UI gates.
- Several modules store large binary/document/image payloads through Supabase Storage and keep metadata in database tables.
- Edge Functions do most AI, document extraction, image generation, and storage signing work.

## 2. Shared Shell, Auth, Theme, and Navigation

### Files

- `index.html`
- `script.js`
- `styles.css`
- `theme-bootstrap.js`
- `supabase-config.js`
- `assets/centralis-icon.svg`
- `assets/theme-palettes.json`

### Responsibilities

The shared shell handles:

- Supabase client initialization.
- Auth modal behavior and login/signup/OAuth.
- Signed-in profile bootstrap.
- User settings bootstrap.
- Theme library loading and theme menu behavior.
- Header navigation and dropdown menu behavior.
- Admin-only element visibility.
- Generation activity badge/modal.
- Global image viewer support through `centralis-image-viewer.js`.

### Important Auth Flow

`script.js` initializes `supabaseClient` when `window.supabase` and `window.CENTRALIS_SUPABASE_CONFIG` are available. The main profile path is:

1. Read session through `supabaseClient.auth.getSession()`.
2. If signed out, reveal the signed-out landing/auth experience.
3. If signed in, call `prepareSignedInUser(authUser)`.
4. `prepareSignedInUser` ensures a row in the app `users` table.
5. It ensures user settings.
6. It starts element type library seed work.
7. It loads theme library and applies settings.
8. It starts page-specific home/recent data loaders where appropriate.

### User Settings

Settings are stored in `user_settings`. Known shared settings include:

- Theme selection.
- AI provider/model configuration.
- Arc Studio tutorial completion.
- Image generation active settings.

### Theme System

Theme data is a mix of:

- Built-in palettes in `script.js`.
- External/imported palette asset: `assets/theme-palettes.json`.
- Database themes from theme migrations.
- User theme menu order/selection.

The theme system intentionally runs early. `theme-bootstrap.js` prevents a visible light/dark flash before `script.js` finishes.

### Global Generation Activity

Generation jobs are stored in `generation_jobs` and surfaced through:

- Header generation activity icon.
- `list-generation-jobs`
- `cancel-generation-job`
- `fail-generation-job`

This cross-module queue is used by image generation, God Engine images, Arc manuscript work, and other async AI tasks.

## 3. Homepage Dashboard

### Files

- `index.html`
- `script.js`
- `styles.css`

### Route

- `index.html`

### Purpose

The signed-in homepage is a dark gallery style command center. It summarizes activity across Centralis and gives jump-off points into major modules.

### Major DOM Hooks

- `data-home-feature`
- `data-home-feature-status`
- `data-home-today-card`
- `data-home-mini-calendar`
- `data-home-mini-calendar-title`
- `data-home-glance`
- `data-home-quick-access`
- `data-home-recent-work`
- `data-home-refreshed`
- `data-home-stat`
- `data-home-stat-value`
- `data-home-stat-detail`

### Primary JS Functions

In `script.js`:

- `loadHomeDashboardOverview()`
- `fetchHomeUniversesMetric()`
- `fetchHomeChronicleMetric()`
- `fetchHomeChatLogMetric()`
- `fetchHomeCalendarMetric()`
- `fetchHomeTodoMetric()`
- `fetchHomeMovieMetric()`
- `fetchHomeImageMetric()`
- `renderHomeFeature(records)`
- `renderHomeToday(calendarMetric, todoMetric)`
- `renderHomeMiniCalendar(calendarMetric)`
- `renderHomeModules(metrics)`
- `loadHomeRecentWork()`
- `renderHomeRecentWork(records)`

### Data Sources

Homepage aggregates:

- Universes from `universes`.
- Chronicle elements from `elements`.
- Arc projects from `arc_projects`.
- Source documents from `universe_source_documents`.
- Calendar events from `calendars` and `events`.
- ToDo tasks from `todo_tasks`.
- Movies from movie tracker tables.
- Image generation sessions/assets.
- Admin-only chat logs from `chat_logs`.

### Feature Card Logic

`loadHomeRecentWork()` queries multiple modules, normalizes them into a shared record shape, sorts by timestamp, and promotes the newest item into `Continue Where You Left Off`.

Record shape includes:

- `id`
- `moduleKey`
- `label`
- `title`
- `description`
- `meta`
- `timestamp`
- `href`
- `icon`
- `cta`
- `imageUrl`
- `accent`

### Mini Month Calendar

`fetchHomeCalendarMetric()` loads:

- Upcoming events/tasks for the Today card.
- Current-month event/task dates for the mini calendar markers.

The mini calendar is display-only:

- Current month only.
- Highlights today.
- Marks days with events/tasks.
- Links to the full Calendar.

### Admin Rules

Chat repository content is hidden unless `currentAppUser.admin === true`.

## 4. Universe Builder

### Files

- `universe-builder.html`
- `script.js`
- `styles.css`

### Route

- `universe-builder.html`

### Purpose

Universe Builder manages the top-level universe records that later open into the visual Universe Canvas.

### Main Concepts

A universe is the root container for:

- Canvas nodes.
- Elements.
- Element groups.
- Links.
- Layers.
- Source documents.
- AI expert knowledge.
- Chronicle views.
- Arc Studio source context where linked.

### Tables

Core:

- `universes`
- `element_types`
- `element_type_templates`
- `element_template_sections`
- `element_type_template_fields`
- `element_template_field_values`
- `default_element_types`
- `default_element_type_templates`
- `default_element_template_sections`
- `default_element_type_template_fields`

Supporting:

- `universe_source_documents`
- `object_images` through image Edge Functions/storage metadata.
- `generation_jobs` for async image/AI jobs.

### Important JS State

In `script.js`:

- `universeBuilderUniverses`
- `universeBuilderPrimaryImages`
- `stagedUniverseSourceDocument`
- `universeAiReviewDraft`
- `universeAiMultiReviewDrafts`
- `currentAppUser`
- `currentUserSettings`

### Main Flows

#### Load Universe Cards

`loadUniverseCards()`:

1. Queries `universes`.
2. Filters out `deleted`.
3. Fetches primary images through `fetchPrimaryImagesByObjectId()`.
4. Renders card/list view with `renderUniverseCards()`.

#### Create Normal Universe

`createUniverseFromForm()`:

1. Reads form values.
2. If AI toggle is enabled, branches to AI generation review.
3. Otherwise validates name.
4. Calls `createUniverseRecord()`.
5. If a source document was staged, saves it and stores `centralis-source-populate:{universeId}` in session storage.
6. Stores `centralis-new-universe-source-prompt:{universeId}` for first canvas open.
7. Redirects to `universe-canvas.html?universe_id=...`.

#### Create AI Universe

AI creation uses:

- `generateUniverseDraft()`
- `generateUniverseIdeas()`
- `openUniverseAiReviewDialog()`
- `openUniverseAiMultiReviewDialog()`
- `finalizeGeneratedUniverse()`
- `createSelectedGeneratedUniverses()`

Single AI universe creation also sets the first-open source-file prompt flag before redirect.

#### Source Document During Creation

The new-universe dialog can stage a document:

- `openUniverseSourceUploadDialog()`
- `upload/extract` through `extract-universe-source-document`
- Metadata fills name/description if extracted.
- Final save uses `upload-universe-source-document`.

### Edge Functions

- `extract-universe-source-document`
- `upload-universe-source-document`
- `list-universe-source-documents`
- `generate-universe-metadata`

## 5. Universe Canvas

### Files

- `universe-canvas.html`
- `flow-canvas.js`
- `script.js`
- `styles.css`
- `centralis-image-viewer.js`

### Route

- `universe-canvas.html?universe_id={uuid}`

### Purpose

Universe Canvas is the visual graph editor for a universe. It is the densest module in the app.

It handles:

- Universe root node.
- Element nodes.
- Element links.
- Element groups.
- Canvas notes.
- Overlay layers.
- Image galleries.
- Element generation.
- Import/export.
- Source document management.
- Source-document population.
- AI Expert.
- Source canon review.
- Element details/editing.
- Auto-layout.

### Major Libraries

- React.
- ReactDOM.
- React Flow.
- ELK layout engine.
- Supabase client.

### Core Tables

- `universes`
- `elements`
- `element_links`
- `element_groups`
- `canvas_notes`
- `universe_layers`
- `universe_layer_entries`
- `element_layer_assignments`
- `element_types`
- `element_type_templates`
- `element_template_sections`
- `element_type_template_fields`
- `element_template_field_values`
- `universe_source_documents`
- `universe_ai_sources`
- `universe_ai_chats`
- `universe_ai_messages`
- `universe_ai_proposals`
- `universe_source_canon_reviews`
- `universe_source_canon_conflicts`
- `universe_source_canon_notes`
- `universe_source_element_suggestions`

### Initial Load

At startup, `flow-canvas.js`:

1. Reads `universe_id` from query params.
2. Loads the current app user if needed.
3. Loads the universe record.
4. Captures universe data and marks `opened_at`.
5. Loads element types for the universe owner.
6. Loads groups, notes, elements, links, layers.
7. Loads object images for universe and elements.
8. Constructs React Flow nodes and edges.
9. Mounts the React app.

### Important Canvas Runtime State

Representative state includes:

- `universe`
- `elementTypes`
- `elements`
- `elementGroups`
- `canvasNotes`
- `elementLinks`
- `imageRows`
- `overlayLayers`
- `overlayLayerEntries`
- `overlayLayerAssignments`
- `nodesRef`
- `edgesRef`
- `universeFormatRef`
- `activeLayerIdRef`

### Node Types

Typical visual nodes:

- Universe root.
- Element node.
- Group.
- Note.

Element node data carries:

- Record ID.
- Element name.
- Description.
- Element type.
- Template/field info.
- Formatting.
- Image data.
- Layer metadata.

### Link Model

Links are stored in `element_links`.

They include:

- Source element ID.
- Target element ID.
- Label.
- Stroke color.
- Stroke width.
- Stroke style.
- Path type.

Universe root links are allowed by migration `202605310002_allow_universe_root_links.sql`.

### Auto Layout

Auto layout uses ELK. It lays out nodes based on graph relationships and then saves positions back to relevant tables.

### Import/Export

The Options menu supports:

- Import.
- Export.
- Documents.
- Generate from Document.
- Edit Types.

Transfer options include:

- Connections.
- Position.
- Rich details.
- Custom fields.

### Source Documents Modal

HTML:

- `#universe-source-documents-modal`
- `data-source-documents-form`
- `data-source-documents-list`
- `data-source-documents-count`

Shared JS in `script.js`:

- `openSourceDocumentsDialog(universe)`
- `closeSourceDocumentsDialog()`
- `loadUniverseSourceDocuments(universeId)`
- `uploadUniverseSourceDocument(event)`
- `renderSourceDocumentRows(documents, options)`

The dialog can operate in two modes:

- Normal document management.
- `source-populate` action mode.

In source-populate mode:

- Uploaded files dispatch `centralis:source-populate-documents-uploaded`.
- Existing eligible rows render with a `Generate` action.
- Clicking an eligible document dispatches the same event.

### Generate from Document

The canvas source-populate flow lives in `flow-canvas.js`.

Important elements:

- `#source-populate-prompt-modal`
- `#source-populate-review-modal`
- `data-source-populate-yes`
- `data-source-populate-no`
- `data-source-populate-review-list`
- `data-source-populate-finalize`

Important functions:

- `getSourcePopulateSessionKey()`
- `getFirstOpenSourcePromptKey()`
- `openSourcePopulatePrompt(document)`
- `openFirstSourceUploadPrompt()`
- `maybeOpenSourcePopulatePrompt()`
- `analyzeSourcePopulateDocument()`
- `finalizeSourcePopulateElements()`
- `handleSourcePopulateDocumentsUploaded(event)`

First-open behavior:

- `script.js` sets `centralis-new-universe-source-prompt:{universeId}` in session storage when creating a new single universe.
- `flow-canvas.js` checks that key after mount.
- If the key exists and no source document is already queued, it asks whether to generate from a file.

Any-time behavior:

- Options menu item `Generate from Document` opens the same source-upload prompt.
- The user can upload a new source document or choose an existing eligible document.
- The document is streamed through `stream-universe-source-elements`.
- Generated elements are reviewed before insertion.

### AI Expert

AI Expert uses:

- `universe_ai_sources`
- `universe_ai_chats`
- `universe_ai_messages`
- `universe_ai_proposals`

Edge Functions:

- `sync-universe-ai-source`
- `get-universe-ai-chat`
- `send-universe-ai-message`
- `stream-universe-ai-message`

The AI Expert can propose changes such as creating elements. Pending proposals are reviewed before finalization.

### Source Canon Review

This is separate from source-populate, although both use source documents.

Source canon review compares uploaded documents to known universe canon and can create suggestions.

Tables:

- `universe_source_canon_reviews`
- `universe_source_canon_conflicts`
- `universe_source_canon_notes`
- `universe_source_element_suggestions`

Edge Functions:

- `compare-universe-source-document`
- `generate-source-canon-elements`

Events:

- `centralis:source-canon-elements-finalized`
- `centralis:review-source-canon-elements`

## 6. Chronicle

### Files

- `chronicle.html`
- `chronicle.js`
- `chronicle-editor.html`
- `script.js`
- `styles.css`

### Routes

- `chronicle.html`
- `chronicle-editor.html#universe/{universeId}/element/{elementId}`
- `chronicle-editor.html#element/{elementId}`

### Purpose

Chronicle is the structured element browser/editor side of Universe Builder. Where Universe Canvas is graph-first, Chronicle is content-first.

### Tables

- `elements`
- `element_types`
- `element_type_templates`
- `element_template_sections`
- `element_type_template_fields`
- `element_template_field_values`
- `chronicle_modules`
- `universes`
- `object_images` through image Edge Functions.

### Core Concepts

Chronicle elements are the same `elements` records used by Universe Canvas. Chronicle adds:

- Section/module oriented views.
- Element detail generation.
- Template-driven field editing.
- Rich/custom fields.
- Universe-aware filtering.

### Edge Functions

- `generate-chronicle-details`
- `generate-universe-element`
- `generate-object-image`
- `upload-object-image`
- `list-object-images`
- `set-primary-image`
- `delete-object-image`

### Integration Points

- Universe Canvas creates and links elements.
- Chronicle edits the same records.
- Arc Studio can link story units to elements.
- Object images are shared with Universe Builder and the homepage.

## 7. Element Type and Template System

### Files

- `script.js`
- `settings.html`
- `settings.js`
- `universe-canvas.html`
- `flow-canvas.js`
- `chronicle.js`
- `styles.css`

### Purpose

The element type system defines what kinds of objects can exist inside a universe and what template fields each type has.

### Default Tables

- `default_element_types`
- `default_element_type_templates`
- `default_element_template_sections`
- `default_element_type_template_fields`

### User Tables

- `element_types`
- `element_type_templates`
- `element_template_sections`
- `element_type_template_fields`
- `element_template_field_values`

### Seeding and Sync

Important RPCs:

- `ensure_user_element_type_library(p_user_id integer)`
- `get_element_type_seed_diagnostics(p_user_id integer)`
- `export_default_element_type(p_default_element_type_id varchar default null)`
- `import_default_element_type(p_payload jsonb)`
- `sync_default_element_types_to_users()`

### Settings Elements Tab

The Settings page includes an Elements tab that supports:

- Exporting a real default element type example. Current fixed example target is `Artifact`.
- Exporting a schema file.
- Importing default element type data.
- Manual sync of default element types into user libraries.

### Deletion Behavior

Recent changes require hard removal of element type field/template data where appropriate, rather than only soft-deleting type rows, because the default element type system expects actual cleanup in user-specific field structures.

### Legacy Rich Naming

Some table names and fields still contain old `rich` terminology, especially around `rich_template_id` and rich detail views. A saved plan exists at:

- `docs/plans/remove-rich-verbiage-from-universe-builder.md`

## 8. Arc Studio

### Files

- `arc-studio.html`
- `arc-studio.js`
- `arc-workspace.html`
- `styles.css`
- `script.js` for homepage integration.

### Routes

- `arc-studio.html`
- `arc-workspace.html?project_id={uuid}`

### Purpose

Arc Studio is a story-structure module for planning narrative movement. It organizes projects, units/scenes, threads, timelines, character arcs, diagnostics, and source documents.

### Tables

From Arc migrations:

- `arc_projects`
- `arc_units`
- `arc_unit_elements`
- `arc_threads`
- `arc_thread_units`
- `arc_character_arcs`
- `arc_arc_stages`
- `arc_setups_payoffs`
- `arc_unit_links`
- `arc_element_states`
- `arc_diagnostic_reports`
- `arc_source_documents`

Generation jobs also support Arc manuscript processing:

- `generation_jobs`

### Primary Views

Arc Workspace includes:

- Outline.
- Corkboard.
- Timeline.
- Arc Map.
- Diagnostics.

### Project Data

`arc_projects` includes:

- `title`
- `logline`
- `premise`
- `genre`
- `format`
- `status`
- `target_length`
- `notes`
- `cover_image_url`
- soft-delete fields
- timestamps

### Unit Data

`arc_units` represent story units/scenes/beats. Fields include ordering/status/context/summary fields depending on migration version.

### Source Documents

Arc has its own source document pipeline:

- `arc_source_documents`
- `upload-arc-source-document`
- `extract-arc-source-document`

### Edge Functions

- `analyze-arc-story`
- `upload-arc-source-document`
- `extract-arc-source-document`
- `process-arc-manuscript-breakdown-job`
- `get-arc-manuscript-breakdown-job`

### Homepage Integration

Homepage `Latest Work` queries `arc_projects`, ordered by `updated_at`, using `cover_image_url` when available.

## 9. Stellar Architect

### Files

- `stellar-architect.html`
- `stellar-architect.js`
- `styles.css`

### Route

- `stellar-architect.html`

### Purpose

Stellar Architect generates and manages star systems, stars, planets, moons, lifeforms, colonies, and colonists.

### Tables

- `stellar_systems`
- `stellar_stars`
- `stellar_planets`
- `stellar_moons`
- `stellar_lifeforms`
- `stellar_colonies`
- `stellar_colonists`

### Edge Functions

- `generate-stellar-system`
- `generate-stellar-details`
- `generate-stellar-moons`
- `generate-stellar-lifeforms`
- `generate-stellar-colony`
- `generate-stellar-colonists`

### Data Flow

Typical generation sequence:

1. User creates or selects a system.
2. AI generation creates system/star/planet details.
3. Follow-up functions enrich moons, lifeforms, colonies, and colonists.
4. Rows are persisted in Stellar tables.

### Cross-Module Surface

Stellar Architect is under World Building navigation but has a separate schema from Universe Builder. It can inspire content but does not currently share element records by default.

## 10. Image Generation

### Files

- `image-generation.html`
- `image-generation.js`
- `styles.css`
- `assets/venice-styles/*`

### Route

- `image-generation.html`

### Purpose

Image Generation is a session-based image creation workspace with provider/model/settings support, reference uploads, zip download, and asset management.

### Tables

- `image_generation_sessions`
- `image_generation_messages`
- `image_generation_assets`
- `generation_jobs`
- user settings fields for active generation preferences.

### Storage/Assets

Assets are backed by Supabase Storage and signed through Edge Functions. Style thumbnails live in:

- `assets/venice-styles/`

### Edge Functions

- `generate-session-images`
- `generate-object-image`
- `upload-image-generation-reference`
- `get-image-generation-session`
- `get-image-generation-asset-url`
- `delete-image-generation-session`
- `delete-image-generation-turn`
- `download-image-generation-zip`
- `cancel-image-generation`
- `migrate-centralis-image-storage`

### Shared Image Object Functions

Used by Universe/Chronicle/Arc-ish object image workflows:

- `upload-object-image`
- `list-object-images`
- `set-primary-image`
- `delete-object-image`
- `unlink-object-images`
- `get-storage-object-url`

## 11. Movie Tracker

### Files

- `movie-tracker.html`
- `movie-tracker.js`
- `supabase/seed_movie_tracker_data.sql`
- `styles.css`

### Route

- `movie-tracker.html`

### Purpose

Movie Tracker manages movies, collections, franchises, watched/downloaded status, and external lookup metadata.

### Tables

- `franchise`
- `collections`
- `movies`

### Edge Functions

- `lookup-movie-omdb`
- `lookup-movie-poster-tmdb`

### Data Notes

Migration `202607130001_normalize_movie_titles_leading_the.sql` normalizes leading title articles for better sorting/searching.

### Homepage Integration

Homepage metrics summarize movie totals/downloaded counts and link to Movie Tracker.

## 12. Calendar

### Files

- `calendar.html`
- `calendar.js`
- `script.js` for homepage calendar metric.
- `styles.css`

### Route

- `calendar.html`

### Purpose

Calendar tracks events across visible calendars and feeds upcoming/today data to the homepage.

### Tables

The app references:

- `calendars`
- `events`

Calendar migrations are not obvious in this snapshot, which implies those tables may predate the migration set or were created outside the visible migrations.

### Homepage Integration

`fetchHomeCalendarMetric()` reads:

- Visible calendars for current user.
- Upcoming events.
- Current-month events for mini-calendar markers.
- Dated ToDo tasks for combined schedule markers.

## 13. ToDo

### Files

- `todo.html`
- `todo.js`
- `script.js` for homepage metric.
- `styles.css`

### Route

- `todo.html`

### Purpose

ToDo manages task planning with tasks and subtasks.

### Tables

- `todo_tasks`
- `todo_subtasks`

### Homepage Integration

Homepage uses ToDo data for:

- Open task counts.
- Scheduled/due task counts.
- Today card.
- Mini-calendar date markers.

## 14. Chat Repository

### Files

- `chat-repository.html`
- `chat-repository.js`
- `styles.css`

### Route

- `chat-repository.html`

### Purpose

Chat Repository stores, analyzes, searches, edits, and retrieves chat logs. It is admin-visible in the homepage/dashboard contexts.

### Tables

- `chat_logs`

### Edge Functions

- `upload-chat-log`
- `get-chat-log`
- `save-chat-log`
- `delete-chat-log`
- `reindex-chat-logs`
- `generate-chat-log-metadata`
- `analyze-chat-log-layout`

### Important Behaviors

- Search support was added by `202606260001_add_chat_repository_search.sql`.
- Soft delete support was backfilled.
- Admin activity/purge modules include chat-log counts.

## 15. Roleplayer

### Files

- `roleplayer.html`
- `roleplayer.js`
- `roleplayer-character.schema.json`
- `styles.css`

### Route

- `roleplayer.html`

### Purpose

Roleplayer is a local/AI chat character system with characters, personas, sessions, messages, and memories.

### Tables

After migration rename:

- `roleplayer_characters`
- `roleplayer_personas`
- `roleplayer_sessions`
- `roleplayer_messages`
- `roleplayer_memories`

Earlier names were `local_chat_*`, renamed by `202608050001_rename_roleplayer_tables.sql`.

### Schema File

`roleplayer-character.schema.json` defines expected character payload shape for imports/validation.

## 16. God Engine

### Files

- `god-engine.html`
- `god-engine.js`
- `god-canvas.html`
- `god-canvas.js`
- `god-autopilot.html`
- `god-autopilot.js`
- `styles.css`

### Routes

- `god-engine.html`
- `god-canvas.html`
- `god-autopilot.html`

### Purpose

God Engine simulates/specifies evolutions, species, and evolutionary events. It includes starter generation, species naming/images, custom evolution traits, and time fields.

### Tables

- `god_evolutions`
- `god_species`
- `god_evolution_events`
- `generation_jobs`

### Edge Functions

- `generate-god-starter`
- `generate-god-evolution`
- `generate-god-species-name`
- `generate-god-species-image`

### Notes

God Engine uses generation jobs for longer AI/image actions and has multiple UI modes/pages rather than a single page.

## 17. Fusion

### Files

- `fusion.html`
- `fusion.js`
- `styles.css`

### Route

- `fusion.html`

### Purpose

Fusion is a discovery/combination game system.

### Tables

- `fusion_level0_items`
- `fusion_games`
- `fusion_game_level0_items`
- `fusion_game_discoveries`

### RPCs

- `create_fusion_game(p_user_id integer)`

### Edge Functions

- `generate-fusion-discovery`

### Migration Notes

`202608040003_remove_fusion_recipes.sql` indicates recipe-style data was removed or deprecated after the initial Fusion implementation.

## 18. Episode Roulette

### Files

- `episode-roulette.html`
- `episode-roulette.js`
- `styles.css`

### Route

- `episode-roulette.html`

### Purpose

Episode Roulette stores recent shows and chooses/randomizes episodes, with TMDB support.

### Tables

- `recent_shows`

### Edge Functions

- `episode-roulette-tmdb`

## 19. Useful Things

### Files

- `useful-things.html`
- `useful-things.js`
- `styles.css`

### Route

- `useful-things.html`

### Purpose

Useful Things is a utilities module. It contains text conversion, calculators, generators, storage utilities, and a Combine/Split tab.

### Tabs

Current useful sections include:

- Text Converter.
- Calculators.
- Generators.
- Combine and Split.
- Storage.

### Combine and Split

Combine supports:

- Selecting multiple `.txt` files.
- Requiring at least two files.
- Clearing selected files.
- Reordering/removing files in a small popup.
- Master file name.
- Separator selection:
  - Double Line Break.
  - Single Line Break.
  - Dashed Line.
  - Asterisk Line.
- Client-side text combining with `File.text()`.
- Downloading a `.txt` master file.

Important DOM hooks:

- `data-useful-tab="combine-split"`
- `data-combine-file-input`
- `data-combine-select-files`
- `data-combine-clear-files`
- `data-combine-file-list`
- `data-combine-master-name`
- `data-combine-separator`
- `data-combine-open-order`
- `data-combine-run`
- `data-combine-status`

### Edge Functions

- `convert-text-format`
- Storage browsing/signing functions where used.

## 20. ListMaker

### Files

- `listmaker.html`
- `listmaker-list.html`
- `listmaker.js`
- `styles.css`

### Routes

- `listmaker.html`
- `listmaker-list.html`

### Purpose

ListMaker is a flexible saved list system with custom categories, statuses, fields, items, and field values.

### Tables

- `listmaker_lists`
- `listmaker_categories`
- `listmaker_statuses`
- `listmaker_fields`
- `listmaker_items`
- `listmaker_field_values`

### Triggers/RPCs

- `touch_listmaker_updated_at()`
- `touch_listmaker_list_from_child()`

### Data Model Notes

ListMaker is intentionally generic: fields and values are user-configured rather than hard-coded per list type.

## 21. Settings

### Files

- `settings.html`
- `settings.js`
- `script.js`
- `styles.css`

### Route

- `settings.html`

### Purpose

Settings manages user preferences, AI settings, admin data tools, theme options, and default element type import/export/sync.

### Major Areas

- General preferences.
- Theme/custom theme management.
- AI provider/model settings.
- Database/admin tools.
- Elements tab.

### Admin Purge/Activity

Relevant RPCs:

- `get_admin_purge_user_object_counts`
- `admin_purge_data`
- `admin_purge_data_for_current_user`
- `list_admin_user_activity`

Relevant Edge Function:

- `purge-admin-data`
- `list-admin-purge-users`

### Elements Tab

Supports:

- Export Artifact default element type example.
- Export schema.
- Import default element type payload.
- Sync default element types to existing user libraries.

Relevant RPCs:

- `export_default_element_type`
- `import_default_element_type`
- `sync_default_element_types_to_users`

## 22. Designer

### Files

- `designer.html`
- `designer.js`
- `styles.css`

### Route

- `designer.html`

### Purpose

Designer appears to be an experimental/design utility module. It has its own page and script, but it is not as deeply tied into the database migrations as the core worldbuilding modules.

### Notes

Treat as a standalone tool unless future work finds active database dependencies.

## 23. Local Static Server and API Helpers

### File

- `.local-static-server.js`

### Purpose

The local server:

- Serves static files.
- Reads `.env`.
- Provides local helper endpoints for model/image workflows.
- Uses `PORT` or defaults to `4173`.

### Scripts

From `package.json`:

- `npm run dev`
- `npm start`
- `npm run tailwind:build`
- `npm run tailwind:watch`

## 24. Supabase Edge Function Inventory

### Shared Folders

- `_shared/chat-storage.ts`
- `_shared/fictional-naming-rules.ts`
- `_shared/generation-jobs.ts`
- `_shared/image-generation.ts`
- `_shared/image-storage.ts`
- `_shared/openai-config.ts`
- `_shared/source-canon-review.ts`
- `_shared/source-documents.ts`
- `_shared/stellar-generation.ts`
- `_shared/universe-ai.ts`
- `_shared/venice-image-models.ts`

### Worldbuilding and Universe AI

- `generate-universe-metadata`
- `generate-universe-element`
- `generate-universe-elements`
- `analyze-universe-source-elements`
- `extract-universe-source-document`
- `upload-universe-source-document`
- `list-universe-source-documents`
- `stream-universe-source-elements`
- `compare-universe-source-document`
- `generate-source-canon-elements`
- `sync-universe-ai-source`
- `get-universe-ai-chat`
- `send-universe-ai-message`
- `stream-universe-ai-message`

### Arc Studio

- `analyze-arc-story`
- `upload-arc-source-document`
- `extract-arc-source-document`
- `process-arc-manuscript-breakdown-job`
- `get-arc-manuscript-breakdown-job`

### Images and Storage

- `generate-object-image`
- `generate-session-images`
- `upload-image-generation-reference`
- `get-image-generation-session`
- `get-image-generation-asset-url`
- `download-image-generation-zip`
- `delete-image-generation-session`
- `delete-image-generation-turn`
- `cancel-image-generation`
- `upload-object-image`
- `list-object-images`
- `set-primary-image`
- `delete-object-image`
- `unlink-object-images`
- `get-storage-object-url`
- `browse-storage`
- `migrate-centralis-image-storage`

### Stellar

- `generate-stellar-system`
- `generate-stellar-details`
- `generate-stellar-moons`
- `generate-stellar-lifeforms`
- `generate-stellar-colony`
- `generate-stellar-colonists`

### God Engine

- `generate-god-starter`
- `generate-god-evolution`
- `generate-god-species-name`
- `generate-god-species-image`

### Chat Repository

- `upload-chat-log`
- `get-chat-log`
- `save-chat-log`
- `delete-chat-log`
- `reindex-chat-logs`
- `generate-chat-log-metadata`
- `analyze-chat-log-layout`

### Entertainment and Utilities

- `lookup-movie-omdb`
- `lookup-movie-poster-tmdb`
- `episode-roulette-tmdb`
- `generate-fusion-discovery`
- `convert-text-format`

### Admin and Jobs

- `list-generation-jobs`
- `cancel-generation-job`
- `fail-generation-job`
- `purge-admin-data`
- `list-admin-purge-users`

## 25. Database Migration Timeline by Feature

### Element Type Library and Universe Foundations

- `202604270001_user_level_element_type_library.sql`
- `202604300001_ensure_user_element_type_library_rpc.sql`
- `202604300002_fix_element_type_library_rpc_field_keys.sql`
- `202604300003_normalize_seeded_template_field_keys.sql`
- `202604300004_simplify_element_type_library_seed.sql`
- `202604300005_add_element_type_seed_diagnostics.sql`
- `202604300006_reseed_partial_template_fields.sql`
- `202604300007_add_element_rich_template_id.sql`
- `202605010001_template_default_provenance.sql`

### Canvas Layers, Groups, Notes, Links

- `202605030001_add_overlay_layers.sql`
- `202605030002_allow_multi_entry_layer_assignments.sql`
- `202605040001_add_element_groups.sql`
- `202605040002_repair_element_group_fk.sql`
- `202605040003_add_group_background_color.sql`
- `202605070001_add_canvas_note_text_color.sql`
- `202605310001_universe_delete_cascade_cleanup.sql`
- `202605310002_allow_universe_root_links.sql`
- `202606010001_nested_element_groups.sql`

### Movie Tracker

- `202605080001_add_movie_tracker.sql`
- `202607130001_normalize_movie_titles_leading_the.sql`

### Stellar Architect

- `202605100001_add_stellar_architect.sql`
- `202605110001_extend_stellar_lifeforms.sql`
- `202607260001_add_stellar_colony_generation.sql`

### Chronicle

- `202605170001_add_chronicle_element_foundation.sql`
- `202605290001_chronicle_section_modules.sql`

### Chat Repository

- `202606220001_add_chat_repository.sql`
- `202606260001_add_chat_repository_search.sql`
- `202607270003_backfill_chat_log_deleted_flags.sql`

### Universe AI and Source Documents

- `202607130002_add_universe_opened_at.sql`
- `202607130003_add_universe_ai_expert.sql`
- `202607140001_add_universe_ai_proposals.sql`
- `202607170003_add_universe_source_documents.sql`
- `202608020001_add_universe_source_canon_reviews.sql`
- `202608020002_limit_universe_ai_dirty_triggers.sql`

### Image Generation

- `202607160001_add_image_generation.sql`
- `202607160002_add_image_generation_error_details.sql`
- `202607170002_add_image_generation_active_settings.sql`
- `202607170006_add_image_generation_asset_settings.sql`
- `202607170007_set_image_generation_asset_settings_trigger.sql`
- `202607240001_add_generation_jobs.sql`

### ToDo

- `202607170004_add_todo_module.sql`

### Episode Roulette

- `202607170005_add_episode_roulette.sql`

### Admin

- `202607170008_add_user_admin_flag.sql`
- `202607200001_add_admin_purge_rpc.sql`
- `202607200002_add_admin_purge_browser_rpcs.sql`
- `202607200003_add_admin_purge_user_counts.sql`
- `202607200004_fix_admin_purge_custom_template_counts.sql`
- `202607210001_tighten_custom_template_purge.sql`
- `202607210004_allow_admin_self_data_purge.sql`
- `202607260002_add_admin_user_activity_rpc.sql`
- `202607270002_active_admin_activity_counts.sql`
- `202607270004_update_admin_user_activity_modules.sql`
- `202607270005_fix_admin_user_activity_template_timestamp.sql`
- `202607270006_make_admin_activity_timestamps_dynamic.sql`
- `202608080001_update_admin_database_modules.sql`

### Theme Library

- `202607210002_remote_theme_history_placeholder.sql`
- `202607210003_add_theme_library.sql`

### Roleplayer

- `202607290001_add_roleplayer_character_system.sql`
- `202608050001_rename_roleplayer_tables.sql`

### God Engine

- `202607310001_add_god_engine.sql`
- `202607310002_add_god_engine_time_fields.sql`
- `202607310003_add_god_custom_evolution_trait.sql`
- `202607310004_add_god_custom_evolution_traits.sql`

### Arc Studio

- `202608010001_add_arc_studio.sql`
- `202608010002_add_arc_studio_v2.sql`
- `202608010003_add_arc_studio_tutorial_setting.sql`
- `202608120001_add_arc_source_documents.sql`
- `202608120002_add_arc_manuscript_jobs.sql`

### Fusion

- `202608040001_add_fusion_games.sql`
- `202608040002_relax_fusion_description_limits.sql`
- `202608040003_remove_fusion_recipes.sql`

### ListMaker

- `202608070001_add_listmaker.sql`

### Default Element Type Import/Export/Sync

- `202608140001_add_default_element_type_import_export.sql`
- `202608140002_reload_postgrest_schema_after_default_element_sync.sql`
- `202608140003_create_default_element_type_user_sync_rpc.sql`
- `202608140004_fix_default_element_type_sync_alias.sql`

## 26. Cross-Module Data Map

### Shared User Identity

Most modules use the app-level `users.id` integer, not the Supabase Auth UUID directly.

Important implication:

- UI code frequently calls `getCurrentAppUser()`.
- RLS policies often compare table `user_id` to the app user row connected to `auth.uid()`.

### Shared Images

Object images are used by:

- Universe Builder.
- Universe Canvas.
- Chronicle.
- Chat Repository cards.
- Homepage cards.

The shared image functions abstract storage operations away from page scripts.

### Shared Source Documents

Universe source documents are used by:

- Universe Builder creation.
- Universe Canvas Documents modal.
- Source-populate flow.
- Source canon review.
- Homepage source document cards.

Arc source documents are separate:

- `arc_source_documents`

### Shared Generation Jobs

`generation_jobs` centralizes long-running generation visibility.

Used by:

- Image generation.
- God Engine images.
- Arc manuscript jobs.
- Some other async generation flows.

### Shared Admin Tools

Admin purge/activity functions include counts across most module tables. When adding a new persistent module, admin purge/activity likely needs updating.

## 27. Common Implementation Patterns

### DOM Hook Style

Centralis uses `data-*` hooks heavily instead of framework component refs.

Examples:

- `data-home-feature`
- `data-source-documents-form`
- `data-open-current-universe-documents`
- `data-source-populate-from-document`
- `data-combine-run`

### Status Text

Most modules use `<p class="form-status" role="status">`.

Status functions usually:

- Set `textContent`.
- Toggle `is-error`.
- Toggle `is-success`.

### Modal Pattern

Most dialogs are:

- `.modal-backdrop`
- `.modal-dialog`
- `hidden` attribute.
- Close buttons with `data-*` hooks.
- Some are `data-strict-modal`, preventing backdrop-close.

### Soft Delete

Modern rows generally use:

- `deleted`
- `deleted_at`
- `deleted_by`

Some delete flows intentionally hard-delete child/template field data when soft-delete is insufficient for library correctness.

### Cache Busting

HTML pages use query strings:

- `script.js?v=...`
- `styles.css?v=...`
- module JS `?v=...`

When changing browser-loaded JS/CSS, bump the relevant cache key on the HTML entry point.

## 28. Deployment and Verification

### Local

Run:

```powershell
npm run dev
```

Default URL:

```text
http://127.0.0.1:4173/
```

### Syntax Checks

For changed JS:

```powershell
node --check .\script.js
node --check .\flow-canvas.js
node --check .\useful-things.js
```

### Diff Whitespace Check

```powershell
git diff --check -- <files>
```

### Supabase Deployment

Database:

```powershell
$env:SUPABASE_ACCESS_TOKEN='<token>'; npx supabase db push --linked --yes
```

Edge Function example:

```powershell
$env:SUPABASE_ACCESS_TOKEN='<token>'; npx supabase functions deploy <function-name> --project-ref lztmpbxmntcktijcdcda
```

## 29. Known Risk Areas

### Large Shared `script.js`

`script.js` owns many concerns. Changes there can affect:

- Homepage.
- Auth.
- Universe Builder.
- Settings.
- Source documents.
- Header/global UI.

When touching it, run syntax checks and manually smoke the relevant page.

### Universe Canvas Complexity

`flow-canvas.js` is extremely large and stateful. Changes can affect:

- Graph rendering.
- React Flow events.
- Source document generation.
- AI Expert.
- Import/export.
- Modal cleanup.
- Layer overlays.

### Source Document Flow Overlap

There are now multiple document-related flows:

- Upload/manage documents.
- Source-populate generation.
- Source canon comparison.
- First-open prompt for new universes.

Be careful that a document upload does not accidentally open both source-populate and source-canon flows.

### Default Element Type Sync

Default element type imports touch admin-only defaults and user libraries. RPC schema cache issues can show up after migrations until PostgREST reloads.

### Generated Asset Storage

Image generation and object image storage depend on signed URL functions. Broken storage policy/function changes tend to appear as missing thumbnails, not necessarily as hard JS errors.

## 30. Quick Module Lookup Table

| Module | Route | Main JS | Primary Tables | Key Edge Functions |
| --- | --- | --- | --- | --- |
| Homepage | `index.html` | `script.js` | many read-only summaries | n/a |
| Universe Builder | `universe-builder.html` | `script.js` | `universes`, element type tables | `generate-universe-metadata`, `extract-universe-source-document`, `upload-universe-source-document` |
| Universe Canvas | `universe-canvas.html` | `flow-canvas.js`, `script.js` | `elements`, `element_links`, `element_groups`, `canvas_notes`, layers | `generate-universe-elements`, `stream-universe-source-elements`, `sync-universe-ai-source` |
| Chronicle | `chronicle.html`, `chronicle-editor.html` | `chronicle.js` | `elements`, templates, `chronicle_modules` | `generate-chronicle-details`, `generate-universe-element` |
| Arc Studio | `arc-studio.html`, `arc-workspace.html` | `arc-studio.js` | `arc_*` tables | `analyze-arc-story`, `upload-arc-source-document`, `process-arc-manuscript-breakdown-job` |
| Stellar Architect | `stellar-architect.html` | `stellar-architect.js` | `stellar_*` tables | `generate-stellar-*` |
| Image Generation | `image-generation.html` | `image-generation.js` | `image_generation_*`, `generation_jobs` | `generate-session-images`, `download-image-generation-zip` |
| Movie Tracker | `movie-tracker.html` | `movie-tracker.js` | `movies`, `collections`, `franchise` | `lookup-movie-omdb`, `lookup-movie-poster-tmdb` |
| Calendar | `calendar.html` | `calendar.js` | `calendars`, `events` | n/a |
| ToDo | `todo.html` | `todo.js` | `todo_tasks`, `todo_subtasks` | n/a |
| Chat Repository | `chat-repository.html` | `chat-repository.js` | `chat_logs` | `upload-chat-log`, `generate-chat-log-metadata`, `reindex-chat-logs` |
| Roleplayer | `roleplayer.html` | `roleplayer.js` | `roleplayer_*` | model/local server helpers |
| God Engine | `god-engine.html` etc. | `god-engine.js`, `god-canvas.js`, `god-autopilot.js` | `god_*` tables | `generate-god-*` |
| Fusion | `fusion.html` | `fusion.js` | `fusion_*` tables | `generate-fusion-discovery` |
| Episode Roulette | `episode-roulette.html` | `episode-roulette.js` | `recent_shows` | `episode-roulette-tmdb` |
| Useful Things | `useful-things.html` | `useful-things.js` | mostly local/browser plus storage utilities | `convert-text-format` |
| ListMaker | `listmaker.html`, `listmaker-list.html` | `listmaker.js` | `listmaker_*` tables | n/a |
| Settings | `settings.html` | `settings.js`, `script.js` | settings/admin/default element tables | admin/default element RPCs |
| Designer | `designer.html` | `designer.js` | none obvious | n/a |

## 31. Practical Rules for Future Changes

1. If a new persistent module is added, check admin purge/activity coverage.
2. If a new browser-loaded JS/CSS file changes, bump the matching HTML cache key.
3. If a new user-owned table is added, add RLS immediately.
4. If a module creates long-running AI/image work, use `generation_jobs` unless there is a strong reason not to.
5. If a module creates images for app objects, prefer shared object image functions over custom storage code.
6. If a flow opens a modal from another module, use a scoped `CustomEvent` instead of reaching across files with brittle globals.
7. If a document upload is used for a specific downstream flow, pass context so it does not trigger unrelated post-upload behavior.
8. If modifying `flow-canvas.js`, verify graph render, modals, and source/AI events.
9. If modifying `script.js`, verify auth boot, homepage, and the specific page affected.
10. Keep data model changes in migrations, not ad hoc SQL hidden in UI code.

## 32. User-Facing Functionality Inventory

This section is intentionally product-surface oriented. It lists every visible or user-triggerable feature found in the app at a practical level of detail, including small controls, dialogs, menus, and side behaviors.

### 32.1 Global Shell and Navigation

User-facing functionality:

- Centralis brand link returns to `index.html`.
- Primary category navigation groups modules by:
  - World Building.
  - AI Tools where present in the newer header.
  - Entertainment.
  - Utilities.
  - Settings.
- World Building menu exposes:
  - Universe Builder.
  - Stellar Architect.
  - Chronicle.
  - Arc Studio in newer homepage/header contexts.
- Entertainment menu exposes:
  - Movie Tracker.
  - Chat Repository.
  - Episode Roulette placeholder/action where wired.
- Utilities menu exposes:
  - Calendar.
  - Useful Things.
  - ListMaker in newer quick access contexts.
- Header theme toggle changes between light/dark theme states.
- User profile menu exposes:
  - Profile placeholder.
  - Account placeholder.
  - Notifications placeholder.
  - Sign Out.
- Global generation activity button shows background jobs.
- Generation activity modal/list shows:
  - Active generation jobs.
  - Recent jobs.
  - Failed jobs.
  - Error details when available.
  - Cancel controls for cancellable jobs.
- Global auth modal supports:
  - Login by email/password.
  - Signup by email/password.
  - Google OAuth.
  - Status messages for errors and signup confirmation.
- Admin-only UI elements are hidden for non-admin users.
- Shared modals use Escape/backdrop behavior unless marked strict.
- Shared status messages use success/error coloring.
- Shared dropdowns close when focus/click leaves them.

### 32.2 Homepage

User-facing functionality:

- Signed-out landing/auth experience.
- Signed-in dashboard experience.
- Dark gallery dashboard layout.
- `Continue Where You Left Off` feature card:
  - Shows newest available work item.
  - Can show Arc Studio project.
  - Can show Universe.
  - Can show Chronicle element.
  - Can show source document.
  - Can show admin chat log for admins.
  - Uses cover/object image when available.
  - Uses module-specific accent and icon.
  - Links directly to the source module/object.
  - Shows empty welcome state if no recent work exists.
- Today card:
  - Summarizes today/upcoming schedule.
  - Counts open ToDo tasks.
  - Counts scheduled ToDo tasks.
  - Shows today's events/tasks if present.
  - Falls back to next upcoming items.
  - Links to ToDo.
- Mini month calendar:
  - Shows current month.
  - Highlights today.
  - Marks event/task days.
  - Links to Calendar.
  - No month navigation in homepage version.
- `Centralis at a Glance` metric strip:
  - Universe count/recent detail.
  - Chronicle element count/recent detail.
  - Calendar upcoming count/next date.
  - ToDo open/scheduled count.
  - Movie count/downloaded detail.
  - Image generation sessions/recent detail.
  - Admin chat log count for admins.
- Quick Access ribbon:
  - Universe Builder.
  - Arc Studio.
  - Chronicle.
  - Image Generation.
  - Calendar.
  - Movie Tracker.
  - Useful Things.
  - ListMaker.
  - Chat Repository for admins.
- Recent Work gallery:
  - Mixed cards from multiple modules.
  - Uses thumbnails where possible.
  - Uses module accents.
  - Links to underlying work.
- Homepage updated timestamp.
- Homepage data loading/error states.

### 32.3 Universe Builder

User-facing functionality:

- View all user universes.
- Toggle Universe Builder card/list presentation.
- Search/filter universes.
- Show universe count.
- Create new universe.
- Delete universe.
- Open a universe into Universe Canvas.
- Open source documents for a universe from card menus.
- Universe cards can show:
  - Name.
  - Description.
  - Updated/opened date.
  - Primary image.
  - Genre-ish icon heuristic.
  - Overflow action menu.
- New Universe dialog:
  - Name field.
  - Description field.
  - Optional AI generation.
  - AI genre selector.
  - Multi-universe generation mode.
  - Count input for multi-mode.
  - Source file upload flow.
  - Staged source document display.
  - Remove staged source document.
  - Busy/generation overlay.
  - Create/cancel controls.
- Source-file assisted new universe:
  - Upload source file.
  - Extract metadata from source.
  - Populate name/description from extracted source.
  - Disable normal AI toggle while source is staged.
  - Save source document after universe creation.
  - Queue source-populate prompt for first canvas open.
- AI generated single universe:
  - Generate draft.
  - Review generated name/description/genre.
  - Generate again.
  - Finalize into real universe.
- AI generated multiple universes:
  - Generate list of ideas.
  - Select all/none.
  - Select individual ideas.
  - Create selected universes.
- Delete confirmation dialog.
- Universe source document manager can be opened for existing universes.
- Element type library seed runs after sign-in so new users have default types.

### 32.4 Universe Canvas

User-facing functionality:

- Load a specific universe by URL.
- Show universe title in toolbar.
- Back link to Universe Builder.
- Visual graph canvas with pan/zoom/drag behavior.
- Universe root node.
- Element nodes.
- Group nodes.
- Note nodes.
- Link/edge rendering.
- Details pane.
- Details pane resize.
- Node selection.
- Multi-selection controls where available.
- Auto-layout button.
- Layers mode toggle.
- Create group button when relevant.
- Delete selected elements button when relevant.
- Format modal button.
- Canvas search button/popover:
  - Search input.
  - Search name text.
  - Optional description search.
  - Previous match.
  - Next match.
  - Search status/count.
- AI Expert button.
- Add Element button.
- Options menu:
  - Documents.
  - Generate from Document.
  - Import.
  - Export.
  - Edit Types.
- Import Elements:
  - Choose JSON file.
  - Transfer options.
  - Include connections.
  - Include positions.
  - Include rich details.
  - Include custom fields.
  - Import status.
- Export Elements:
  - Transfer options.
  - Export selected/current universe data to JSON.
- Universe Format modal:
  - Stroke color.
  - Stroke width.
  - Stroke style.
  - Path type.
  - Node background opacity.
  - Node border width.
  - Node image placement.
  - Node layout gap.
  - Save/cancel behavior.
- Add Element modal:
  - Name.
  - Type.
  - Description.
  - Position defaults.
  - Template/custom field handling.
- Edit element details:
  - Basic fields.
  - Element type.
  - Description.
  - Template field values.
  - Custom fields where present.
  - Image actions.
- Delete element.
- Create/edit links.
- Link label editing.
- Delete link.
- Group functionality:
  - Create group.
  - Assign elements to group.
  - Nested group support.
  - Group position.
  - Group background color.
  - Delete group.
- Canvas notes:
  - Create note.
  - Edit note text.
  - Note color/text color.
  - Move note.
  - Delete note.
- Overlay layers:
  - Toggle layers mode.
  - Manage layer list.
  - Create layer.
  - Edit layer.
  - Delete layer.
  - Add layer entries.
  - Assign elements to layer entries.
  - Layer overlay visuals on nodes.
- Image gallery:
  - View images.
  - Upload image.
  - Generate image where exposed.
  - Set primary.
  - Open image.
  - Download image.
  - Delete image.
  - Thumbnail rail.
  - Previous/next image.
- Source Documents modal:
  - Upload one or more source documents.
  - Optional display name.
  - Supported file type hint.
  - Uploaded document list.
  - Document count.
  - Existing document rows.
  - In source-populate mode, eligible rows show `Generate`.
  - Close/upload controls.
  - Wide two-column layout.
- First-open source generation prompt:
  - Shows when a new single universe first loads.
  - Asks whether to generate from a source file.
  - `Choose File` opens Documents modal in source-populate mode.
  - `Not Now` dismisses.
- Source-populate prompt for staged source:
  - Shows when universe was created with a staged source document.
  - Asks whether to populate canvas with extracted elements.
  - Yes starts source analysis.
  - No dismisses.
- Generate from Document at any time:
  - Options menu action.
  - Opens source-populate prompt.
  - Lets user upload a new source document.
  - Lets user select an already uploaded eligible document.
  - Streams generated element suggestions.
  - Shows progress and warnings.
  - Lets user select all/none generated elements.
  - Lets user select individual generated elements.
  - Creates selected source elements.
  - Auto-layouts after creation.
  - Syncs AI knowledge after creation.
- Generate Elements modal:
  - Total element count.
  - Relationship density.
  - Optional instructions.
  - Type checklist.
  - Type checklist collapse/expand.
  - Select all/none types.
  - Preview prompt/info.
  - Generate.
  - Cancel.
- Generated Elements review:
  - Review generated elements.
  - Review generated links.
  - Regenerate.
  - Finalize.
  - Cancel.
- AI Expert:
  - Open panel/popout.
  - Load chat.
  - Send messages.
  - Stream messages when supported.
  - Review AI proposals.
  - Finalize proposal-created elements.
  - Sync universe AI source data.
- Source canon review:
  - Compare uploaded document to canon.
  - Select documents.
  - Start compare.
  - Review conflicts.
  - Save decisions.
  - Generate suggested elements.
  - Review and finalize source canon elements.
- Toast/status messages for canvas operations.
- Fit canvas to rendered nodes after generation/layout.
- Open current universe documents from `?documents=1`.

### 32.5 Chronicle Index

User-facing functionality:

- Browse Chronicle content.
- Search Chronicle elements.
- Sort elements.
- Filter by universe.
- Route notice when opened from a specific universe/element context.
- Create new Chronicle element.
- Select element type.
- Enter name.
- Enter description.
- Open created/existing element in Chronicle editor.
- See loading/empty/error states.
- Browse element cards or grouped module views depending on current UI state.
- Use shared header navigation and sign out/theme controls.

### 32.6 Chronicle Editor

User-facing functionality:

- Edit a single Chronicle element.
- Back/navigation through shared header.
- Inline/editable text areas.
- Dedicated text editor modal:
  - Edit long text.
  - Apply.
  - Cancel.
- Generate Image modal:
  - Prompt field.
  - Generate image submit.
  - Cancel/close.
- Image viewer:
  - View current image.
  - Thumbnail navigation.
  - Previous/next.
  - Set as primary.
  - Open image.
  - Download image.
  - Delete image.
  - Close viewer.
- Generate Chronicle Details:
  - Prompt/instructions.
  - Template module checklist.
  - Select relevant modules.
  - Submit generation.
  - Cancel.
- Review Chronicle Suggestions:
  - Review generated module content.
  - Add to editor.
  - Cancel.
- Save/update element content.
- Manage template-backed details and generated details.

### 32.7 Arc Studio Project List

User-facing functionality:

- View Arc Studio project list.
- Search projects.
- Show project count.
- Open project workspace.
- Create new story project.
- New Story Project dialog:
  - Title.
  - Universe link/select.
  - Format.
  - Format help text.
  - Manuscript/source upload.
  - Staged manuscript display/removal.
  - Logline.
  - Premise.
  - Genre.
  - Status.
  - Target length.
  - Notes.
  - Cover/image URL where available.
  - Create Project.
  - Cancel/close.
- Project cards can show:
  - Title.
  - Status/format/genre metadata.
  - Cover image when available.
  - Updated date.

### 32.8 Arc Studio Workspace

User-facing functionality:

- Back to Arc Studio.
- Project hero/header.
- Project status label in the toolbar/header area.
- Project cover image.
- Add story unit.
- Add plot thread.
- Add setup/payoff.
- Analyze story.
- Outline sidebar:
  - Group/scene counts.
  - Status filter.
  - Search outline.
  - Select story unit.
  - Reorder units up/down.
  - Edit unit.
  - Duplicate/copy unit where control exists.
  - Delete unit.
  - Add unit.
- Main workspace tabs:
  - Outline.
  - Corkboard.
  - Timeline.
  - Arc Map.
  - Diagnostics.
- Inspector tabs:
  - Overview.
  - Cast.
  - Story.
  - Arcs.
  - Causality.
  - Continuity.
  - Chronicle.
  - Notes.
- Tutorial overlay:
  - Previous page.
  - Next page.
  - Dots.
  - Close.
  - Dismiss/don't show again checkbox.
- Story Unit modal:
  - Add/edit unit.
  - Title.
  - Type/status/parent fields.
  - Summary/body/context fields.
  - Save.
  - Cancel.
- Plot Thread modal:
  - Name.
  - Color/type/status.
  - Notes/description.
  - Save.
  - Cancel.
- Setup/Payoff modal:
  - Setup text.
  - Setup unit.
  - Payoff unit.
  - Status.
  - Strength/notes fields.
  - Save.
  - Cancel.
- Diagnostics:
  - Analyze story via Edge Function.
  - Display diagnostic report.
  - Surface continuity/causality/story issues.
- Arc Map:
  - Visualizes links/threads/arcs.
- Timeline:
  - Shows ordered units over story progression.
- Corkboard:
  - Card-style scene/unit view.
- Chronicle integration:
  - Link story units to universe elements.
  - Show element states/coverage.
- Status/loading labels:
  - Workspace loading.
  - Processing change.
  - Error states.

### 32.9 Stellar Architect

User-facing functionality:

- Create/manage stellar systems.
- Generate a stellar system.
- View system-level summary.
- Generate/details for stars.
- Generate/details for planets.
- Generate moons.
- Generate lifeforms.
- Generate colonies.
- Generate colonists.
- Browse systems, stars, planets, moons, lifeforms, colonies, colonists.
- Edit generated details where UI exposes forms.
- Save generated records.
- View generation/loading status.
- Navigate between system subviews/anchors.
- Use generated science/fantasy worldbuilding text as source material.

### 32.10 Image Generation

User-facing functionality:

- Create image generation sessions.
- View session list.
- Open prior sessions.
- Delete sessions.
- Add prompt/message.
- Generate one or more images.
- Use provider/model/style settings.
- Use active saved settings.
- Upload reference images.
- View generated assets.
- Download image generation ZIP.
- Delete image generation turns/assets.
- Cancel in-progress image generation.
- Show generation error details.
- Use style thumbnails from Venice style assets.
- View image in shared image viewer where wired.
- Get signed asset URLs.
- Continue an existing session.

### 32.11 Movie Tracker

User-facing functionality:

- View movie library.
- Add movie.
- Edit movie.
- Delete movie.
- Search/filter movies.
- Sort movie titles.
- Normalize titles with leading articles.
- Track watched/downloaded state.
- Manage collections.
- Manage franchises.
- Look up metadata from OMDB.
- Look up posters from TMDB.
- Display poster art.
- View movie details.
- Track counts used by homepage.

### 32.12 Calendar

User-facing functionality:

- Mini month sidebar.
- Collapse/expand mini calendar.
- Mini previous month.
- Mini next month.
- Main calendar Today button.
- Main previous period.
- Main next period.
- Month title.
- View switcher:
  - Month.
  - Week.
  - Day.
  - Agenda.
- New Event button.
- Empty-state prompt to create a calendar.
- Create Calendar modal:
  - Name.
  - Color.
  - Create Calendar.
  - Cancel/close.
- Calendar list:
  - View calendars.
  - Toggle/select calendar visibility where implemented.
  - Edit/delete calendar through list controls where implemented.
- New/Edit Event modal:
  - Title.
  - All-day toggle.
  - Calendar select.
  - Category select.
  - Start date/time.
  - End date/time.
  - Description/location fields where present.
  - Reminder presets.
  - Delete event for existing event.
  - Save event.
  - Cancel/close.
- Reminder presets:
  - 10 min.
  - 30 min.
  - 1 hour.
  - 1 day.
- Month grid:
  - Click date to select/open event flow.
  - Click event chips.
- Week view:
  - Day headers clickable.
  - Events visible per day.
- Day view:
  - Events/tasks for selected day.
- Agenda view:
  - Grouped upcoming entries.
  - Date groups clickable.
- Calendar data feeds homepage Today and mini month.

### 32.13 ToDo

User-facing functionality:

- Create tasks.
- Edit tasks.
- Delete tasks.
- Mark tasks complete.
- Reopen tasks.
- Assign due dates.
- Assign status.
- Assign priority/category where exposed.
- Create subtasks.
- Complete subtasks.
- Delete subtasks.
- Filter task list.
- View open/scheduled counts.
- Homepage integration for open and scheduled tasks.
- Calendar/homepage date markers for dated tasks.

### 32.14 Chat Repository

User-facing functionality:

- View saved chat logs.
- Search chat logs.
- Switch view mode:
  - Card view.
  - Wide card view.
  - List view.
- Upload new chat log file.
- Paste raw chat HTML.
- Upload raw HTML file for parsing.
- Parse raw chat HTML.
- Review parsed raw chat.
- Edit parsed title.
- Edit parsed summary.
- Save parsed import.
- Optionally generate image from raw import.
- Open chat reader.
- Read chat content in reader frame.
- Edit chat log from reader.
- Close reader.
- Editor modal:
  - Edit title.
  - Edit summary.
  - Edit source HTML/text.
  - Preview rendered content.
  - Save.
  - Close.
- Generate chat image:
  - Review image prompt.
  - Edit prompt.
  - Submit generation.
  - Cancel.
- Upload chat image.
- View chat image.
- Delete chat image.
- Card/list actions:
  - Open.
  - Edit.
  - Delete where exposed.
- Reindex/search support through Edge Function.
- Metadata generation for chat logs.
- Admin-only homepage exposure.

### 32.15 Roleplayer

User-facing functionality:

- Manage roleplay characters.
- Character import/export/validation through schema.
- Manage personas.
- Start roleplay sessions.
- Continue prior sessions.
- Send messages.
- View conversation history.
- Store memories.
- Use character/persona metadata to shape chat.
- Rename/edit characters and sessions where exposed.
- Delete/archive local roleplay records where exposed.
- Local model/server integration through app runtime.

### 32.16 God Engine

User-facing functionality:

- Create evolution scenario.
- Generate starter scenario.
- View species list.
- Generate species names.
- Generate species images.
- Generate evolutionary events.
- Track time fields.
- Add custom evolution trait.
- Add multiple custom traits.
- View evolution canvas.
- Use autopilot page for automated evolution progression.
- View event history.
- Save generated species/events.
- Display generation job status.
- View generated images where available.

### 32.17 Fusion

User-facing functionality:

- Create Fusion game.
- View level 0 starting items.
- Combine/discover items.
- Generate discovery result.
- Save discoveries.
- View discovered item history.
- Use relaxed description limits for long generated item descriptions.
- Continue existing game state.
- View generation/status errors.

### 32.18 Episode Roulette

User-facing functionality:

- Add recent shows.
- Search or look up show data through TMDB.
- Store recent show selections.
- Randomly choose episode/show result.
- View recent show list.
- Remove shows where exposed.
- Use Entertainment navigation entry.

### 32.19 Useful Things

User-facing functionality:

- Left-side tab navigation.
- Text Converter tab:
  - Raw input mode.
  - Rich editor mode.
  - Output area.
  - Convert text formats.
  - Copy output.
  - Save input.
  - Save output.
  - Output copy menu.
  - Prompt/config dialogs where exposed.
- Calculators tab:
  - Calculator tools.
  - Dynamic result fitting.
  - Numeric input controls.
- Generators tab:
  - Generator tools.
  - Prompt/options controls.
- Combine and Split tab:
  - Combine section.
  - Combine Multiple Files subsection.
  - Select `.txt` files.
  - Append selected files to list.
  - Clear selected files.
  - Show selected file list.
  - Scroll file list after more than six visible rows.
  - Master File Name input.
  - Separator dropdown:
    - Double Line Break.
    - Single Line Break.
    - Dashed Line.
    - Asterisk Line.
  - Change Order / Remove popup.
  - Move file up.
  - Move file down.
  - Remove file.
  - OK applies order/removal.
  - Cancel discards draft order changes.
  - Combine button.
  - Requires at least two text files.
  - Requires nonblank master filename.
  - Auto-adds `.txt`.
  - Downloads combined master file.
  - Shows success/error status.
  - Empty Split section placeholder.
- Storage tab:
  - Storage browsing/migration utilities where exposed.
  - Storage status/results display.

### 32.20 ListMaker

User-facing functionality:

- View saved lists.
- Create list.
- Open list detail.
- Edit list metadata.
- Delete list.
- Manage categories.
- Manage statuses.
- Manage custom fields.
- Create items.
- Edit items.
- Delete items.
- Assign category.
- Assign status.
- Fill custom field values.
- Browse/filter list items.
- Save field values.
- Return from list detail to list index.

### 32.21 Settings

User-facing functionality:

- Settings page navigation/tabs.
- Theme preferences.
- Theme library selection.
- Custom theme creation.
- Custom theme color controls.
- Save custom theme.
- Theme menu/order management.
- AI provider/model settings.
- User AI settings save/load.
- Database/admin useful sections.
- Admin purge user list.
- Admin purge counts.
- Purge current user data.
- Admin activity summaries.
- Elements tab:
  - Export default element type example.
  - Artifact is used as fixed example.
  - Export schema file.
  - Import default element type data.
  - Sync defaults to user libraries.
  - Prompt after import asking whether to sync.
  - Status output for import/export/sync.
- Storage/admin helpers where exposed.
- Sign-out still available through global header.

### 32.22 Designer

User-facing functionality:

- Standalone design/prototyping page.
- Uses `designer.js`.
- Likely exposes visual controls for app/design experimentation.
- Treat as user-facing but lower confidence until the page is manually smoke-tested.

### 32.23 Shared Image Viewer

User-facing functionality:

- Opens image gallery for object/session images.
- Shows title/kicker.
- Shows main image stage.
- Shows thumbnail rail.
- Previous image.
- Next image.
- Select thumbnail.
- Actual size mode.
- Fit-to-view mode.
- Upload image.
- Prompt/details drawer.
- Open image in browser/new tab.
- Download image.
- Delete image.
- Set primary image.
- Toggle details drawer.
- Loading/status text.

### 32.24 Admin and Maintenance

User-facing functionality:

- Admin-only chat content on homepage.
- Admin-only purge controls in Settings.
- Admin-only user activity summaries.
- Admin purge count preview.
- Admin purge execution.
- Admin self-purge support.
- Admin default element type import/export.
- Admin default element type sync.
- Schema/cache related sync status messages.

### 32.25 Error, Empty, and Loading States

User-facing functionality across modules:

- Empty lists show explanatory empty states.
- Loading states appear in cards/lists/modals while data loads.
- Error messages display readable errors from Supabase/Edge Functions.
- Buttons disable during long submits/uploads/generation.
- Upload dialogs prevent closing while upload is active in strict contexts.
- Some failed generation jobs expose raw details in expandable sections.
- Source-populate warns when streamed elements do not map to available element types.
- Source-populate cancels active analysis when review cancel is clicked during streaming.

### 32.26 Import, Export, Upload, Download Surfaces

User-facing import/upload:

- Universe source documents.
- Arc manuscripts/source documents.
- Element transfer JSON.
- Chat logs.
- Raw chat HTML files.
- Chat images.
- Chronicle/object images.
- Image generation references.
- Useful Things text files for combine.
- ListMaker data where exposed.

User-facing export/download:

- Element transfer JSON.
- Image downloads.
- Image generation ZIP.
- Combined text file from Useful Things.
- Chat/image assets where exposed.
- Default element type example/schema.

### 32.27 Search and Filter Surfaces

Search/filter controls exist in:

- Homepage implicit recent sorting.
- Universe Builder search.
- Universe Canvas search.
- Arc Studio project search.
- Arc Workspace outline search and status filter.
- Chronicle search/sort/universe filter.
- Chat Repository search and view mode.
- Calendar period/view filters.
- Movie Tracker search/filter.
- ListMaker list/item filtering where exposed.
- Useful Things tool tabs.

### 32.28 Generation Surfaces

AI/generation controls exist in:

- Universe name/description generation.
- Universe multi-idea generation.
- Universe Canvas generated elements.
- Universe Canvas source-populate generated elements.
- Universe Canvas AI Expert.
- Source canon generated suggestions.
- Chronicle detail generation.
- Chronicle image generation.
- Arc story analysis.
- Arc manuscript breakdown.
- Stellar system/detail/moon/lifeform/colony/colonist generation.
- Image Generation sessions.
- Chat Repository metadata/image prompt generation.
- God Engine starter/evolution/name/image generation.
- Fusion discovery generation.

### 32.29 Things That Are Visible but May Be Placeholders

Some global menu items are visible in shared headers but may not currently open full implemented pages from every context:

- Profile.
- Account.
- Notifications.
- Preferences.
- Privacy.
- Shortcuts.
- Episode Roulette button in older dropdowns may be a button rather than a direct link depending on page header version.

When documenting or testing a release, distinguish between:

- Fully routed feature.
- Visible placeholder.
- Legacy menu control.
- Admin-only control.

## 33. Page-by-Page User-Facing Surface Audit

This appendix is deliberately route-oriented. Section 32 groups behavior by product module; this section groups it by the actual pages a user can open so QA, support notes, and future design passes can ask, "What can the user do on this screen?"

### 33.1 `index.html` - Centralis Homepage

User-facing surfaces:

- Signed-out landing/entry experience.
- Signed-in dashboard experience.
- Shared top navigation.
- Profile/account icon cluster.
- Dark gallery homepage layout.
- Continue/Latest Work feature card.
- Feature card thumbnail or placeholder.
- Feature card module label.
- Feature card metadata line.
- Feature card CTA link.
- Feature card empty-state welcome copy.
- Today summary card.
- Today empty state.
- Mini month calendar.
- Current month date grid.
- Today highlight.
- Event/task day markers.
- Open Calendar link.
- Centralis at a Glance metrics.
- Universe count metric.
- Chronicle count metric.
- Chat log count metric for admin users.
- Calendar/task count metric.
- Movie count metric.
- Image generation count metric.
- Quick Access ribbon.
- Universe Builder quick access.
- Arc Studio quick access.
- Chronicle quick access.
- Image Generation quick access.
- Calendar quick access.
- Movie Tracker quick access.
- Useful Things quick access.
- ListMaker quick access.
- Chat Repository quick access for admins.
- Recent Work mixed gallery.
- Recent source document cards.
- Recent universe cards.
- Recent Chronicle element cards.
- Recent Arc project cards.
- Recent chat log cards for admins.
- Section collapse/expand affordances where available.
- Updated time/status labels.
- Loading cards while homepage data resolves.
- Error/empty fallbacks for unavailable data.

### 33.2 `universe-builder.html` - Universe Builder Library

User-facing surfaces:

- Universe list/library page.
- Search/filter existing universes.
- Universe cards with title, description, metadata, and thumbnails.
- Create new universe dialog.
- Universe name input.
- Universe description input.
- Optional initial source file selection.
- Source file supported-format messaging.
- Generate name/description assistance.
- Generate multiple universe ideas.
- Select generated idea.
- Create universe action.
- Open universe in canvas.
- Delete/archive universe action where exposed.
- Universe image display where available.
- Recent/opened ordering.
- Empty library state.
- Loading and error states.
- Access to source document workflows through created universes.

### 33.3 `universe-canvas.html` - Universe Canvas

User-facing surfaces:

- Canvas graph/workspace.
- Universe title display.
- Universe description display.
- Back to library.
- Search universe elements.
- Add element action.
- Add new element type through editor.
- Edit element type.
- Delete element type.
- Open template editor for element type.
- Element type list in popup.
- Element type icon display.
- Element type color display.
- Element type field management.
- Hard delete behavior for user element types.
- Canvas node rendering.
- Node selection.
- Node focus/highlight.
- Node details panel.
- Element name editing.
- Element description editing.
- Element type assignment.
- Element metadata display.
- Relationship/link creation where exposed.
- Relationship display on canvas.
- Relationship editing where exposed.
- Source Documents popup.
- Wider source document popup layout.
- Upload source documents.
- Display name for uploaded source document.
- Multi-file document picker.
- Supported file type help text.
- Uploaded document list.
- Upload progress/status.
- Generate from uploaded document action.
- Actions menu entry to generate from uploaded document at any time.
- First-load prompt asking whether to generate from a file for every newly created universe.
- Dismiss/cancel first-load prompt.
- Source-populate review workflow.
- Streaming analysis status.
- Generated element review queue.
- Accept generated element.
- Reject generated element.
- Cancel source analysis.
- Warning when generated element type cannot be mapped.
- AI Expert panel.
- Ask question about the universe.
- AI-generated answer display.
- Create or update elements from AI where exposed.
- Images button/panel for elements.
- Upload element image.
- Generate element image.
- View element image gallery.
- Set primary image.
- Delete image.
- Image prompt/details drawer.
- Transfer/export element JSON.
- Import element JSON.
- Canvas zoom/pan controls.
- Empty canvas state.
- Loading universe state.
- Error state when universe cannot be loaded.

### 33.4 `chronicle.html` - Chronicle Index

User-facing surfaces:

- Chronicle element index.
- Universe filter.
- Type filter where exposed.
- Search elements.
- Sort elements.
- Element cards/list rows.
- Element thumbnail/primary image.
- Element type badges.
- Create new element.
- Open element editor.
- Edit existing element.
- Delete/archive element where exposed.
- Empty state.
- Loading state.
- Error state.

### 33.5 `chronicle-editor.html` - Chronicle Editor

User-facing surfaces:

- Element editing form.
- Element name input.
- Element type selector.
- Element universe selector.
- Element description/summary fields.
- Template-driven field sections.
- Template-driven field inputs.
- Save changes.
- Cancel/back navigation.
- Rich/detail-style section rendering for current templates.
- AI detail generation.
- Image upload.
- Image generation.
- Image gallery.
- Primary image selection.
- Image deletion.
- Image viewer modal.
- Unsaved/error messaging where present.

### 33.6 `arc-studio.html` - Arc Studio Project List

User-facing surfaces:

- Arc project library.
- Create project.
- Project title input.
- Project metadata/tag display.
- Project cards.
- Cover image display.
- Search projects.
- Open project workspace.
- Delete project where exposed.
- Empty project state.
- Loading/error states.

### 33.7 `arc-workspace.html` - Arc Studio Workspace

User-facing surfaces:

- Project header with title, image, tags, and no tagline beneath the project name.
- Back to projects.
- Workspace status label in the tab header area.
- Status verbiage: `Processing Change...`.
- Right-aligned processing/status placement.
- Tab bar.
- Outline tab.
- Corkboard tab.
- Timeline tab.
- Arc Map tab.
- Diagnostics tab.
- Outline sidebar.
- Scene count/group count summary.
- Status filter.
- Outline search.
- Add scene/group action.
- Scene cards in sidebar.
- Scene reorder up/down.
- Scene edit/open.
- Scene duplicate.
- Scene delete.
- Scene camera/image button for mobile/tablet capture workflows where implemented.
- Main outline story cards.
- Scene status badges.
- Scene title.
- Scene content/summary.
- Scene context messaging.
- Corkboard card view.
- Timeline view.
- Arc map visualization.
- Diagnostics output.
- Manuscript/source upload where exposed.
- Analyze manuscript/story action.
- Generated outline/scene processing state.
- Responsive tablet/mobile behavior.

### 33.8 `stellar-architect.html` - Stellar Architect

User-facing surfaces:

- Stellar system workspace.
- System creation/generation controls.
- Star/system detail panels.
- Planet listing.
- Planet detail editing.
- Moon generation.
- Lifeform generation.
- Colony generation.
- Colonist generation.
- Generated text/status output.
- Save/update actions where exposed.
- Empty state before generation.
- Loading/generation state.
- Error state.

### 33.9 `image-generation.html` - Image Generation

User-facing surfaces:

- Image generation session workspace.
- Prompt input.
- Prompt helper fields/options.
- Reference image upload.
- Generate image action.
- Generation progress/status.
- Generated image grid.
- Image preview.
- Image detail modal.
- Download image.
- Download generated image set as ZIP.
- Delete image/session item where exposed.
- Session/history listing.
- Empty state.
- Error state.

### 33.10 `movie-tracker.html` - Movie Tracker

User-facing surfaces:

- Movie library/list.
- Add movie.
- Edit movie.
- Delete movie.
- Search movies.
- Filter/sort movies.
- Status tracking.
- Watch/release/date metadata.
- Movie details fields.
- Save/cancel actions.
- Empty state.
- Loading/error state.

### 33.11 `calendar.html` - Calendar

User-facing surfaces:

- Calendar page.
- Month/week/day/list style views where exposed.
- Today navigation.
- Date navigation.
- Event list.
- Upcoming events.
- Add event.
- Edit event.
- Delete event.
- Event title input.
- Event date input.
- Event time/all-day controls.
- Event category/calendar selection.
- Birthday and main calendar display.
- Task-derived calendar items.
- Empty day/month state.
- Loading/error state.

### 33.12 `todo.html` - ToDo

User-facing surfaces:

- ToDo/task board.
- Create task.
- Edit task.
- Delete task.
- Task title.
- Task description/details.
- Task status.
- Task due date.
- Task scheduling.
- Open vs scheduled counts.
- Filter/sort where exposed.
- Empty state.
- Loading/error state.

### 33.13 `chat-repository.html` - Chat Repository

User-facing surfaces:

- Admin-oriented chat repository.
- Chat log list.
- Search chat logs.
- Filter/view mode controls.
- Upload chat log.
- Upload raw chat HTML.
- Parse/import chat content.
- Chat metadata display.
- Chat transcript viewer.
- Image attachments/gallery.
- Chat image upload where exposed.
- Generate metadata.
- Generate image prompts.
- Bulk or per-log actions where exposed.
- Empty state.
- Loading/error states.
- Admin-only access behavior.

### 33.14 `roleplayer.html` - Roleplayer

User-facing surfaces:

- Roleplay workspace.
- Character/persona selection or setup where exposed.
- Prompt/message input.
- Conversation output.
- Start/reset session controls where exposed.
- Save/export controls where exposed.
- Empty state.
- Loading/error states.

### 33.15 `god-engine.html` - God Engine

User-facing surfaces:

- God Engine dashboard.
- Create/start generated world or simulation.
- Starter generation.
- Evolution generation.
- Name generation.
- Image generation.
- Open God Canvas.
- Open Autopilot where exposed.
- Project/list cards where exposed.
- Empty state.
- Loading/error states.

### 33.16 `god-canvas.html` - God Canvas

User-facing surfaces:

- Canvas-based God Engine workspace.
- Generated object/node display.
- Select object/node.
- Inspect generated details.
- Trigger generation/evolution actions.
- Image display where available.
- Save/update controls where exposed.
- Empty state.
- Loading/error states.

### 33.17 `god-autopilot.html` - God Engine Autopilot

User-facing surfaces:

- Autopilot control page.
- Start autopilot.
- Stop/pause autopilot where exposed.
- Autopilot status.
- Generated progress log.
- Generated outputs/results.
- Error/status messaging.

### 33.18 `fusion.html` - Fusion

User-facing surfaces:

- Fusion workspace.
- Discovery generation.
- Input/source controls where exposed.
- Generated result list.
- Result detail display.
- Save/apply controls where exposed.
- Empty state.
- Loading/generation state.
- Error state.

### 33.19 `episode-roulette.html` - Episode Roulette

User-facing surfaces:

- Episode Roulette page.
- Randomize/spin action.
- Episode/result display.
- Supporting metadata display where exposed.
- Reset/retry control where exposed.
- Empty state.
- Error state.

### 33.20 `useful-things.html` - Useful Things

User-facing surfaces:

- Useful Things tool shell.
- Left-side tool tabs.
- Text Converter tab.
- Calculators tab.
- Generators tab.
- Combine and Split tab.
- Storage tab.
- Combine section.
- Combine Multiple Files subsection.
- Hidden `.txt` file input.
- Select Files button.
- Clear button.
- Selected file list.
- Scrollable list after six visible files.
- No-files-selected state.
- Master File Name input.
- Separator dropdown.
- Double Line Break separator.
- Single Line Break separator.
- Dashed Line separator.
- Asterisk Line separator.
- Change Order / Remove button.
- Order/edit popup.
- Move file up.
- Move file down.
- Remove file from pending combined list.
- OK applies order/removal changes.
- Cancel discards order/removal changes.
- Combine button.
- Requires at least two selected files.
- Blank master name error.
- Appends `.txt` to master filename when missing.
- Downloads combined master text file.
- Combine success/status message.
- Split section placeholder.

### 33.21 `listmaker.html` - ListMaker

User-facing surfaces:

- ListMaker list hub.
- Create list.
- List cards/rows.
- Open list.
- Rename/edit list where exposed.
- Delete list where exposed.
- List metadata/count display.
- Empty state.
- Loading/error state.

### 33.22 `listmaker-list.html` - ListMaker List Detail

User-facing surfaces:

- Individual list detail page.
- Add item.
- Edit item.
- Delete item.
- Mark item complete/active where exposed.
- Reorder items where exposed.
- Search/filter list items where exposed.
- Save/update status.
- Empty list state.
- Loading/error state.

### 33.23 `settings.html` - Settings

User-facing surfaces:

- Settings page shell.
- Settings tabs.
- Database tab.
- Elements tab.
- Export default element type example/schema button.
- Artifact is used as default export example.
- Import default element type data button.
- Import status/error display.
- Sync defaults to user libraries button.
- Sync confirmation popup after importing a new default element type.
- Manual sync status/error display.
- Admin purge controls where exposed.
- User/account/database maintenance controls where exposed.
- Loading/error states.

### 33.24 `designer.html` - Designer

User-facing surfaces:

- Designer workspace.
- Design/canvas controls where exposed.
- Style/theme controls where exposed.
- Preview area where exposed.
- Save/export controls where exposed.
- Empty state.
- Loading/error state.

### 33.25 Shared Popups and Modals Across Pages

User-facing popup/modal surfaces:

- Confirm delete dialogs.
- Upload dialogs.
- Source document dialog.
- Element type editor dialog.
- Template editor dialog.
- Image viewer dialog.
- Order/remove dialog in Useful Things.
- Import dialogs.
- Export/download status messaging.
- AI generation review dialogs.
- Settings confirmation dialogs.
- Error/status banners.
- Loading overlays and disabled submit states.

### 33.26 Shared Mobile and Device-Aware Surfaces

User-facing mobile/tablet surfaces:

- Responsive top navigation wrapping/collapsing behavior.
- Mobile-friendly dialog sizing.
- Tablet/phone camera upload support through file inputs where camera capture is enabled.
- Touch-friendly buttons for reorder/delete/edit controls.
- Scrollable popups to avoid clipped content.
- Narrow layout stacking for dashboard cards and Useful Things options.
- Canvas interaction expectations on touch devices.

### 33.27 Shared Security and Visibility Surfaces

User-facing visibility behavior:

- Signed-out pages redirect or show entry state as appropriate.
- Signed-in pages require authentication.
- Admin-only homepage chat repository content.
- Admin-only chat repository access.
- Admin-only maintenance actions in Settings.
- User-owned universe/library data separation.
- Custom user changes are preserved during default sync flows.
- Deleted/default element type behavior differs by default vs user-managed data.

### 33.28 Shared Data Movement Surfaces

User-facing data movement:

- Upload files.
- Upload images.
- Import JSON.
- Export JSON.
- Download generated images.
- Download ZIP bundles.
- Download combined text files.
- Sync default element types to existing user libraries.
- Generate structured records from uploaded source files.
- Generate records from AI prompts.

### 33.29 Shared Status Copy Worth Preserving

User-facing status phrases that have been intentionally changed or are semantically important:

- `Processing Change...` in Arc Studio workspace status.
- `Select at least two text files to combine.` in Useful Things combine validation.
- Default sync messages in Settings Elements tab.
- Source document upload/generation status messages in Universe Canvas.
- Empty states such as no files selected, no source documents, no scene context, and no recent work.

### 33.30 What This Audit Does Not Guarantee

This audit is based on the static routes, module scripts, and current UI structure in the repository. It is not a replacement for a browser pass. Before shipping a release, still smoke-test:

- Whether each listed action is reachable in the current build.
- Whether the action works for a regular user and, separately, for an admin.
- Whether hidden/admin-only items stay hidden for non-admins.
- Whether mobile dialogs fit on common phone widths.
- Whether file inputs preserve their accept filters.
- Whether generated/downloaded files have the expected names and formats.
