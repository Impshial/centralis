# Movie Tracker database changes

The user requires new Movie Tracker functionality to use separate tables with
foreign keys referencing `public.movies`. Do not add columns, triggers, policies,
or otherwise change the main movies table's schema or access rules unless the
user explicitly requests that change. Ordinary movie edits and imports may
continue to update existing movie fields.

Custom field definitions are in `movie_custom_fields`; per-movie values are in
`movie_custom_values`. The read-only `movie_custom_records` view combines them.
