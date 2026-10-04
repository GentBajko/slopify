import { z } from "zod";
import type { NarrationAlias } from "../../kernel/ports/narration-aliases.js";
import { documentThemeNameMax } from "../document/model.js";
import type { DocumentTheme } from "../document/theme.js";
import { documentThemeSchema } from "../document/theme-schema.js";
import { narrationAliasSchema } from "../narration/aliases-schema.js";
import {
  bodyMax,
  type EntryDraft,
  entryCategories,
  entryModes,
  nameMax,
  type PromptDraft,
  promptKinds,
} from "./model.js";

// The file Library → Import or export writes and reads: prompts, intros and outros, PDF themes
// and narration aliases as plain items, not database rows (the full backup in
// slices/storage/backup-format.ts carries rows for one install's own restore). One item that
// doesn't fit is skipped with its reason; the rest still import. Browser-safe: the web app
// builds and reads these files, then saves each item through the same routes as its editor.

export const libraryFileFormat = "slopify-library";
export const libraryFileVersion = 1;
// Far above a real Library, low enough that a wrong file is refused before it is parsed.
export const libraryFileMaxBytes = 20 * 1024 * 1024;
const itemsMax = 10_000;

export interface ThemeItem {
  readonly name: string;
  readonly values: DocumentTheme;
}

export interface LibraryItems {
  readonly prompts: PromptDraft;
  readonly entries: EntryDraft;
  readonly documentThemes: ThemeItem;
  readonly aliases: NarrationAlias;
}
export type LibrarySection = keyof LibraryItems;

export interface LibraryFile extends LibrarySections {
  readonly format: typeof libraryFileFormat;
  readonly version: typeof libraryFileVersion;
  readonly exportedAt: string;
}

const sectionWords: Readonly<Record<LibrarySection, string>> = {
  prompts: "prompts",
  entries: "intros or outros",
  documentThemes: "PDF themes",
  aliases: "narration aliases",
};

// Only what the editor saves travels: ids, keywords and dates are the install's own.
const pickers: { readonly [S in LibrarySection]: (item: LibraryItems[S]) => LibraryItems[S] } = {
  prompts: (item) => ({ kind: item.kind, name: item.name, body: item.body }),
  entries: (item) => ({
    category: item.category,
    mode: item.mode,
    name: item.name,
    body: item.body,
  }),
  documentThemes: (item) => ({ name: item.name, values: item.values }),
  aliases: (item) => ({
    written: item.written,
    spoken: item.spoken,
    wholeWord: item.wholeWord,
    caseSensitive: item.caseSensitive,
  }),
};

export type LibrarySections = { readonly [S in LibrarySection]?: readonly LibraryItems[S][] };

export function libraryFile(sections: LibrarySections, now: Date): LibraryFile {
  return {
    format: libraryFileFormat,
    version: libraryFileVersion,
    exportedAt: now.toISOString(),
    ...(sections.prompts === undefined ? {} : { prompts: sections.prompts.map(pickers.prompts) }),
    ...(sections.entries === undefined ? {} : { entries: sections.entries.map(pickers.entries) }),
    ...(sections.documentThemes === undefined
      ? {}
      : { documentThemes: sections.documentThemes.map(pickers.documentThemes) }),
    ...(sections.aliases === undefined ? {} : { aliases: sections.aliases.map(pickers.aliases) }),
  };
}

const name = (max: number) =>
  z
    .string({ error: "it has no name." })
    .trim()
    .min(1, { error: "it has no name." })
    .max(max, { error: `its name is longer than ${String(max)} characters.` });
const body = z
  .string({ error: "it has no text." })
  .max(bodyMax, { error: `its text is longer than ${String(bodyMax)} characters.` });

const itemSchemas: { readonly [S in LibrarySection]: z.ZodType<LibraryItems[S]> } = {
  prompts: z.object({
    kind: z.enum(promptKinds, { error: `its kind isn't one of ${promptKinds.join(", ")}.` }),
    name: name(nameMax),
    body,
  }),
  entries: z.object({
    category: z.enum(entryCategories, { error: "it is neither an intro nor an outro." }),
    mode: z.enum(entryModes, { error: `its mode isn't one of ${entryModes.join(", ")}.` }),
    name: name(nameMax),
    body,
  }),
  documentThemes: z.object({ name: name(documentThemeNameMax), values: documentThemeSchema }),
  aliases: narrationAliasSchema,
};

export interface SkippedItem {
  // "Dossier", or "Item 3" when the item has no usable name.
  readonly item: string;
  readonly reason: string;
}

export type ReadLibraryFile<T> =
  | { readonly ok: true; readonly items: readonly T[]; readonly skipped: readonly SkippedItem[] }
  | { readonly ok: false; readonly message: string };

const head = z
  .object({ format: z.literal(libraryFileFormat), version: z.number().int().positive() })
  .loose();

// Reads one section of a file. A wrong or newer file is refused as a whole, with what to do.
export function readLibraryFile<S extends LibrarySection>(
  text: string,
  section: S,
): ReadLibraryFile<LibraryItems[S]> {
  const what = sectionWords[section];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      message: `it isn't a Slopify library file (the text isn't JSON). Pick a .json file made by Export.`,
    };
  }
  const top = head.safeParse(raw);
  if (!top.success)
    return {
      ok: false,
      message: `it isn't a Slopify library file. Pick a .json file made by Export on a Library tab.`,
    };
  if (top.data.version > libraryFileVersion)
    return {
      ok: false,
      message:
        "it was made by a newer Slopify. Update Slopify (Settings → Updates), then import it again.",
    };
  const list = (top.data as Record<string, unknown>)[section];
  if (!Array.isArray(list) || list.length === 0)
    return {
      ok: false,
      message: `it holds no ${what}. Import it on the Library tab it was exported from.`,
    };
  if (list.length > itemsMax)
    return {
      ok: false,
      message: `it holds more than ${String(itemsMax)} ${what}. Split it into smaller files.`,
    };
  const items: LibraryItems[S][] = [];
  const skipped: SkippedItem[] = [];
  const schema = itemSchemas[section];
  for (const [index, each] of list.entries()) {
    const parsed = schema.safeParse(each);
    if (parsed.success) items.push(parsed.data);
    else skipped.push({ item: labelOf(each, index), reason: reasonOf(parsed.error) });
  }
  return { ok: true, items, skipped };
}

function labelOf(item: unknown, index: number): string {
  const named = z.object({ name: z.string().trim().min(1) }).safeParse(item);
  if (named.success) return named.data.name;
  const written = z.object({ written: z.string().trim().min(1) }).safeParse(item);
  return written.success ? written.data.written : `Item ${String(index + 1)}`;
}

function reasonOf(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) return "it doesn't fit.";
  const [first] = issue.path;
  if (first === "values") return `its setting ${issue.path.slice(1).join(".")}: ${issue.message}`;
  if (first === "written" || first === "spoken")
    return `its ${first === "written" ? "written form" : "spoken form"} is empty or too long.`;
  if (typeof first === "string" && /^it/u.test(issue.message)) return issue.message;
  return first === undefined ? "it isn't an item." : `its ${String(first)} is missing or wrong.`;
}

// A name nobody uses yet in `taken` (lower-cased): the name itself, else "<name> (imported)",
// "<name> (imported 2)"… The base is cut so the suffix still fits `max`.
export function importedName(wanted: string, taken: ReadonlySet<string>, max: number): string {
  return freeName(wanted, taken, max, (n) =>
    n === 1 ? " (imported)" : ` (imported ${String(n)})`,
  );
}

// Duplicate selected names each copy "<name> copy", then "<name> copy 2"…
export function copyName(wanted: string, taken: ReadonlySet<string>, max: number): string {
  return freeName(wanted, taken, max, (n) => (n === 1 ? " copy" : ` copy ${String(n)}`), false);
}

function freeName(
  wanted: string,
  taken: ReadonlySet<string>,
  max: number,
  suffix: (n: number) => string,
  keepIfFree = true,
): string {
  const base = wanted.trim();
  if (keepIfFree && !taken.has(base.toLowerCase())) return base;
  for (let n = 1; ; n += 1) {
    const end = suffix(n);
    const candidate = `${base.slice(0, Math.max(0, max - end.length)).trimEnd()}${end}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
