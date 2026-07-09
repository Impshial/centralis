# Centralis

Centralis is a private, browser-based creative operations dashboard. It combines worldbuilding, Chronicle element management, chat log archiving, lightweight utilities, calendar tools, movie tracking, and shared Supabase-backed authentication into one static web app.

The app is built with static HTML, CSS, and JavaScript. Supabase provides authentication, database metadata, row-level security, and Edge Functions. iDrive e2/S3-compatible storage is used through Edge Functions for private object storage such as generated images and Chat Repository HTML files.

## Local Development

From the project folder:

```powershell
npm run dev
```

Then open:

```text
http://127.0.0.1:4173/
```

Equivalent command:

```powershell
npm start
```

The local server is intentionally simple. It serves the static files from this directory and relies on CDN-hosted browser dependencies.

## Major Modules

### Centralis Dashboard

`index.html` is the signed-in dashboard. It focuses on recent work instead of quick-launch tiles:

- Recent Universes
- Recent Chronicle Elements
- Recent Chat Logs

Dashboard panels are collapsible, start expanded, and use cached recent-section markup to reduce visible reload churn. Cards can show associated primary images as backgrounds.

### Shared Header

The live site header is rendered by `script.js` through a shared header renderer. Existing page-level header markup remains as a fallback, but runtime navigation changes should be made in the shared renderer so every page updates consistently.

Current top-level navigation:

- World Building
  - Universe Builder
  - Stellar Architect
  - Chronicle
- Entertainment
  - Movie Tracker
  - Chat Repository
  - Episode Roulette placeholder
- Utilities
  - Calendar
  - Useful Things
  - Tool placeholders
- Settings placeholders

### Universe Builder and Canvas

Universe Builder manages universe records and opens the canvas editor.

Primary files:

- `universe-builder.html`
- `universe-canvas.html`
- `script.js`
- `flow-canvas.js`

Features include:

- authenticated universe creation/listing
- recent universe cards
- canvas nodes, notes, groups, and links
- node formatting controls
- element type library seeding
- object images through Supabase Edge Functions and iDrive e2-backed storage

### Chronicle

Chronicle manages standalone and universe-linked elements.

Primary files:

- `chronicle.html`
- `chronicle-editor.html`
- `chronicle.js`

Features include:

- standalone and universe-linked Chronicle elements
- element detail/editor page
- template fields and section modules
- rich text editing for long fields
- primary image generation and viewing
- dashboard deep links to individual elements
- top-load behavior for editor hash routes

### Chat Repository

Chat Repository stores private chat logs, supports full-text search, and renders each chat as its own isolated HTML document.

Primary files:

- `chat-repository.html`
- `chat-repository.js`
- `supabase/migrations/202606220001_add_chat_repository.sql`
- `supabase/migrations/202606260001_add_chat_repository_search.sql`
- `supabase/functions/upload-chat-log`
- `supabase/functions/get-chat-log`
- `supabase/functions/save-chat-log`
- `supabase/functions/delete-chat-log`
- `supabase/functions/reindex-chat-logs`
- `supabase/functions/generate-chat-log-metadata`

Features include:

- raw chat HTML paste/import workflow
- Centralis-generated standalone chat HTML layout
- AI-assisted title and summary generation only
- upload of complete HTML chat logs to iDrive e2
- metadata and searchable extracted text in Supabase
- full-text search across title, summary, and extracted visible chat text
- soft deletion
- edit and re-save HTML
- optional upload-time image generation
- image prompt review before generation
- image upload, replacement, viewing, and unlinking
- dashboard deep links that open the selected chat reader modal
- sandboxed iframe reader for isolated rendering

Complete stored HTML is kept in iDrive e2. Supabase stores metadata, search text, and image associations.

### Useful Things

Useful Things is a catch-all utility page for small tools.

Primary files:

- `useful-things.html`
- `useful-things.js`
- `supabase/functions/convert-text-format`

Current utility:

- Text Converter

Text Converter supports WYSIWYG and raw text input, an icon-based formatting toolbar, and AI-assisted conversion to:

- Markdown
- HTML
- Plain Text
- JSON
- YAML
- XML
- CSV
- TSV
- Markdown Table
- JSON Lines
- SQL Inserts
- Outline
- Bullet List
- Numbered List
- Summary

### Calendar

Calendar files:

- `calendar.html`
- `calendar.js`

The schema reference includes calendars, categories, events, recurrence rules, exceptions, reminders, and related calendar tables.

### Movie Tracker

Movie Tracker files:

- `movie-tracker.html`
- `movie-tracker.js`

### Stellar Architect

Stellar Architect files:

- `stellar-architect.html`
- `stellar-architect.js`

The current page uses the shared Centralis styling and Tailwind-generated CSS.

## Supabase and Storage

### Client Configuration

`supabase-config.js` contains the browser-side Supabase URL and publishable key.

### Database Migrations

Important migrations in this worktree:

- `supabase/migrations/202606010001_nested_element_groups.sql`
- `supabase/migrations/202606220001_add_chat_repository.sql`
- `supabase/migrations/202606260001_add_chat_repository_search.sql`

The local schema reference is stored in:

- `centralis_db_schema.md`

### Edge Functions

Current Edge Functions include:

- `convert-text-format`
- `delete-chat-log`
- `generate-chat-log-metadata`
- `generate-object-image`
- `get-chat-log`
- `reindex-chat-logs`
- `save-chat-log`
- `unlink-object-images`
- `upload-chat-log`

Shared helpers:

- `supabase/functions/_shared/chat-storage.ts`
- `supabase/functions/_shared/image-storage.ts`

Object storage is accessed server-side from Edge Functions. The browser should not receive private storage credentials.

## Styling

Primary shared CSS:

- `styles.css`
- `tailwind.css`
- `tailwind.generated.css`
- `tailwind.config.js`
- `postcss.config.js`

Shared primary and secondary action buttons use the same height, padding, font sizing, and inline-flex centering. Primary action color is based on the Centralis teal accent:

```text
#78D5C8
```

If Tailwind styles are changed, rebuild:

```powershell
npm run tailwind:build
```

## Validation

Useful syntax checks:

```powershell
node --check .\script.js
node --check .\chat-repository.js
node --check .\chronicle.js
node --check .\useful-things.js
node --check .\calendar.js
node --check .\movie-tracker.js
node --check .\flow-canvas.js
node --check .\stellar-architect.js
```

Whitespace check:

```powershell
git -c safe.directory=C:/Users/impsh/Documents/Codex/2026-04-25/make-me-a-webapp-that-has diff --check
```

On Windows, Git may report LF-to-CRLF warnings. Those warnings are not whitespace errors.

## Deploying Supabase Changes

When Supabase is linked and authenticated:

```powershell
npx supabase db push --linked --yes
```

Deploy Edge Functions as needed, for example:

```powershell
npx supabase functions deploy upload-chat-log --project-ref lztmpbxmntcktijcdcda
npx supabase functions deploy get-chat-log --project-ref lztmpbxmntcktijcdcda
npx supabase functions deploy save-chat-log --project-ref lztmpbxmntcktijcdcda
npx supabase functions deploy delete-chat-log --project-ref lztmpbxmntcktijcdcda
npx supabase functions deploy reindex-chat-logs --project-ref lztmpbxmntcktijcdcda
npx supabase functions deploy generate-chat-log-metadata --project-ref lztmpbxmntcktijcdcda
npx supabase functions deploy convert-text-format --project-ref lztmpbxmntcktijcdcda
```

Some function deploys require the Supabase access token in the shell environment.

## Repository Notes

This app is currently a static frontend with Supabase and Edge Function integrations. There is no frontend build step required for normal local development unless Tailwind source changes need to be regenerated.
