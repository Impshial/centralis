# Merge Tailwind CSS Into Main Stylesheet

## Summary
Consolidate Centralis styling into one source of truth by moving all CSS from `tailwind.generated.css` into `styles.css`, then removing Tailwind-generated stylesheet loading and Tailwind build tooling. Preserve current visual behavior first; do not deduplicate overlapping selectors in this pass.

## Key Changes
- Append the full contents of `tailwind.generated.css` to the end of `styles.css`, after all current main CSS.
- Add a clear section comment before the appended block, such as `/* Former tailwind.generated.css */`.
- Remove every `<link rel="stylesheet" href="tailwind.generated.css?...">` from HTML pages.
- Update each affected `styles.css` cache key to a shared new version, for example `styles.css?v=css-merged-1`.
- Delete Tailwind-only files: `tailwind.generated.css`, `tailwind.css`, `tailwind.config.js`, and `postcss.config.js`.
- Remove Tailwind scripts and dependencies from `package.json`: `tailwind:build`, `tailwind:watch`, `tailwindcss`, `postcss`, and `autoprefixer`.
- Leave duplicate selectors intact for now so the current cascade is preserved exactly and future CSS fixes only need to happen in `styles.css`.

## Public Interfaces
- All pages should load only `styles.css` for app styling.
- There should be no generated CSS artifact or Tailwind build command in the project.
- Future style edits should be made only in `styles.css`.

## Test Plan
- Run searches confirming no references remain to `tailwind.generated.css`, `tailwind.css`, `tailwind:build`, or `tailwind:watch`.
- Run `git diff --check`.
- Smoke-test representative high-risk pages:
  - `index.html`
  - `movie-tracker.html`
  - `fusion.html`
  - `stellar-architect.html`
  - `calendar.html`
  - `local-chat.html`
- Verify shared header/navigation, theme menu, generation activity modal, Movie Tracker table styling, Fusion canvas/homepage, and Stellar Architect still render correctly.
- Confirm the merge preserved cascade order by checking that styles previously overridden by `tailwind.generated.css` still win after consolidation.

## Assumptions
- Full Tailwind cleanup is desired, not just removing the stylesheet link.
- No deduplication should happen in this pass; exact behavior preservation is more important than reducing CSS size.
- Any later cleanup of duplicate selectors should be handled as a separate refactor after the one-file merge is stable.
