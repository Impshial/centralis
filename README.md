# Centralis

Centralis is a browser-based web app with Supabase login, a Universe Builder landing page, and a React Flow canvas for universe records.

## Run Locally

From this folder:

```powershell
npm run dev
```

Then open:

```text
http://127.0.0.1:4173/
```

The app is currently static HTML/CSS/JavaScript and loads Supabase, React Flow, React, and Phosphor Icons from CDNs.

## Key Files

- `index.html` - signed-out landing page and main homepage shell
- `universe-builder.html` - Universe Builder landing page and create dialog
- `universe-canvas.html` - React Flow canvas page
- `script.js` - shared auth, menu, theme, universe create/list logic
- `flow-canvas.js` - React Flow universe node logic
- `styles.css` - shared app styles
- `supabase-config.js` - Supabase project URL and publishable key
- `centralis_db_schema.md` - local reference copy of the Supabase schema

## Supabase Notes

The app expects:

- Supabase Auth enabled
- `users` table for Centralis user profiles
- `user_settings` table for preferences
- `universes` table for Universe Builder records

The `universes.id` value is generated client-side with `crypto.randomUUID()`.

## Current Local URL

```text
http://127.0.0.1:4173/
```
