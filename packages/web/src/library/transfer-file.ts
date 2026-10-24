import {
  type ImportOutcome,
  type LibraryFile,
  libraryFileMaxBytes,
  type SkippedItem,
} from "@app/slices/library/transfer.js";
import { counted } from "@/components/selection";

// Export and Import on the Library tabs: the file goes down as a download, comes up through a
// file picker, and each imported item is saved through the same route as its editor, so the
// server's rules (lint, unique names) decide what is kept.

export function downloadFile(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

// "slopify-prompts-2026-10-04.json"
export function downloadLibraryFile(stem: string, file: LibraryFile): void {
  downloadFile(
    `slopify-${stem}-${file.exportedAt.slice(0, 10)}.json`,
    `${JSON.stringify(file, null, 2)}\n`,
    "application/json",
  );
}

export type FileText =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly message: string };

export async function fileText(file: File): Promise<FileText> {
  if (file.size > libraryFileMaxBytes)
    return {
      ok: false,
      message: `it is larger than ${String(libraryFileMaxBytes / 1024 / 1024)} MB, far more than any export Slopify makes. Pick the .json file Export made.`,
    };
  try {
    return { ok: true, text: await file.text() };
  } catch (error) {
    return {
      ok: false,
      message: `the file couldn't be read (${error instanceof Error ? error.message : String(error)}). Pick it again.`,
    };
  }
}

// The first few skipped items with their reasons, for a toast.
export function skippedText(skipped: readonly SkippedItem[]): string {
  if (skipped.length === 0) return "";
  const shown = skipped
    .slice(0, 3)
    .map((one) => `“${one.item}”: ${one.reason}`)
    .join(" ");
  const more = skipped.length > 3 ? ` And ${String(skipped.length - 3)} more.` : "";
  return `Skipped ${String(skipped.length)}: ${shown}${more}`;
}

export function importSummary(
  fileName: string,
  noun: readonly [singular: string, plural: string],
  outcome: ImportOutcome,
): { readonly text: string; readonly tone: "success" | "error" } {
  const skipped = skippedText(outcome.skipped);
  if (outcome.added === 0)
    return {
      text: `Nothing was imported from ${fileName}. ${skipped} Fix the file and import it again.`,
      tone: "error",
    };
  const renamed =
    outcome.renamed === 0
      ? ""
      : ` ${counted(outcome.renamed, "was", "were")} renamed “(imported)” because the name was taken.`;
  return {
    text: `Imported ${counted(outcome.added, noun[0], noun[1])} from ${fileName}.${renamed}${skipped === "" ? "" : ` ${skipped}`}`,
    tone: "success",
  };
}

export const refusedFile = (fileName: string, message: string): string =>
  `${fileName} wasn't imported: ${message}`;
