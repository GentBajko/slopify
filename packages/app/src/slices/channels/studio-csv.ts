// The video titles in a CSV file, such as YouTube Studio's Analytics → Content export. Pure.
//
// The title column is the one whose header reads "Video title", else "Title", else "Content"
// (any case); failing that, the first column holding text that is not a number, a date or an id.
// Quoted fields may hold commas, doubled quotes and line breaks. A leading byte-order mark is
// dropped, and a file with more semicolons or tabs than commas in its first line is read with
// that separator. Studio's "Total" row is skipped.

const titleHeaders = ["video title", "title", "content"];

export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.slice(0, source.search(/\r?\n|$/));
  const separator = pickSeparator(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field === "") quoted = true;
    else if (char === separator) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function pickSeparator(line: string): string {
  const count = (char: string): number => line.split(char).length - 1;
  const candidates = [",", ";", "\t"].map((char) => ({ char, n: count(char) }));
  return candidates.reduce((best, next) => (next.n > best.n ? next : best)).char;
}

export function titlesFromCsv(text: string): string[] {
  const rows = parseCsv(text);
  const header = rows[0];
  if (header === undefined) return [];
  // In that order: Studio's export has both "Content" (the video id) and "Video title".
  const names = header.map((cell) => cell.trim().toLowerCase());
  const named = titleHeaders.map((name) => names.indexOf(name)).find((index) => index !== -1) ?? -1;
  const column = named !== -1 ? named : textColumn(rows);
  if (column === -1) return [];
  const body = named !== -1 || looksLikeHeader(header, column) ? rows.slice(1) : rows;
  return body
    .map((cells) => (cells[column] ?? "").replace(/\s+/g, " ").trim())
    .filter((title) => title !== "" && title.toLowerCase() !== "total");
}

// A cell that is only a number, duration, date or a YouTube video id is no title.
function plainValue(cell: string): boolean {
  const value = cell.trim();
  return (
    value === "" ||
    /^[-+]?[\d.,:%\s]+$/.test(value) ||
    /^\d{4}-\d{2}-\d{2}/.test(value) ||
    /^[A-Za-z0-9_-]{11}$/.test(value)
  );
}

function textColumn(rows: readonly (readonly string[])[]): number {
  const width = Math.max(...rows.map((cells) => cells.length));
  const sample = rows.slice(1, 21).length > 0 ? rows.slice(1, 21) : rows;
  const text = (column: number, cell: (value: string) => boolean): boolean =>
    sample.some((cells) => !plainValue(cells[column] ?? "") && cell(cells[column] ?? ""));
  // Titles are words: a column with spaces in it wins over a column of single tokens (ids,
  // handles), which is taken only when there is nothing else.
  for (let column = 0; column < width; column += 1)
    if (text(column, (value) => /\S\s+\S/.test(value.trim()))) return column;
  for (let column = 0; column < width; column += 1) if (text(column, () => true)) return column;
  return -1;
}

// Without a known header name, the first row is a header when the other columns of it are
// words while the rows below hold numbers there.
function looksLikeHeader(header: readonly string[], column: number): boolean {
  return header.some((cell, index) => index !== column && !plainValue(cell) && cell.trim() !== "");
}

// Pasted titles: one per line, blank lines and surrounding spaces dropped.
export function titlesFromLines(text: string): string[] {
  return text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "");
}
