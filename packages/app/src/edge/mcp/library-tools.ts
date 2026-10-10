import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { NarrationAlias } from "../../kernel/ports/narration-aliases.js";
import { recordAgentAction } from "../../slices/agents/repo.js";
import { listDocumentThemes } from "../../slices/document/library.js";
import { documentThemeNameMax } from "../../slices/document/model.js";
import { nameMax } from "../../slices/library/model.js";
import { listEntries, listPrompts } from "../../slices/library/repo.js";
import {
  type ImportOutcome,
  type ItemSave,
  importEach,
  type LibrarySection,
  libraryFile,
  libraryFileMaxBytes,
  mergeAliases,
  type ReadLibraryFile,
  readLibraryFile,
  type SkippedItem,
} from "../../slices/library/transfer.js";
import { listNarrationAliases } from "../../slices/narration/aliases-library.js";
import { readAliasTable } from "../../slices/narration/aliases-table.js";
import { type RouteCallDeps, refusal, text } from "./call-route.js";
import { fileArg } from "./route-tool.js";

const sections = ["prompts", "entries", "documentThemes", "aliases"] as const;
const stems: Readonly<Record<LibrarySection, string>> = {
  prompts: "prompts",
  entries: "intros-and-outros",
  documentThemes: "pdf-themes",
  aliases: "aliases",
};
const problemSchema = z
  .object({
    title: z.string(),
    detail: z.string().optional(),
    fields: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
  })
  .loose();

// The file Library → Import or export writes for one section, with the name the page gives it.
export function exportLibrary(deps: RouteCallDeps, section: LibrarySection): CallToolResult {
  const file = libraryFile(
    section === "prompts"
      ? { prompts: listPrompts(deps.db) }
      : section === "entries"
        ? { entries: listEntries(deps.db) }
        : section === "documentThemes"
          ? { documentThemes: listDocumentThemes(deps.db) }
          : { aliases: listNarrationAliases(deps.db) },
    deps.clock.now(),
  );
  return text(
    JSON.stringify({
      name: `slopify-${stems[section]}-${file.exportedAt.slice(0, 10)}.json`,
      file,
    }),
  );
}

// One item through the route its editor saves with, so the Library's own rules decide.
async function saveThrough(deps: RouteCallDeps, path: string, item: unknown): Promise<ItemSave> {
  const response = await deps.api(
    new Request(new URL(path, "http://localhost"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(item),
    }),
  );
  if (response.ok) return { ok: true };
  const problem = problemSchema.safeParse(await response.json());
  const fields = problem.success ? (problem.data.fields ?? []) : [];
  if ((response.status === 400 || response.status === 409) && fields.length > 0)
    return { ok: false, fields };
  throw new Error(
    problem.success
      ? (problem.data.detail ?? problem.data.title)
      : `Slopify answered HTTP ${String(response.status)} without saying why.`,
  );
}

async function importInto<T extends { readonly name: string }>(
  deps: RouteCallDeps,
  read: ReadLibraryFile<T>,
  options: {
    readonly existing: readonly { readonly group: string; readonly name: string }[];
    readonly groupOf: (item: T) => string;
    readonly max: number;
    readonly path: string;
  },
): Promise<ImportOutcome | { readonly refused: string }> {
  if (!read.ok) return { refused: read.message };
  const outcome = await importEach(read.items, {
    existing: options.existing,
    groupOf: options.groupOf,
    max: options.max,
    save: (item) => saveThrough(deps, options.path, item),
  });
  return { ...outcome, skipped: [...read.skipped, ...outcome.skipped] };
}

// Aliases join the saved list the way the page's import does, then are saved at once.
async function importAliases(
  deps: RouteCallDeps,
  name: string,
  content: string,
): Promise<
  | {
      readonly added: number;
      readonly updated: number;
      readonly skipped: readonly SkippedItem[];
    }
  | { readonly refused: string }
> {
  let aliases: readonly NarrationAlias[];
  let skipped: readonly SkippedItem[];
  if (/\.json$/iu.test(name) || content.trimStart().startsWith("{")) {
    const parsed = readLibraryFile(content, "aliases");
    if (!parsed.ok) return { refused: parsed.message };
    aliases = parsed.items;
    skipped = parsed.skipped;
  } else {
    const table = readAliasTable(content, name);
    aliases = table.aliases;
    skipped = table.skipped.map((line) => ({
      item: `Line ${String(line)}`,
      reason: "it needs the written form, then a comma (or tab), then how to say it.",
    }));
  }
  if (aliases.length === 0)
    return { refused: "it holds no aliases. Fix the file and import it again." };
  const merged = mergeAliases(listNarrationAliases(deps.db), aliases, (alias) => alias);
  const response = await deps.api(
    new Request(new URL("/api/pronunciations/aliases", "http://localhost"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aliases: merged.rows }),
    }),
  );
  if (response.ok) return { added: merged.added, updated: merged.updated, skipped };
  const problem = problemSchema.safeParse(await response.json());
  return {
    refused: problem.success
      ? [
          problem.data.detail ?? problem.data.title,
          ...(problem.data.fields ?? []).map((field) => field.message),
        ].join(" ")
      : `Slopify answered HTTP ${String(response.status)} without saying why.`,
  };
}

export async function importLibrary(
  deps: RouteCallDeps,
  section: LibrarySection,
  file: z.infer<typeof fileArg>,
): Promise<CallToolResult> {
  const bytes = Buffer.from(file.base64, "base64");
  if (bytes.byteLength > libraryFileMaxBytes)
    return refusal(
      `${file.name} wasn't imported: it is larger than ${String(libraryFileMaxBytes / 1024 / 1024)} MB, far more than a Library export. Send the file export_library made.`,
    );
  const content = bytes.toString("utf8");
  const outcome =
    section === "prompts"
      ? await importInto(deps, readLibraryFile(content, "prompts"), {
          existing: listPrompts(deps.db).map((one) => ({ group: one.kind, name: one.name })),
          groupOf: (item) => item.kind,
          max: nameMax,
          path: "/api/prompts",
        })
      : section === "entries"
        ? await importInto(deps, readLibraryFile(content, "entries"), {
            existing: listEntries(deps.db).map((one) => ({ group: one.category, name: one.name })),
            groupOf: (item) => item.category,
            max: nameMax,
            path: "/api/entries",
          })
        : section === "documentThemes"
          ? await importInto(deps, readLibraryFile(content, "documentThemes"), {
              existing: listDocumentThemes(deps.db).map((one) => ({ group: "", name: one.name })),
              groupOf: () => "",
              max: documentThemeNameMax,
              path: "/api/document-themes",
            })
          : await importAliases(deps, file.name, content);
  if ("refused" in outcome) return refusal(`${file.name} wasn't imported: ${outcome.refused}`);
  if (outcome.added === 0 && ("updated" in outcome ? outcome.updated === 0 : true))
    return refusal(
      `Nothing was imported from ${file.name}. ${outcome.skipped.map((one) => `“${one.item}”: ${one.reason}`).join(" ")} Fix the file and import it again.`,
    );
  recordAgentAction(deps.db, {
    id: deps.ids.next(),
    projectId: null,
    scheduleId: null,
    tool: "import_library",
    title: "Import into the Library",
    revisionId: null,
    createdAt: deps.clock.now().toISOString(),
  });
  return text(JSON.stringify({ file: file.name, ...outcome }));
}

export function registerLibraryTools(server: McpServer, deps: RouteCallDeps): void {
  const section = z
    .enum(sections)
    .describe("prompts, entries (intros and outros), documentThemes (PDF themes) or aliases");
  server.registerTool(
    "export_library",
    {
      title: "Export a Library section",
      description:
        "Library → Import or export → Export: the section as the .json file the page downloads, with the name it gives it.",
      inputSchema: { section },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ section: picked }) => exportLibrary(deps, picked),
  );
  server.registerTool(
    "import_library",
    {
      title: "Import into the Library",
      description:
        "Library → Import or export → Import from a file: a .json file Export made (or, for aliases, a two-column .csv or .tsv table). Each item is saved with the Library's own checks; one whose name is taken is saved as \"<name> (imported)\", one that doesn't fit is skipped with its reason. Aliases join the saved list and are saved.",
      inputSchema: { section, file: fileArg },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ section: picked, file }) => importLibrary(deps, picked, file),
  );
}
