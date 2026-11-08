import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { fingerprint } from "../../kernel/runner/work.js";
import type { Actor } from "../agents/model.js";
import { actors } from "../agents/model.js";
import { deleteSetting, readJsonSetting, readSetting, writeSetting } from "../settings/repo.js";
import {
  type GlossaryResult,
  libraryPronunciationsMax,
  type PronunciationRules,
  parsePronunciationGlossary,
  type SkippedGlossaryRow,
} from "./pronunciation.js";

// Settings → Voices → Name pronunciations: one Pronunciation Glossary of your own, in the same
// `Term: /ipa/` lines an article's own glossary uses. Its entries come before the article's, so
// a name keeps the same pronunciation in every video however each article spells it out. A
// project takes a copy when it starts (and again when Edit project refreshes it), so a change
// here never alters a project's narration behind its back. Aliases on the Pronunciation page are
// the other half: they change the words, this changes the sounds.

export const libraryPronunciationsKey = "narration.pronunciations";
const savedKey = "narration.pronunciations.saved";

const savedRow = z
  .object({ at: z.string().min(1).max(40), by: z.enum(actors) })
  .strict()
  .readonly();

// What the list says and what narration makes of it: how many names it pronounces, the rows it
// has to skip, and the names left without a pronunciation on purpose. English rules, which is
// what the editor and the MCP tool report; a project parses the same text again under its own
// language and pronunciation rules. `version` is what the text is now: a save carries the
// version it was made from, so two writers can't quietly overwrite each other.
export interface LibraryPronunciations {
  readonly text: string;
  readonly terms: number;
  readonly version: string;
  readonly skipped?: readonly SkippedGlossaryRow[];
  readonly unpronounced?: number;
  readonly savedAt?: string;
  readonly savedBy?: Actor;
}

export function readLibraryPronunciations(db: DatabaseSync): LibraryPronunciations {
  const saved = readJsonSetting(db, savedKey, savedRow, undefined);
  return {
    ...describeLibraryPronunciations(readSetting(db, libraryPronunciationsKey) ?? ""),
    ...(saved === undefined ? {} : { savedAt: saved.at, savedBy: saved.by }),
  };
}

export function describeLibraryPronunciations(text: string): LibraryPronunciations {
  const parsed = parsePronunciationGlossary(text);
  return {
    text,
    terms: parsed.ok ? parsed.entries.length : 0,
    version: versionOf(text),
    ...(parsed.ok && parsed.skipped !== undefined ? { skipped: parsed.skipped } : {}),
    ...(parsed.ok && parsed.unpronounced !== undefined
      ? { unpronounced: parsed.unpronounced }
      : {}),
  };
}

// Short enough to pass around and read in a refusal, long enough never to collide.
export function versionOf(text: string): string {
  return fingerprint({ pronunciations: text.trim() }).slice(0, 16);
}

export type SavePronunciationsResult =
  | { readonly ok: true; readonly list: LibraryPronunciations }
  | { readonly ok: false; readonly reason: "refused"; readonly detail: string }
  | {
      readonly ok: false;
      readonly reason: "conflict";
      readonly detail: string;
      // The list as it stands now, so the editor can show what changed and the caller can save
      // again from it.
      readonly current: LibraryPronunciations;
    };

// `version` is the list the save was made from. It is required once a list exists: a save
// without it, or from an older one, is refused rather than replacing what somebody else wrote
// in another window or through an agent.
export function saveLibraryPronunciations(
  deps: { readonly db: DatabaseSync; readonly clock: Clock },
  text: unknown,
  version?: string | undefined,
  by: Actor = "person",
): SavePronunciationsResult {
  if (typeof text !== "string")
    return {
      ok: false,
      reason: "refused",
      detail: "Write the list as Term: /ipa/ lines, one name per line.",
    };
  if (text.length > libraryPronunciationsMax)
    return {
      ok: false,
      reason: "refused",
      detail: `Keep the list under ${String(libraryPronunciationsMax)} characters; it is ${String(text.length)} now. Remove the names you no longer narrate, then Save.`,
    };
  const current = readLibraryPronunciations(deps.db);
  if (current.text !== "" && version !== current.version)
    return {
      ok: false,
      reason: "conflict",
      detail: conflictDetail(current, version),
      current,
    };
  const trimmed = text.trim();
  if (trimmed === "") deleteSetting(deps.db, libraryPronunciationsKey);
  else writeSetting(deps.db, libraryPronunciationsKey, trimmed);
  writeSetting(deps.db, savedKey, JSON.stringify({ at: deps.clock.now().toISOString(), by }));
  return { ok: true, list: readLibraryPronunciations(deps.db) };
}

// Said to whoever sent the save: the person at the page, or an agent reading a refusal. It
// names what the list is now and the one step that keeps their own work.
function conflictDetail(current: LibraryPronunciations, version: string | undefined): string {
  const who =
    current.savedBy === "agent"
      ? " by an agent"
      : current.savedBy === "assistant"
        ? " by the assistant"
        : "";
  const when = current.savedAt === undefined ? "" : ` at ${current.savedAt}`;
  const names = `${String(current.terms)} ${current.terms === 1 ? "name" : "names"}`;
  return version === undefined
    ? `The list has ${names} already, saved${who}${when}. Read it first and send your save with the version it gives, so this one does not replace what is there.`
    : `The list changed since this save was prepared: it has ${names} now, saved${who}${when}. Read it again and save with the version it gives; on the page, Save mine anyway keeps what is on screen.`;
}

// The entries a project's copy pronounces, under the project's own language and rules. An
// unparseable list is never fatal: its bad rows are skipped, and the editor is where they are
// named (the run's notices number the rows of the article's glossary, not of this list).
export function libraryGlossary(
  text: string | undefined,
  language?: string | undefined,
  rules?: PronunciationRules,
): GlossaryResult {
  if (text === undefined || text.trim() === "") return { ok: true, entries: [] };
  return parsePronunciationGlossary(text, language, rules);
}
