# Lexicon

Lexicon has two screens: `lexicon.html` lists saved wikis and opens the creation
dialog; `lexicon-wiki.html?wiki=<id>&article=<id>` reads articles. Add `&edit=1`
to open the Wiki Editor. Article routes use saved IDs and survive title changes.
Both universe-backed and standalone wikis use this reader and editor.

## Storage and authorization

Migration `20261123001138_add_lexicon_wikis.sql` adds seven Lexicon-owned tables:

| Table | Purpose |
| --- | --- |
| `lexicon_wikis` | Owner, name, kind, optional source universe |
| `lexicon_articles` | Standalone titles, introductions, visibility |
| `lexicon_navigation` | Standalone labels, ordering, nesting, article references |
| `lexicon_sections` | Standalone sections and ordering |
| `lexicon_fields` | Standalone typed values, placement, visibility |
| `lexicon_overrides` | One property per wiki and stable source subject |
| `lexicon_links` | Wiki-only connections, endpoints, direction, label |

All seven tables use RLS through the current app user's `users.clerk_user_id`
mapping. Child policies resolve through the owned wiki. Composite foreign keys
prevent cross-wiki standalone references. An invoker validation trigger checks
source membership, override property types, link endpoints, and navigation
cycles. Parent edits lock the wiki row to serialize concurrent moves.

The override primary key is `(wiki_id, subject_type, article_id, subject_id,
property)`. Template fields are identified by both element and field IDs;
sections use the assigned Chronicle module ID. Source links use their link row
ID. Missing rows inherit; an explicit empty string remains intentionally blank.
Saving or resetting one property cannot overwrite another property's row.
Wiki-wide link settings use an empty article ID; page visibility uses the current
endpoint ID. Deleted source identities never match replacement rows by name.

`lexicon-data.js` reads current source records on every load. It follows assigned
template sections and joins values by both element and field ID. Its writes are
limited to Lexicon tables. `lexicon-core.js` resolves overrides, visibility,
placement and destination grouping. The reader omits empty fields and sections,
retains zero/false, and uses explicit connections and typed references only.

The `lexicon-images` Edge Function authenticates the caller and checks wiki,
universe and element ownership before signing primary/fallback image URLs. It
does not repair or update source images. Shared authentication skips automatic
element-type library seeding on Lexicon pages. Source editing is available only
through the existing Chronicle editor and Universe Builder links.

No columns, policies, triggers, or data are changed on Movie Tracker, Builder,
Chronicle, or their source tables by this migration or Lexicon customization.

## Verification

From the repository root, install the pinned test dependencies and start the app:

```powershell
npm install --prefix tests --ignore-scripts
npm run dev
```

With Google Chrome installed, run these in another terminal:

```powershell
$env:CENTRALIS_BASE_URL = 'http://127.0.0.1:4173'
node tests/lexicon-database.cjs
node tests/lexicon-images.cjs
node tests/lexicon-browser.cjs
node tests/lexicon-navigation.cjs
node tests/header-browser.cjs
```

`PGLITE_MODULE` and `PLAYWRIGHT_MODULE` can point to preinstalled modules instead.
Run from the repository root; fixtures read the migration and application files
there. Browser screenshots are written under ignored
`node_modules/.cache/lexicon/screenshots`.

The database fixture runs the actual migration in PGlite PostgreSQL, with two
owners and representative Builder/Chronicle records. Browser tests use the real
HTML, shared header, reader, editor, creation dialogs and Chronicle editor; a
Supabase-shaped test adapter sends their queries to that database. Source writes
are rejected unless the browser is on the Chronicle editor route. Source rows
are compared before and after wiki actions.

Verified flows:

- Two independently customized wikis from one universe, persisted across reloads.
- Real Chronicle editor changes, live inherited values, pinned values and
  independent resets; unsaved editor drafts survive other property saves.
- Multiple relationships to one destination, direction and labels, page-only and
  wiki-wide hiding, wiki-only link creation/deletion, hidden article restoration.
- Nested groups, converging/cyclic connections, unconnected elements and renamed
  source elements resolving through stable IDs.
- Standalone wiki, two linked articles, sections, zero-valued infobox fields,
  nested/reordered navigation and reopening from the homepage.
- Ownership denial, retries, concurrent independent properties, cross-wiki
  constraints, navigation cycle rejection, blank/false/zero values, source
  visibility and deleted/replaced identities.
- Image endpoint authentication, ownership, primary selection and zero image
  writes; reader/editor and homepage toolbars at 1440/760/390/320px; shared header
  touch, pointer and keyboard controls.

## Deployment checked

The migration was applied to the linked Centralis Supabase project
`lztmpbxmntcktijcdcda`; `lexicon-images` version 1 is active with JWT verification.
Live metadata confirms RLS and ownership policies on all seven tables. Compared
source column definitions, RLS flags, policy counts and custom-trigger counts
were unchanged, including `movies`.

Supabase advisors reported no Lexicon security findings or missing foreign-key
indexes. Newly created indexes are listed as
[unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)
before production usage; they are retained for scoped reads and foreign keys.
Existing findings elsewhere in the project were left unchanged.

No signed-in production browser session was available. Full UI persistence
tests used the isolated PostgreSQL fixture, not production user records. Live
OAuth, signed storage URLs and production-account editing were not exercised.
The frontend remains in this checkout; no Vercel deployment was performed.

## Article navigation performance

Previously, every article link loaded another HTML document and repeated shared
initialization, authentication lookup, 14 database reads in the representative
universe fixture, and image signing. The reader waited for all of that work
before replacing the `Loading wiki...` heading.

Same-wiki article links, wiki-home links and reader/editor switches now use the
current document's model and update the real URL through browser history.
Back/forward navigation renders the corresponding article without refetching.
Navigation branches retain their expanded state when the view mode is unchanged.
Modified clicks, downloads, other targets, external/source-editor links and
different wikis keep normal browser navigation. No wiki data is stored in a
cross-page cache. An account-change event clears the model and invalidates pending
responses; restored browser documents reload to obtain current authorized data.

Actual wiki loads and `Reload source` still fetch current records. Independent
override/link reads run alongside universe validation. Text renders before image
signing completes; image responses update only the reader infobox, preserving
editor drafts and the active article. Failed image requests do not block reading.
Source text and prose-link behavior are unchanged.

Local Playwright/PGlite measurements used an explicit 80 ms delay per database
request and 400 ms per image request, with fixture authentication:

| Article click | Before | After |
| --- | ---: | ---: |
| Click to target heading, including test-driver overhead | 1,497 ms | approximately 100 ms |
| Document requests | 1 | 0 |
| Database reads | 14 | 0 |
| Authentication lookups | 1 | 0 |
| Image-signing requests | 1 | 0 |

The navigation test additionally holds image responses pending until after text
and editor forms render. It verifies history, real new-tab clicks, direct URLs,
fresh source reads on reload, hidden articles, cross-wiki/account isolation,
late-image response handling, retained drafts and unchanged source rows. These
measurements describe the isolated fixture, not a signed-in production session.
