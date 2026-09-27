import { parse, stringify } from "yaml";
import { detectSlots, render } from "../admission/substitute.js";

// A schedule's topic queue as people write it: one topic per line, a table with a column per
// keyword, or a YAML / JSON list. Shared by the server (which refuses unknown keywords before
// saving) and the schedule form (which previews each row's project title), so both read the
// same rules. A row is the stored item: `title` fills the schedule's topic keyword, `values`
// set other keywords for that one run over the schedule's every-run values.

export interface TopicRow {
  readonly title: string;
  readonly values: Readonly<Record<string, string>>;
}

// The longest value one topic may give a keyword. Word counts, names and short notes fit;
// anything longer belongs in the template.
export const topicValueMax = 2000;
export const topicTitleMax = 200;

// A template's keywords: those its project title names plus those it stores a value for (Play
// stores one for every keyword its prompts use).
export function templateKeywords(form: {
  readonly title: string;
  readonly values: Readonly<Record<string, string>>;
}): readonly string[] {
  return [...new Set([...detectSlots(form.title).names, ...Object.keys(form.values)])];
}

// The project title a run gets, exactly as the scheduler builds it: the template's values, the
// schedule's every-run values, the topic's own values, then the topic in its keyword. Without
// a topic keyword the topic is the whole title.
export function scheduledValues(
  form: { readonly values: Readonly<Record<string, string>> },
  schedule: {
    readonly topicKeyword: string | null;
    readonly values: Readonly<Record<string, string>>;
  },
  topic: TopicRow | undefined,
): Record<string, string> {
  return {
    ...form.values,
    ...schedule.values,
    ...(topic?.values ?? {}),
    ...(topic !== undefined && schedule.topicKeyword !== null
      ? { [schedule.topicKeyword]: topic.title }
      : {}),
  };
}

export function renderedTitle(
  form: { readonly title: string; readonly values: Readonly<Record<string, string>> },
  schedule: {
    readonly topicKeyword: string | null;
    readonly values: Readonly<Record<string, string>>;
  },
  topic: TopicRow | undefined,
): string {
  return topic !== undefined && schedule.topicKeyword === null
    ? topic.title
    : render(form.title, scheduledValues(form, schedule, topic));
}

const quote = (name: string): string => `“${name}”`;
const listed = (names: readonly string[]): string =>
  names.length === 0 ? "none" : names.map(quote).join(", ");

function rowName(index: number, title: string): string {
  return title === "" ? `Topic ${String(index + 1)}` : `Topic ${String(index + 1)} (${title})`;
}

// What is wrong with a queue, one plain sentence per problem naming the row and the key.
// `keywords` are the template's; `required` must be set on every row (keywords with no
// every-run value); an item equal to one in `kept` (the saved queue) is not checked again, so
// a topic saved before these rules keeps working until it is edited.
export function topicRowProblems(
  rows: readonly TopicRow[],
  options: {
    readonly keywords: readonly string[];
    readonly topicKeyword: string | null;
    readonly required?: readonly string[];
    readonly kept?: readonly TopicRow[];
  },
): readonly string[] {
  const problems: string[] = [];
  const kept = new Set((options.kept ?? []).map((row) => key(row)));
  rows.forEach((row, index) => {
    if (kept.has(key(row))) return;
    const name = rowName(index, row.title.trim());
    if (row.title.trim() === "")
      problems.push(
        options.topicKeyword === null
          ? `${name} has no title. Write one, or remove the row.`
          : `${name} has no ${quote(options.topicKeyword)}, the keyword each topic fills. Write one, or remove the row.`,
      );
    else if (row.title.trim().length > topicTitleMax)
      problems.push(
        `${name} is ${String(row.title.trim().length)} characters; a topic can be at most ${String(topicTitleMax)}. Shorten it.`,
      );
    for (const [keyword, value] of Object.entries(row.values)) {
      if (!options.keywords.includes(keyword))
        problems.push(
          `${name}: ${quote(keyword)} is not a keyword of this template (its keywords are ${listed(options.keywords)}). Rename it to one of them or remove it.`,
        );
      else if (value.length > topicValueMax)
        problems.push(
          `${name}: ${quote(keyword)} is ${String(value.length)} characters; a topic's value can be at most ${String(topicValueMax)}. Shorten it, or put the long text in the template.`,
        );
    }
    for (const keyword of options.required ?? []) {
      if (keyword === options.topicKeyword) continue;
      if ((row.values[keyword] ?? "").trim() === "")
        problems.push(
          `${name} has no ${quote(keyword)}, and there is no every-run value to fall back on. Give this topic one, or fill ${quote(keyword)} for every run.`,
        );
    }
  });
  return problems;
}

function key(row: TopicRow): string {
  return JSON.stringify([
    row.title,
    Object.entries(row.values).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

// One topic per line. A line whose text matches a row already in the queue keeps that row's
// values (first unused match), so switching to lines and back loses nothing.
export function rowsFromLines(text: string, previous: readonly TopicRow[]): readonly TopicRow[] {
  const unused = [...previous];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((title) => {
      const at = unused.findIndex((row) => row.title === title);
      if (at === -1) return { title, values: {} };
      const [row] = unused.splice(at, 1);
      return row ?? { title, values: {} };
    });
}

export function linesFromRows(rows: readonly TopicRow[]): string {
  return rows.map((row) => row.title).join("\n");
}

export type ParsedTopics =
  | { readonly ok: true; readonly rows: readonly TopicRow[] }
  | { readonly ok: false; readonly problems: readonly string[] };

// The YAML / JSON list: each item is a map of keyword to value, or a plain string (the topic).
// JSON is YAML, so a JSON array reads the same way. Numbers and yes/no are read as the text
// they were written as; lists, maps and multi-document files are refused.
export function parseTopicList(
  text: string,
  options: {
    readonly keywords: readonly string[];
    readonly topicKeyword: string | null;
    readonly required?: readonly string[];
  },
): ParsedTopics {
  if (text.trim() === "") return { ok: true, rows: [] };
  let data: unknown;
  try {
    // Every scalar as the string it was written as: "12000", "yes", "0012".
    data = parse(text, { schema: "failsafe", uniqueKeys: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : "";
    return {
      ok: false,
      problems: [
        `The list couldn't be read as YAML or JSON: ${message ?? ""}. Write one item per topic, such as "- Topic: Tiamat".`,
      ],
    };
  }
  if (!Array.isArray(data))
    return {
      ok: false,
      problems: [
        'The list must be a list of topics: start each one with "- " in YAML, or wrap them in [ ] in JSON.',
      ],
    };
  const problems: string[] = [];
  const rows: TopicRow[] = [];
  data.forEach((item: unknown, index) => {
    const name = `Topic ${String(index + 1)}`;
    if (typeof item === "string") {
      rows.push({ title: item.trim(), values: {} });
      return;
    }
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      problems.push(
        `${name} is not a topic or a set of keywords. Write it as "- Tiamat" or "- Topic: Tiamat".`,
      );
      return;
    }
    let title = "";
    const values: Record<string, string> = {};
    for (const [written, value] of Object.entries(item)) {
      const keyword = written.trim();
      // "Topic:" with nothing after it reads as no value.
      const raw: unknown = value ?? "";
      if (typeof raw !== "string") {
        problems.push(
          `${name}: ${quote(keyword)} holds a list or a map. Give it one value, such as "${keyword}: 12000".`,
        );
        continue;
      }
      if (options.topicKeyword !== null && keyword === options.topicKeyword) title = raw.trim();
      else if (!options.keywords.includes(keyword))
        problems.push(
          `${name}: ${quote(keyword)} is not a keyword of this template (its keywords are ${listed(options.keywords)}). Rename it to one of them or remove it.`,
        );
      else values[keyword] = raw.trim();
    }
    rows.push({ title, values });
  });
  // Unknown keys were left out of the rows above, so these name the other problems once.
  const all = [...problems, ...topicRowProblems(rows, options)];
  return all.length > 0 ? { ok: false, problems: all } : { ok: true, rows };
}

// The queue as YAML: a plain "- title" when a topic sets nothing else, else a map with the
// topic keyword first. Reading it back with parseTopicList gives the same rows.
export function formatTopicList(rows: readonly TopicRow[], topicKeyword: string | null): string {
  if (rows.length === 0) return "";
  const items = rows.map((row) =>
    Object.keys(row.values).length === 0 || topicKeyword === null
      ? row.title
      : { [topicKeyword]: row.title, ...row.values },
  );
  return stringify(items, { lineWidth: 0 });
}
