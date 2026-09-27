-- Other languages.
--
-- The languages a saved voice speaks, as a JSON array of primary language codes (["es"]):
-- looked up from the provider when the voice is added, or typed in Settings → Voices. Play
-- lists a project's voices by it. NULL is unknown, which every voice saved before this is,
-- and an unknown voice is offered for every language.
ALTER TABLE voices ADD COLUMN languages_json TEXT CHECK (languages_json IS NULL OR json_valid(languages_json));
