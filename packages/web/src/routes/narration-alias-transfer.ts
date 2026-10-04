import type { NarrationAlias } from "@app/kernel/ports/narration-aliases.js";
import { libraryFile, readLibraryFile, type SkippedItem } from "@app/slices/library/transfer.js";
import { aliasTable, readAliasTable } from "@app/slices/narration/aliases-table.js";
import { useToast } from "@/components/kit/toast";
import { counted } from "@/components/selection";
import {
  downloadFile,
  downloadLibraryFile,
  fileText,
  refusedFile,
  skippedText,
} from "@/library/transfer-file";

// Import or export on Library → Aliases: a Slopify library file (.json, every setting of each
// alias) or a two-column table (.csv or .tsv: the written form, then how to say it). An import
// joins the list on screen the way Paste many does; Save aliases keeps it.

export const aliasFileTypes = ".json,.csv,.tsv,.txt,application/json,text/csv,text/plain";

const aliasWords = (count: number): string => counted(count, "alias", "aliases");

export function useAliasTransfer({
  onImport,
}: {
  // Folds the imported aliases into the list; answers how many were added and updated.
  readonly onImport: (aliases: readonly NarrationAlias[]) => {
    readonly added: number;
    readonly updated: number;
  };
}): {
  readonly exportJson: (aliases: readonly NarrationAlias[]) => void;
  readonly exportCsv: (aliases: readonly NarrationAlias[]) => void;
  readonly importFile: (file: File) => Promise<void>;
} {
  const notify = useToast();
  const filled = (aliases: readonly NarrationAlias[]) =>
    aliases.filter((alias) => alias.written.trim() !== "" && alias.spoken.trim() !== "");
  return {
    exportJson: (aliases) => {
      const list = filled(aliases);
      downloadLibraryFile("aliases", libraryFile({ aliases: list }, new Date()));
      notify(`Exported ${aliasWords(list.length)}.`, "success");
    },
    exportCsv: (aliases) => {
      const list = filled(aliases);
      downloadFile(
        `slopify-aliases-${new Date().toISOString().slice(0, 10)}.csv`,
        aliasTable(list, ","),
        "text/csv",
      );
      notify(`Exported ${aliasWords(list.length)} as CSV.`, "success");
    },
    importFile: async (file) => {
      const read = await fileText(file);
      if (!read.ok) {
        notify(refusedFile(file.name, read.message), "error");
        return;
      }
      let aliases: readonly NarrationAlias[];
      let skipped: readonly SkippedItem[];
      if (/\.json$/iu.test(file.name) || read.text.trimStart().startsWith("{")) {
        const parsed = readLibraryFile(read.text, "aliases");
        if (!parsed.ok) {
          notify(refusedFile(file.name, parsed.message), "error");
          return;
        }
        aliases = parsed.items;
        skipped = parsed.skipped;
      } else {
        const table = readAliasTable(read.text, file.name);
        aliases = table.aliases;
        skipped = table.skipped.map((line) => ({
          item: `Line ${String(line)}`,
          reason: "it needs the written form, then a comma (or tab), then how to say it.",
        }));
      }
      const left = skippedText(skipped);
      if (aliases.length === 0) {
        notify(
          `Nothing was imported from ${file.name}. ${left === "" ? "It holds no aliases." : left} Fix the file and import it again.`,
          "error",
        );
        return;
      }
      const merged = onImport(aliases);
      const same = aliases.length - merged.added - merged.updated;
      notify(
        `Added ${aliasWords(merged.added)} and updated ${String(merged.updated)} from ${file.name}${same > 0 ? `; ${String(same)} already matched` : ""}. Press Save aliases to keep them.${left === "" ? "" : ` ${left}`}`,
        "success",
      );
    },
  };
}
