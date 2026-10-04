import {
  type LibraryItems,
  type LibrarySection,
  type LibrarySections,
  libraryFile,
  readLibraryFile,
} from "@app/slices/library/transfer.js";
import { type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/kit/toast";
import { counted } from "@/components/selection";
import type { SaveResult } from "@/http";
import {
  downloadLibraryFile,
  fileText,
  importEach,
  importSummary,
  refusedFile,
} from "./transfer-file";

// Export and Import for one Library tab that saves item by item (prompts, intros and outros,
// PDF themes). Every outcome is a toast: what was imported, what was renamed and what was
// skipped with its reason.
export function useLibraryTransfer<S extends Exclude<LibrarySection, "aliases">>({
  section,
  pack,
  stem,
  noun,
  listKey,
  existing,
  groupOf,
  nameMax,
  save,
}: {
  readonly section: S;
  // The items as the file's section: `(items) => ({ prompts: items })`.
  readonly pack: (items: readonly LibraryItems[S][]) => LibrarySections;
  // The file's name: "slopify-<stem>-<date>.json".
  readonly stem: string;
  readonly noun: readonly [singular: string, plural: string];
  readonly listKey: QueryKey;
  readonly existing: readonly LibraryItems[S][];
  readonly groupOf: (item: LibraryItems[S]) => string;
  readonly nameMax: number;
  readonly save: (item: LibraryItems[S]) => Promise<SaveResult<unknown>>;
}): {
  readonly exportItems: (items: readonly LibraryItems[S][]) => void;
  readonly importFile: (file: File) => void;
  readonly importing: boolean;
} {
  const client = useQueryClient();
  const notify = useToast();
  const run = useMutation({
    mutationFn: async (file: File) => {
      const read = await fileText(file);
      if (!read.ok) return { refused: read.message } as const;
      const parsed = readLibraryFile(read.text, section);
      if (!parsed.ok) return { refused: parsed.message } as const;
      const outcome = await importEach(parsed.items, {
        existing: existing.map((one) => ({ group: groupOf(one), name: one.name })),
        groupOf,
        max: nameMax,
        save,
      });
      return { outcome: { ...outcome, skipped: [...parsed.skipped, ...outcome.skipped] } } as const;
    },
    onSuccess: (answer, file) => {
      if ("refused" in answer) {
        notify(refusedFile(file.name, answer.refused), "error");
        return;
      }
      const summary = importSummary(file.name, noun, answer.outcome);
      notify(summary.text, summary.tone);
    },
    onError: (error, file) =>
      notify(
        refusedFile(
          file.name,
          `${error.message} Press Import or export, then Import from a file, to try again.`,
        ),
        "error",
      ),
    onSettled: () => client.invalidateQueries({ queryKey: listKey }),
  });
  return {
    exportItems: (items) => {
      downloadLibraryFile(stem, libraryFile(pack(items), new Date()));
      notify(`Exported ${counted(items.length, noun[0], noun[1])}.`, "success");
    },
    importFile: (file) => run.mutate(file),
    importing: run.isPending,
  };
}
