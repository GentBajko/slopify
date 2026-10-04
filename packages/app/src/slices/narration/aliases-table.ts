import type { NarrationAlias } from "../../kernel/ports/narration-aliases.js";

// Narration aliases as a two-column table, the written form then how to say it: what a
// spreadsheet saves as CSV or TSV, and what Library → Aliases exports for one. Whole word and
// Match case take the editor's defaults on the way in. Browser-safe.

export interface AliasTable {
  readonly aliases: readonly NarrationAlias[];
  // 1-based line numbers that had no written or no spoken form.
  readonly skipped: readonly number[];
}

// Tab-separated when the file says so (or its first line holds a tab), comma-separated else.
export function readAliasTable(text: string, fileName = ""): AliasTable {
  const firstLine = text.split(/\r?\n/u, 1)[0] ?? "";
  const separator = /\.tsv$/iu.test(fileName) || firstLine.includes("\t") ? "\t" : ",";
  const aliases: NarrationAlias[] = [];
  const skipped: number[] = [];
  for (const { line, cells } of rowsOf(text.replace(/^﻿/u, ""), separator)) {
    if (cells.every((cell) => cell.trim() === "")) continue;
    const written = (cells[0] ?? "").trim();
    const spoken = (cells[1] ?? "").trim();
    // A header row the spreadsheet kept: "Written,Say it as".
    if (line === 1 && /^written\b/iu.test(written)) continue;
    if (written === "" || spoken === "") {
      skipped.push(line);
      continue;
    }
    aliases.push({ written, spoken, wholeWord: true, caseSensitive: false });
  }
  return { aliases, skipped };
}

export function aliasTable(aliases: readonly NarrationAlias[], separator: "," | "\t"): string {
  const cell = (value: string): string =>
    separator === "\t"
      ? value.replace(/[\t\r\n]+/gu, " ")
      : /[",\r\n]/u.test(value)
        ? `"${value.replace(/"/gu, '""')}"`
        : value;
  return `${[["Written", "Say it as"], ...aliases.map((alias) => [alias.written, alias.spoken])]
    .map((row) => row.map(cell).join(separator))
    .join("\n")}\n`;
}

// RFC 4180 fields: a quoted field may hold the separator, "" for a quote, and line breaks.
function rowsOf(
  text: string,
  separator: string,
): readonly { readonly line: number; readonly cells: readonly string[] }[] {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (quoted) {
      if (char === '"' && text[at + 1] === '"') {
        cell += '"';
        at += 1;
      } else if (char === '"') quoted = false;
      else {
        if (char === "\n") line += 1;
        cell += char;
      }
    } else if (char === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (char === separator) {
      cells.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[at + 1] === "\n") at += 1;
      cells.push(cell);
      rows.push({ line: rowLine, cells });
      cells = [];
      cell = "";
      line += 1;
      rowLine = line;
    } else cell += char;
  }
  if (cell !== "" || cells.length > 0) {
    cells.push(cell);
    rows.push({ line: rowLine, cells });
  }
  return rows;
}
