export const FICTIONAL_NAMING_RULES = `
Universal Fictional Naming Rules

Apply these rules to all generated proper names, including people, places, cultures, species, planets, organizations, vessels, technologies, objects, laws, and events.

Before naming anything, consider what it is, who named it, why and when it was named, how it is used, and which culture, institution, species, or historical period produced it. The result should feel like a believable in-world name, not something created only to sound impressive.

Fit each name to the established setting and entity type. Follow existing naming conventions without copying their exact roots, syllables, prefixes, or suffixes.

Do not imitate recognizable real-world cultures, famous fictional works, or common fantasy and science-fiction naming styles unless requested.

Do not create names by slightly respelling, shortening, extending, reversing, combining, or rearranging familiar names. Minor spelling changes do not make a name original.

Favor natural, restrained names over dramatic, symbolic, majestic, ominous, whimsical, exotic, or attention-seeking ones. Names should feel inherited, assigned, adapted, translated, standardized, or shaped through ordinary use.

Do not force an entity's appearance, personality, purpose, geography, or full history into its name. Names may be practical, ordinary, imperfect, outdated, or only loosely connected to what they identify.

Match the name to the entity. Personal names should work in conversation, place names on maps and in directions, scientific names within their naming system, and laws, organizations, vessels, technologies, and events in appropriate functional forms.

When naming different entity types, use different naming logic. Do not give everything the same style of invented single-word name.

Keep names pronounceable, coherent, and reasonably concise. Unless another format is requested, use standard letters and spaces and avoid decorative spelling, apostrophes, hyphens, accent marks, numerals, and unusual capitalization.

Treat every name as an independent construction. Do not create variety by cycling initials, balancing the alphabet, forcing uncommon letters, swapping prefixes or suffixes, rotating vowels, or repeating roots, endings, lengths, or rhythms.

Reject and regenerate any set containing obvious substitution families, alphabetical sequences, repeated root groups, or prefix-and-suffix matrices.

For multiple names, vary length, syllable count, rhythm, stress, opening sound, ending sound, and internal structure. Names may share broad cultural traits, but their construction pattern should not be obvious.

Do not repeatedly reuse a small set of proper-name roots to create artificial world cohesion. Reuse a name only when an intentional in-world relationship justifies it.

Count only genuinely distinct names. A city, an event named after it, and a law bearing its name do not count as three original names unless an interconnected set is requested.

Never use a banned name or a recognizable near variant, including minor spelling changes, phonetic equivalents, altered vowels, added or removed letters, shortened or expanded forms, attached affixes, or names containing the banned name as their dominant component.

Before returning the result, silently reject any name that is familiar, formulaic, clichéd, overly descriptive, hard to pronounce without reason, too similar to another result, or more like a username, product, placeholder, or generated label than an in-world name.

Follow the requested quantity and format exactly. Return only the names unless additional details are requested.
`.trim();

export const FICTIONAL_NAMING_PROMPT_SECTION = [
  FICTIONAL_NAMING_RULES,
  "These naming rules govern name construction only. If this prompt requests JSON, descriptions, metadata, or other fields, keep the requested output format exactly.",
].join("\n\n");
