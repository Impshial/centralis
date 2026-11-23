# Lexicon and Chronicle

`lexicon.html` lists saved wikis and creates universe-backed or standalone wikis.
`lexicon-wiki.html?wiki=<id>&article=<id>` reads an article; `&edit=1` enables
author controls. `&view=index` opens All articles.
`lexicon-search.html?wiki=<id>&q=<query>` opens bookmarkable search results; older
`&view=search` links normalize to that route. Routes use saved IDs, independent of names.

## Chronicle and Builder

`chronicle-editor.html#universe/<id>` opens the actual universe, including a root
with zero children, templates or wikis. Its shell includes the existing gallery,
name, description, Details, Add field, Back to Builder and Save Universe. Element
routes retain type/template/module controls and expose their existing Builder Body.

Builder double-clicks open Chronicle previews when a root or element has an active
custom detail or assigned module. Otherwise the details pane has an enabled Open
in Chronicle action. Group and note interactions remain unchanged.

Custom fields receive IDs when added to the draft. Their dialog edits name,
multiline value and assigned-section placement; records without sections omit the
location selector. Move, rename, order, remove and cancel preserve other drafts.
Save upserts the same IDs on retries. Removing an assignment or changing templates
moves its custom fields to top-level Details without modifying shared templates.

View in Lexicon checks the saved source and wiki visibility. One visible match
opens directly; several matches offer a wiki chooser. Missing/hidden records do
not create wikis or source rows. Root routes open the corresponding wiki home.

Meaningful draft differences show Unsaved changes. Name, description, body,
type/template, module assignments, predefined/custom fields and applied AI
suggestions are compared with the last successful save. Reverting clears dirty
status; viewing/collapsing modules does not change it. Navigation links and
same-document Back/Forward offer Keep editing or Discard and leave. Refresh,
tab close and external history use the browser's beforeunload warning (subject
to browser interaction requirements). Failed saves retain drafts and dirty
status. Gallery operations already save immediately and do not mark a draft.

## Storage and authorization

The original `20261123001138_add_lexicon_wikis.sql` migration adds wikis, standalone
articles/navigation/sections/fields, property overrides and wiki-only connections.
Its existing production-history version is `20261123003328`.

The new **`20261123041951_complete_lexicon_chronicle.sql`** migration is applied to
Centralis project `lztmpbxmntcktijcdcda`, matching its repository filename.

| Change | Purpose |
| --- | --- |
| `element_custom_fields.chronicle_module_id` | Nullable FK to the same record's assigned module; validation and relocation triggers preserve custom fields |
| `lexicon_sections.body` and article `body` overrides | Standalone section prose and wiki-local Builder Body edits |
| `lexicon_annotations` | Field-scoped links, unlink/automatic-link suppressions and illustrations |
| `lexicon_facts` | Wiki-only facts, anchored excerpts and pinned explicit relationships |
| `lexicon_aliases` | Explicit article aliases |
| `lexicon_media` | Wiki uploads or read-only references to accessible existing images |

All new Lexicon tables use owner RLS through the app user's `users.clerk_user_id`
mapping and owned wiki. Invoker validation checks source membership and stable
subject IDs; composite FKs prevent cross-wiki image placements. Direct client
writes to media storage keys are revoked. `lexicon-media` version 1 is active with
JWT verification. It validates wiki/asset ownership before signing, uploading or
registering images, reuses IDs for retries and rejects cross-wiki ID collisions.

Overrides remain sparse rows keyed by wiki, subject type, article ID, subject ID
and property. Explicit blanks differ from inheritance. Reset removes only the
selected property's row. Renames and same-named replacements cannot transfer an
override. Lexicon writes only Lexicon tables; intentional source-editor saves
write source data. Movie Tracker schema and access rules are unchanged.

Live metadata confirms new RLS policies and the intended placement column and
triggers. Movie, universe, element and universe-custom-field column signatures,
RLS flags and policy/trigger counts match their pre-migration values. Advisors
reported no security findings for the new objects or missing FK indexes. New
indexes are reported as unused until production usage.

## Reader and authoring

`lexicon-data.js` loads current owned source records. Chronicle assignment joins
use `chronicle_modules.data.section_id`; values join by element and template field
ID. Section custom fields default to the body, top-level fields to the infobox.
Empty content is omitted while zero/false remain visible. Roots receive no inferred
type or facts extracted from children.

`lexicon-core.js` resolves presentation overrides, relationships, aliases, search
and breadcrumbs. Breadcrumbs prefer group ancestry or authored standalone
navigation. Otherwise directed Contains/Includes/Parent of relationships can
provide containment. Stable IDs resolve multiple parents with cycle guards.
Ordinary graph edges do not imply ancestry.

The reader has one title, breadcrumbs, local search, current-page contents and
All articles. Contents use actual visible headings with distinct anchors for
duplicate names. Search ranks titles/aliases before descriptions, headings and
body/field text, groups by article, and excludes hidden/out-of-wiki content. Enter
opens full results; arrows activate suggestions and Escape dismisses them. Search
has Wiki home > Search results breadcrumbs and search-appropriate actions.
Back restores the previous article and scroll position; Forward restores results
and query. Selecting a suggestion preserves the previous article's history entry.
The Connections list is absent from reading mode.

Customize wiki page exposes Edit controls beside prose fields. The local Tiptap
bundle loads on the first text edit. Save writes only changed fields; cancel
restores the reader in place. Choose details exposes field/section labels, values,
order, placement, visibility and individual resets, including empty source fields
and their source-edit action. It adds wiki-only facts, aliases and pinned explicit
relationships, and retains connection label/direction/visibility controls.

`lexicon-prose.js` renders sanitized Markdown or saved Tiptap JSON without loading
the editor. Paragraphs, headings, formatting, lists, tables and field boundaries
are preserved. Explicit links retain stable targets and exact phrases. Automatic
links use a cached index of all loaded visible articles and unambiguous whole
names/aliases. A destination can repeat once per introduction, body/section and
infobox. Explicit links take priority; self/hidden/ambiguous/substring matches
are skipped. No per-mention database requests are made.

Selection is captured before dialogs focus. Manual links can target unconnected
articles. Confirmed unlink keeps words/formatting. Automatic suppression applies
to the destination across the page, so removal never shifts to a later mention.
Normal reading mode exposes a Text actions button beside selected text, an
always-available toolbar action, right-click on prose and Shift+F10/Context Menu.
Ctrl/Cmd+K opens linking for a reader selection. Actions use explicit Save/Cancel
dialogs and do not write on opening or canceling. Ordinary unselected links keep
native browser actions; Shift+right-click bypasses the article menu. Image
context actions capture the actual right-click point independently
of the previous caret. Keyboard actions use the current selection/caret. Existing
assets and uploads support alt/caption; successful placements split paragraphs
without changing source galleries. Cancellation/failure leaves prose intact.

Annotations/excerpts store a stable field identity plus quote/prefix/suffix
context. Unique passages relocate after source edits. Missing or ambiguous
passages show clean prose and author repair/removal controls. Adding a link/image
does not copy inherited prose into an override.

Same-wiki routing uses the loaded model and real URLs/history. Delayed fixture
checks still measure zero document/database/auth/image requests for internal
article clicks (about 50–115 ms including test-driver overhead). Actual loads and
Reload source fetch current data. Images do not block text or replace editor
drafts; account changes invalidate pending responses and clear the model.
Cold entry immediately has a navigation/content shell. Independent source and
wiki reads run together; fresh article introductions/body appear after ownership,
source availability and visibility overrides are checked, while module details
finish loading. No private article content is cached in browser storage. Images
remain nonblocking and Reload source performs a fresh authoritative read.

## Build and verification

Editor sources/lockfile are in `scripts/lexicon-editor`. Run
`pnpm --dir scripts/lexicon-editor install --ignore-scripts`, then
`node scripts/lexicon-editor/build.mjs` to rebuild local assets and license notices.
References: [Tiptap JavaScript integration](https://tiptap.dev/docs/editor/getting-started/install/vanilla-javascript),
[links](https://tiptap.dev/docs/editor/extensions/marks/link),
[TableKit](https://tiptap.dev/docs/editor/extensions/functionality/table-kit).

Install test dependencies with `npm install --prefix tests --ignore-scripts`, start
`npm run dev`, and use Google Chrome. Set `CENTRALIS_BASE_URL` to
`http://127.0.0.1:4173`; `PGLITE_MODULE` and `PLAYWRIGHT_MODULE` can select preinstalled
modules. Run from the repository root:

```powershell
node tests/lexicon-database.cjs
node tests/lexicon-images.cjs
node tests/lexicon-media.cjs
node tests/lexicon-browser.cjs
node tests/lexicon-navigation.cjs
node tests/lexicon-complete-browser.cjs
node tests/lexicon-reader-cases.cjs
node tests/lexicon-annotations-browser.cjs
node tests/lexicon-formatting.cjs
node tests/chronicle-placement-browser.cjs
node tests/chronicle-builder-browser.cjs
node tests/chronicle-generation-browser.cjs
node tests/chronicle-dirty-browser.cjs
node tests/lexicon-followups-browser.cjs
node tests/header-browser.cjs
```

The Builder test caches the app's pinned React 18.3.1, ReactDOM 18.3.1, React Flow
11.11.4 and ELK 0.9.3 browser libraries from the same jsDelivr URLs used by the app
under ignored `node_modules/.cache/lexicon/canvas-vendor`.

| Requested scenario | Checks exercised |
| --- | --- |
| 1. Root editing | Real React Flow double-click, enabled Chronicle action, first detail, direct reload, Back to Builder and preview; no placeholder/child/wiki |
| 2. Section fields | History add/move, section removal, template switch, draft cancel and injected save failure/retry; stable field/value and unchanged other city |
| 3. Two wikis | Actual Chronicle edits, isolated label/value/placement, live inheritance and value-only reset; source snapshots |
| 4. Standalone | Homepage create/reopen, two articles, named section, zero-valued infobox fact, links/navigation; Tiptap save/cancel/scroll |
| 5. Reader structure | One title, nested groups, deterministic/cycle-safe containment, direct/search visits, Builder/Chronicle headings and distinct anchors |
| 6. Search | Dropdown/Enter/arrows/Back, full URL, no results, section/description/alias-only matches, hidden/foreign exclusion |
| 7. Links | Exact manual phrase/cancel, first automatic mention, ambiguity, persistent suppression, connection editor and unchanged source edges |
| 8. Images/anchors | Second-paragraph right-click with first caret, split/alt/caption/reload, upload failure/cancel, source-prefix relocation and missing-passage repair |
| 9. Root semantics | Prose-only concept, city with zero fact, multi-planet story with explicitly pinned relationship/excerpt; desktop/760/390/320px layouts |

Tests run actual migrations in PGlite PostgreSQL through a Supabase-shaped adapter
and use real app screens. They inspect stored rows, RLS and source snapshots.
Media handler tests use isolated storage/signing adapters. Screenshots are under
ignored `node_modules/.cache/lexicon/screenshots`.

The follow-up suites cover the six reported issues, including held-detail fetches
during first entry, search route/history/scroll/direct reload without extra
internal navigation requests, section link repetition/aliases/ambiguity, reader
selection/right-click/keyboard/mobile actions, clicked image placement, source
isolation, dirty-state revert/failure/save/history, and visible/multiple/hidden/
missing View in Lexicon targets. Generation tests use held fixture responses;
no paid live AI request is made. These follow-ups need no migration or Edge
Function deployment; frontend assets and the new search HTML route must be served.

No signed-in production browser session was available. Live OAuth, real storage
uploads/signed URLs and production-account editing were not exercised. Schema,
RLS and endpoint deployment were checked live. This phase did not commit, push or
deploy the frontend; the checkout remains available on the local server.
