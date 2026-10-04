import {
  formatTopicList,
  linesFromRows,
  parseTopicList,
  rowsFromLines,
  type TopicRow,
  topicRowProblems,
} from "@app/slices/schedules/topic-list.js";

// A schedule's topic queue, written three ways that convert into each other without losing
// anything: one topic per line (it fills the topic keyword), a table with a column for each
// keyword a topic sets itself, or a YAML / JSON list. Every other keyword keeps its every-run
// value, which a topic's own value overrides for that one run.

export type TopicMode = "lines" | "table" | "yaml";

export const modeLabels: Readonly<Record<TopicMode, string>> = {
  lines: "One per line",
  table: "Table",
  yaml: "YAML / JSON",
};

export interface TopicQueue {
  readonly mode: TopicMode;
  readonly rows: readonly TopicRow[];
  // The lines as typed, and the rows they were started from: a line matching one of those
  // keeps its values.
  readonly lines: string;
  readonly base: readonly TopicRow[];
  readonly yaml: string;
  // Keywords a topic sets itself, beside the topic keyword: the table's columns.
  readonly columns: readonly string[];
}

export function initialQueue(rows: readonly TopicRow[]): TopicQueue {
  return {
    mode: "lines",
    rows,
    lines: linesFromRows(rows),
    base: rows,
    yaml: "",
    columns: columnsOf(rows, []),
  };
}

export function columnsOf(
  rows: readonly TopicRow[],
  columns: readonly string[],
): readonly string[] {
  return [...new Set([...columns, ...rows.flatMap((row) => Object.keys(row.values))])];
}

export interface QueueContext {
  // The template's keywords; empty until the template is read.
  readonly keywords: readonly string[];
  readonly topicKeyword: string | null;
  // The every-run values, for the title preview and for what a topic may leave out.
  readonly everyRun: Readonly<Record<string, string>>;
  readonly form:
    | { readonly title: string; readonly values: Readonly<Record<string, string>> }
    | undefined;
  // The saved queue: its topics are not checked again.
  readonly kept: readonly TopicRow[];
  // What each keyword feeds (the title, the article prompt, an image prompt), for the same
  // "Feeds …" line Play, Edit project and templates show.
  readonly origins?: ReadonlyMap<string, readonly string[]>;
}

// A keyword with no every-run value must be set by every topic of a list or table.
function requiredOf(context: QueueContext): readonly string[] {
  return context.keywords.filter(
    (name) => name !== context.topicKeyword && (context.everyRun[name] ?? "").trim() === "",
  );
}

// The rows to save and what is wrong with them. A YAML list that doesn't read keeps the
// schedule from saving rather than saving an older queue.
export function queueResult(
  queue: TopicQueue,
  context: QueueContext,
): { readonly rows: readonly TopicRow[]; readonly problems: readonly string[] } {
  if (context.form === undefined) return { rows: queue.rows, problems: [] };
  if (queue.mode === "yaml") {
    const parsed = parseTopicList(queue.yaml, {
      keywords: context.keywords,
      topicKeyword: context.topicKeyword,
      required: requiredOf(context),
    });
    return parsed.ok
      ? { rows: parsed.rows, problems: [] }
      : { rows: [], problems: parsed.problems };
  }
  const rows = queue.rows.map((row) => ({
    title: row.title.trim(),
    // A blank cell uses the every-run value.
    values: Object.fromEntries(Object.entries(row.values).filter(([, value]) => value !== "")),
  }));
  return {
    rows,
    problems: topicRowProblems(rows, {
      keywords: context.keywords,
      topicKeyword: context.topicKeyword,
      ...(queue.mode === "table" ? { required: requiredOf(context) } : {}),
      kept: context.kept,
    }),
  };
}

// Leaving a mode turns what it holds into rows; a YAML list that doesn't read stays put so
// nothing typed is lost.
export function switchMode(
  queue: TopicQueue,
  next: TopicMode,
  context: QueueContext,
): { readonly queue: TopicQueue; readonly problems: readonly string[] } {
  if (next === queue.mode) return { queue, problems: [] };
  let rows = queue.rows;
  if (queue.mode === "yaml") {
    const parsed = parseTopicList(queue.yaml, {
      keywords: context.keywords.length === 0 ? Object.keys(context.everyRun) : context.keywords,
      topicKeyword: context.topicKeyword,
    });
    if (!parsed.ok) return { queue, problems: parsed.problems };
    rows = parsed.rows;
  }
  return {
    queue: {
      ...queue,
      mode: next,
      rows,
      lines: next === "lines" ? linesFromRows(rows) : queue.lines,
      base: next === "lines" ? rows : queue.base,
      yaml: next === "yaml" ? formatTopicList(rows, context.topicKeyword) : queue.yaml,
      columns: columnsOf(rows, queue.columns),
    },
    problems: [],
  };
}

// The queue with new rows, its lines and YAML rewritten to match whichever mode is showing.
export function withRows(
  queue: TopicQueue,
  rows: readonly TopicRow[],
  topicKeyword: string | null,
): TopicQueue {
  return {
    ...queue,
    rows,
    lines: queue.mode === "lines" ? linesFromRows(rows) : queue.lines,
    base: queue.mode === "lines" ? rows : queue.base,
    yaml: queue.mode === "yaml" ? formatTopicList(rows, topicKeyword) : queue.yaml,
    columns: columnsOf(rows, queue.columns),
  };
}

// A file of topics, added after the ones already written: YAML or JSON (`.yaml`, `.yml`,
// `.json`), else plain text with one topic per line.
export function importedRows(
  name: string,
  text: string,
  context: QueueContext,
):
  | { readonly ok: true; readonly rows: readonly TopicRow[] }
  | { readonly ok: false; readonly problems: readonly string[] } {
  if (!/\.(ya?ml|json)$/i.test(name)) return { ok: true, rows: rowsFromLines(text, []) };
  const parsed = parseTopicList(text, {
    keywords: context.keywords.length === 0 ? Object.keys(context.everyRun) : context.keywords,
    topicKeyword: context.topicKeyword,
  });
  return parsed.ok ? { ok: true, rows: parsed.rows } : { ok: false, problems: parsed.problems };
}
