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
The preview header includes **Open in Lexicon**. It opens the matching root or
element article directly when one linked wiki contains it, or offers the visible
wikis when several match. Hidden articles are excluded. With no linked wiki, the
preview provides a link to Lexicon without creating a wiki automatically.

Custom fields receive IDs when added to the draft. Their dialog edits name,
multiline value and assigned-section placement; records without sections omit the
location selector. Move, rename, order, remove and cancel preserve other drafts.
Save upserts the same IDs on retries. Removing an assignment or changing templates
moves its custom fields to top-level Details without modifying shared templates.

Article Details items from connected wikis also appear as Chronicle custom fields,
with their wiki named beside each item. These edit the same `lexicon_facts` rows;
they do not create duplicate source fields. Save applies edits and removals, while
canceling navigation retains the draft. Renaming or reordering a pinned excerpt
or relationship preserves its reference; changing its value converts it to a plain
fact. Each wiki keeps its own items, including hidden ones available for editing.
Article Details uses Section → Group → Item. Sections are full-width headings;
groups have a left-hand label and a list of text or linked items on the right.
Items may also sit directly in a section or outside all sections. One **Manage
Article Details** button opens the hierarchy editor, with a single Add control
for sections, groups and items. Selecting an entry opens its editing controls.
**Add item** combines text and article links; it also accepts selections from the
wiki context menu and can place them in an existing section/group. Unchanged
selected text added outside a group retains its pinned excerpt reference.
Removing a section keeps its groups and items. Chronicle identifies the wiki and
section and preserves mixed item lists when only their label/order changes.
The existing `lexicon_detail_groups` table stores sections for compatibility;
`links` facts store groups or a single linked item using `reference.presentation`.

Overview modules always render before other modules in Chronicle and Lexicon,
including when added last or assigned a higher sort order. Other modules retain
their configured order. Lexicon keeps this priority when an Overview heading has
a wiki-local label override.
The outline combines the introduction shortcut and any top-level Overview heading
into one entry, retaining its subsections and existing heading anchors.
Once the article title scrolls out of view, it appears above Article Details in
the right panel and stays visible while that panel scrolls. It hides again when
the main heading returns to view.

Chronicle's Modules panel also has a separate **Import / Export** dialog. It
exchanges `centralis.chronicle.modules` version 1 JSON for selected assigned
modules, using section/field IDs rather than labels. Blank exports use null;
current-value exports include unsaved inline Markdown and module-scoped custom
fields. Top-level details, basic element properties, and wiki-owned Article
Details are excluded. Download, clipboard JSON, and an instructions/template
message all work without an AI provider, generation call, or knowledge sync.

Import accepts files, plain JSON, and a single surrounding JSON code fence.
Target/template mismatches block review; unknown, moved, duplicate, or invalid
rows remain visible but cannot be applied. Review compares with the current
draft, preselects empty fields, and keeps occupied fields unless selected.
Null/blank/omitted values skip rather than clear; zero and false remain values.
Changes can be edited and selected individually or by module. Apply rechecks
definitions, module assignments and current draft values, then updates only the
accepted controls. Successive imports accumulate in the draft; ordinary Save
persists them. Cancel and export do not change the dirty baseline.

Toast UI editors disable automatic focus during loading and workspace rebuilds.
Explicit editor focus uses `preventScroll`; saves and field/module changes do not
scroll to the bottom. Initial route navigation still starts at the top. Builder's
Add Element Type list uses a viewport-positioned top-layer popover, independent of
the modal's scroll area, with arrow, Home/End, Page Up/Down, Enter and Escape support.

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
write source data, with one explicit exception: creating a page from selected text
in a universe wiki creates its Universe Builder element too. Movie Tracker schema
and access rules are unchanged.

`20261123182642_lexicon_create_linked_page.sql` is applied to Centralis. Its invoker
RPC creates the page and exact-text link atomically. It checks wiki/source/type
ownership and uses stable request IDs so retries cannot duplicate the page. A
standalone wiki creates an article and navigation entry; a universe wiki creates
an element using the selected type, title and optional introduction. A failed link
write rolls back page creation. Anonymous execution is disabled.

`20261123184930_lexicon_article_detail_groups.sql` is also applied to Centralis.
It adds owner-scoped `lexicon_detail_groups` and `lexicon_detail_group_items`, plus
the `links` fact kind. Composite foreign keys restrict membership to the same
wiki/article; source fields retain their original records. `lexicon_save_detail`
saves a detail and group membership atomically, with invoker permissions. New
tables have RLS and no anonymous access. Live advisors found no security or
missing-FK-index issues for these objects (new indexes can initially be unused).

`20261123222917_lexicon_detail_items.sql` is applied to Centralis. It extends
the existing details validator to accept mixed text/article items and distinguish
single linked items from groups. Ownership and target checks remain intact; no
tables, policies or grants change. Live metadata confirms the validator update,
and security advisors report no Lexicon findings.

Live metadata confirms new RLS policies and the intended placement column and
triggers. Movie, universe, element and universe-custom-field column signatures,
RLS flags and policy/trigger counts match their pre-migration values. Advisors
reported no security findings for the new objects or missing FK indexes. New
indexes are reported as unused until production usage.

## Reader and authoring

`lexicon-data.js` loads current owned source records. Chronicle assignment joins
use `chronicle_modules.data.section_id`; values join by element and template field
ID. Section custom fields default to the body, top-level fields to Article Details.
Empty content is omitted while zero/false remain visible. Roots receive no inferred
type or facts extracted from children.

`lexicon-core.js` resolves presentation overrides, relationships, aliases, search
and breadcrumbs. Breadcrumbs prefer group ancestry or authored standalone
navigation. Otherwise directed Contains/Includes/Parent of relationships can
provide containment. Stable IDs resolve multiple parents with cycle guards.
Ordinary graph edges do not imply ancestry.

The reader has one title, breadcrumbs, local search, current-page contents and
All articles. Contents use actual visible headings with distinct anchors for
duplicate names. Nested branches start collapsed on every article entry. Scrolling
into a heading expands its branch and ancestors; each branch can also be toggled
manually. The reader uses left contents, central article prose and right Article
Details/source tools. Search ranks titles/aliases before descriptions, headings and
body/field text, groups by article, and excludes hidden/out-of-wiki content. Enter
opens full results; arrows activate suggestions and Escape dismisses them. Search
has Wiki home > Search results breadcrumbs and search-appropriate actions.
Back restores the previous article and scroll position; Forward restores results
and query. Selecting a suggestion preserves the previous article's history entry.
The Connections list is absent from reading mode.
The Article Details sidebar sticks below the header on desktop, with independent
overflow for long contents. On phones it returns to normal flow. Back to top
appears after scrolling 300 pixels, supports keyboard activation and reduced
motion, and returns focus to the article heading.

Customize wiki page exposes Edit controls beside prose fields. The local Tiptap
bundle loads on the first text edit. Save writes only changed fields; cancel
restores the reader in place. Choose details exposes field/section labels, values,
order, placement, visibility and individual resets, including empty source fields
and their source-edit action. It adds wiki-only facts, aliases and pinned explicit
relationships, and retains connection label/direction/visibility controls.
Article Details provides removal in each entry's manager form. Wiki-created
items are deleted; source-derived fields are hidden only in that wiki, preserving
their Chronicle values and reset controls. Removal preserves other editor drafts.

`lexicon-prose.js` renders sanitized Markdown or saved Tiptap JSON without loading
the editor. Paragraphs, headings, formatting, lists, tables and field boundaries
are preserved. Explicit links retain stable targets and exact phrases. Automatic
links use a cached index of all loaded visible articles and unambiguous whole
names/aliases. A destination can repeat once per introduction, body/section and
Article Details. Explicit links take priority; self/hidden/ambiguous/substring matches
are skipped. No per-mention database requests are made.
Automatic links are generated at render time, not saved into source prose. Manual
links persist their destination ID and field-scoped quote anchor.

Selection is captured before dialogs focus. Manual links can target unconnected
articles. Confirmed unlink keeps words/formatting. Automatic suppression applies
to the destination across the page, so removal never shifts to a later mention.
Reading and editing modes expose a solid Text actions button beside selected text,
right-click on prose and Shift+F10/Context Menu. The bottom editor toolbar contains
only Save page and Cancel edits; the left navigation has no Text actions button. Both the selection
menu and link dialog offer Create new page, without writes until confirmation.
Ctrl/Cmd+K opens linking for a reader selection. Actions use explicit Save/Cancel
dialogs and do not write on opening or canceling. Right-clicking an article link
opens Replace link and Remove link, capturing the clicked text even if an unrelated
selection exists. Shift+right-click bypasses the article menu. Link pickers show
the article title, type and location without internal ID fragments. Image
context actions capture the actual right-click point independently
of the previous caret. Keyboard actions use the current selection/caret. Existing
assets and uploads support alt/caption; successful placements split paragraphs
without changing source galleries. Cancellation/failure leaves prose intact.
Article Details images and inline illustrations open the site's shared image
viewer, including keyboard activation, captions and focus return on closing.

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
node tests/lexicon-layout-browser.cjs
node tests/lexicon-outline-browser.cjs
node tests/lexicon-image-viewer-browser.cjs
node tests/lexicon-create-page.cjs
node tests/lexicon-create-page-browser.cjs
node tests/lexicon-article-details-browser.cjs
node tests/lexicon-link-context-browser.cjs
node tests/lexicon-detail-groups.cjs
node tests/lexicon-detail-groups-browser.cjs
node tests/chronicle-overview-browser.cjs
node tests/chronicle-scroll-browser.cjs
node tests/chronicle-module-exchange.cjs
node tests/chronicle-module-exchange-browser.cjs
node tests/header-browser.cjs
```

The Builder test caches the app's pinned React 18.3.1, ReactDOM 18.3.1, React Flow
11.11.4 and ELK 0.9.3 browser libraries from the same jsDelivr URLs used by the app
under ignored `node_modules/.cache/lexicon/canvas-vendor`.
The scrolling regression test uses the real Toast UI editor from the app's CDN,
cached under ignored `node_modules/.cache/chronicle/toast`.

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
