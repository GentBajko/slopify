import { existsSync, readFileSync, statSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { transact } from "../../kernel/db/tx.js";
import type { Ids } from "../../kernel/ids.js";
import type { Paths } from "../../kernel/paths.js";
import {
  aliasSpokenMax,
  aliasWrittenMax,
  type NarrationAlias,
} from "../../kernel/ports/narration-aliases.js";
import { projectExists } from "../admission/repo.js";
import { estimateRequests } from "../estimate/index.js";
import { listNarrationAliases, saveNarrationAliases } from "../narration/aliases-library.js";
import { parsePronunciationGlossary } from "../narration/pronunciation.js";
import type { DraftReviewDeps } from "../play-drafts/model.js";
import { templateById } from "../project-templates/repo.js";
import { outputPath } from "../storage/layout.js";
import { outputsOf } from "../storage/repo.js";
import { type BudgetRoom, budgetRoom, budgetWords, fitsBudget } from "./budget.js";
import { enqueueJob } from "./jobs.js";
import type { StudioRefusal, StudioResult } from "./model.js";
import { sampleOf, setSampleVersion } from "./repo.js";
import { exceedsAcknowledged, type UnknownAcks } from "./save.js";

// Voice → "Say it as…": the names the sample's script says that a voice may get wrong (its
// Pronunciation Glossary, and words Library → Narration aliases already change), each with the
// first line it is said in. Typing how to say one writes a Library alias and re-voices only
// the sample's lines that say it, priced first like every sample.

export interface NameToCheck {
  readonly term: string;
  readonly ipa: readonly string[];
  // The first sentence of the script that says it, for the play button; null when none does.
  readonly line: string | null;
  // What Library → Narration aliases says instead, or null.
  readonly spokenAs: string | null;
}

const namesMax = 30;
const linesMax = 50;
// The script read for its sentences: a sample's is an outline and a chapter, well under this.
const scriptBytesMax = 2_000_000;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const wordPattern = (word: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, "giu");

function sentencesOf(text: string): readonly string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");
}

// Every sentence that says the word: whole words, any case.
export function linesWith(text: string, written: string): readonly string[] {
  const word = written.trim();
  if (word === "") return [];
  const pattern = wordPattern(word);
  return sentencesOf(text)
    .filter((sentence) => {
      pattern.lastIndex = 0;
      return pattern.test(sentence);
    })
    .slice(0, linesMax);
}

function aliasFor(aliases: readonly NarrationAlias[], term: string): NarrationAlias | undefined {
  return aliases.find((alias) =>
    alias.caseSensitive
      ? alias.written === term
      : alias.written.toLowerCase() === term.toLowerCase(),
  );
}

export function namesToCheck(
  glossary: string | undefined,
  script: string | undefined,
  aliases: readonly NarrationAlias[],
): readonly NameToCheck[] {
  const parsed = glossary === undefined ? undefined : parsePronunciationGlossary(glossary);
  const entries = parsed?.ok === true ? parsed.entries : [];
  const lineOf = (term: string) =>
    script === undefined ? null : (linesWith(script, term)[0] ?? null);
  const names: NameToCheck[] = entries.map((entry) => ({
    term: entry.term,
    ipa: entry.ipa,
    line: lineOf(entry.term),
    spokenAs: aliasFor(aliases, entry.term)?.spoken ?? null,
  }));
  const seen = new Set(names.map((name) => name.term.toLowerCase()));
  for (const alias of aliases) {
    if (seen.has(alias.written.toLowerCase())) continue;
    const line = lineOf(alias.written);
    if (line === null) continue;
    seen.add(alias.written.toLowerCase());
    names.push({ term: alias.written, ipa: [], line, spokenAs: alias.spoken });
  }
  return names.slice(0, namesMax);
}

export interface SayItAsDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly ids: Ids;
  readonly clock: Clock;
}

function textOf(deps: SayItAsDeps, projectId: string, role: string): string | undefined {
  const output = outputsOf(deps.db, projectId)
    .filter((row) => row.role === role)
    .at(-1);
  if (output === undefined) return undefined;
  const path = outputPath(deps.paths, projectId, output.path);
  if (!existsSync(path) || statSync(path).size > scriptBytesMax) return undefined;
  const text = readFileSync(path, "utf8");
  return text.trim() === "" ? undefined : text;
}

// The sample's spoken script and its glossary, or undefined before its first paid sample.
function sampleTexts(
  deps: SayItAsDeps,
  templateId: string,
): { readonly script: string | undefined; readonly glossary: string | undefined } | undefined {
  const sample = sampleOf(deps.db, templateId);
  if (sample === undefined || !projectExists(deps.db, sample.projectId)) return undefined;
  return {
    script: textOf(deps, sample.projectId, "article_txt"),
    glossary: textOf(deps, sample.projectId, "glossary"),
  };
}

export interface PronunciationsView {
  readonly names: readonly NameToCheck[];
  // The template's voice uses Library → Narration aliases; without it "Say it as" changes nothing.
  readonly aliasesOn: boolean;
  // The voice the play button speaks with, or null when none is chosen.
  readonly voice: {
    readonly provider: string;
    readonly model: string;
    readonly voice: string;
  } | null;
  readonly problem: string | null;
}

const missingTemplate =
  "This template no longer exists; it may have been deleted. Go to Templates to see your templates.";

export function pronunciationsOf(deps: SayItAsDeps, templateId: string): PronunciationsView {
  const head = templateById(deps.db, templateId);
  if (head === undefined)
    return { names: [], aliasesOn: false, voice: null, problem: missingTemplate };
  const { audio } = head.document.form;
  const voice =
    audio.provider !== "" && audio.model !== "" && audio.voice !== ""
      ? { provider: audio.provider, model: audio.model, voice: audio.voice }
      : null;
  const aliasesOn = audio.useNarrationAliases === true;
  const texts = sampleTexts(deps, templateId);
  if (texts === undefined)
    return {
      names: [],
      aliasesOn,
      voice,
      problem:
        "The names to check come from the sample's script. Press Save or Make sample to make one.",
    };
  const names = namesToCheck(texts.glossary, texts.script, listNarrationAliases(deps.db));
  return {
    names,
    aliasesOn,
    voice,
    problem:
      names.length === 0
        ? "The sample's script has no Pronunciation Glossary, so there are no names to check. Type a word below to hear it."
        : null,
  };
}

export const sayItAsSchema = z
  .object({
    written: z.string().trim().min(1).max(aliasWrittenMax),
    spoken: z.string().trim().min(1).max(aliasSpokenMax),
    // The price the Save button showed.
    acknowledgedHigh: z.number().finite().min(0).max(10_000),
    acknowledgedUnknown: z.boolean().optional(),
  })
  .strict()
  .readonly();

export interface SayItAsQuote {
  // How many of the sample's lines say the word, and voicing them again the new way.
  readonly lines: number;
  readonly high: number;
  readonly unknown: number;
  readonly usesPlan: boolean;
  readonly fits: boolean;
  readonly budget: BudgetRoom;
  readonly problem: string | null;
}

const aliasesOff =
  "This template's voice doesn't use your pronunciations (Settings → Voices → Pronunciation), so “Say it as” would change nothing. Turn on Use my Pronunciation list under All Narration settings, press Save, then try again.";

export function quoteSayItAs(
  deps: SayItAsDeps & {
    readonly review: Pick<DraftReviewDeps, "catalogue">;
    readonly timeZone?: string | undefined;
  },
  templateId: string,
  ask: { readonly written: string; readonly spoken: string },
): StudioResult<SayItAsQuote> {
  const head = templateById(deps.db, templateId);
  if (head === undefined) return { ok: false, reason: "not-found", message: missingTemplate };
  const budget = budgetRoom(deps.db, deps.clock.now(), deps.timeZone);
  const { audio } = head.document.form;
  if (audio.useNarrationAliases !== true)
    return {
      ok: true,
      value: {
        lines: 0,
        high: 0,
        unknown: 0,
        usesPlan: false,
        fits: true,
        budget,
        problem: aliasesOff,
      },
    };
  const script = sampleTexts(deps, templateId)?.script;
  const lines = script === undefined ? [] : linesWith(script, ask.written);
  if (lines.length === 0)
    return {
      ok: true,
      value: { lines: 0, high: 0, unknown: 0, usesPlan: false, fits: true, budget, problem: null },
    };
  const pattern = wordPattern(ask.written.trim());
  const estimate = estimateRequests(
    lines.map((line) => ({
      kind: "tts" as const,
      stage: "Narration",
      provider: audio.provider,
      model: audio.model,
      text: line.replace(pattern, ask.spoken.trim()),
    })),
    deps.review.catalogue.read(),
  );
  return {
    ok: true,
    value: {
      lines: lines.length,
      high: estimate.high,
      unknown: estimate.unknown,
      usesPlan: estimate.rows.some((row) => row.onPlan === true),
      fits: fitsBudget(
        budget,
        estimate.high,
        estimate.rows.some((row) => row.onPlan === true),
      ),
      budget,
      problem: null,
    },
  };
}

const money = (value: number) => `$${value.toFixed(2)}`;

export type SayItAsResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly alias: NarrationAlias;
        // Whether the sample's lines that say it are being voiced again.
        readonly queued: boolean;
        readonly quote: SayItAsQuote;
      };
    }
  | {
      readonly ok: false;
      readonly reason: StudioRefusal;
      readonly message: string;
      readonly quote?: SayItAsQuote;
    };

export async function sayItAs(
  deps: SayItAsDeps & {
    readonly review: Pick<DraftReviewDeps, "catalogue">;
    readonly acks: UnknownAcks;
    readonly timeZone?: string | undefined;
  },
  templateId: string,
  raw: unknown,
): Promise<SayItAsResult> {
  const parsed = sayItAsSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      reason: "invalid-input",
      message: `Type how to say it in 1 to ${String(aliasSpokenMax)} characters, then press Save.`,
    };
  const { written, spoken, acknowledgedHigh, acknowledgedUnknown } = parsed.data;
  const quoted = quoteSayItAs(deps, templateId, { written, spoken });
  if (!quoted.ok) return quoted;
  const quote = quoted.value;
  if (quote.problem !== null) return { ok: false, reason: "invalid-input", message: quote.problem };
  if (exceedsAcknowledged(quote.high, acknowledgedHigh))
    return {
      ok: false,
      reason: "cost-changed",
      message: `Voicing these lines again now costs about ${money(quote.high)}, more than the ${money(acknowledgedHigh)} you saw. Press Save again to accept the new price.`,
      quote,
    };
  if (quote.unknown > 0 && acknowledgedUnknown !== true)
    return {
      ok: false,
      reason: "cost-changed",
      message:
        "This voice has no known price. Tick that you accept unknown costs, then press Save again.",
      quote,
    };
  if (!quote.fits)
    return {
      ok: false,
      reason: "over-budget",
      message: `${budgetWords(quote.budget, quote, "Voicing these lines again")}, or try again tomorrow.`,
      quote,
    };
  const head = templateById(deps.db, templateId);
  if (head === undefined) return { ok: false, reason: "not-found", message: missingTemplate };
  const alias: NarrationAlias = { written, spoken, wholeWord: true, caseSensitive: false };
  const at = deps.clock.now().toISOString();
  return transact(deps.db, (): SayItAsResult => {
    const kept = listNarrationAliases(deps.db).filter(
      (one) => one.written.toLowerCase() !== written.toLowerCase(),
    );
    const saved = saveNarrationAliases(deps, [...kept, alias]);
    if (!saved.ok)
      return {
        ok: false,
        reason: "invalid-input",
        message: `The alias wasn't saved: ${saved.fields.map((field) => field.message).join(" ")} Fix it in Settings → Voices → Pronunciation, then try again.`,
      };
    if (quote.lines === 0) return { ok: true, value: { alias, queued: false, quote } };
    // The sample's next revision copies Library → Narration aliases as they are now, so its
    // rebuild voices again only the chunks whose spoken words changed.
    // Its unknown prices were accepted above, or it priced every line.
    deps.acks.accept(templateId, head.version);
    setSampleVersion(deps.db, templateId, head.version, {
      state: "queued",
      at,
      quotedHigh: quote.high,
      heldReason: null,
    });
    enqueueJob(deps.db, {
      templateId,
      templateVersion: head.version,
      ackHigh: acknowledgedHigh,
      kind: "save",
      requestedAt: at,
    });
    return { ok: true, value: { alias, queued: true, quote } };
  });
}
