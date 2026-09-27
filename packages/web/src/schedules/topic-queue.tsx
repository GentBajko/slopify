import {
  formatTopicList,
  linesFromRows,
  parseTopicList,
  renderedTitle,
  rowsFromLines,
  type TopicRow,
  topicRowProblems,
  topicValueMax,
} from "@app/slices/schedules/topic-list.js";
import { CopyIcon, DownloadIcon, PlusIcon, XIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { Button, IconButton } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Field, Input, Select, Textarea } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Segmented } from "@/components/kit/switch";

// A schedule's topic queue, written three ways that convert into each other without losing
// anything: one topic per line (it fills the topic keyword), a table with a column for each
// keyword a topic sets itself, or a YAML / JSON list. Every other keyword keeps its every-run
// value, which a topic's own value overrides for that one run.

export type TopicMode = "lines" | "table" | "yaml";

const modeLabels: Readonly<Record<TopicMode, string>> = {
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

function columnsOf(rows: readonly TopicRow[], columns: readonly string[]): readonly string[] {
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
function switchMode(
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

export function TopicFields({
  queue,
  onQueue,
  context,
  onKeyword,
  onValue,
  loading,
  exportName,
}: {
  readonly queue: TopicQueue;
  readonly onQueue: (next: TopicQueue) => void;
  readonly context: QueueContext;
  readonly onKeyword: (name: string) => void;
  readonly onValue: (name: string, value: string) => void;
  readonly loading: boolean;
  // The schedule's name, for the exported file.
  readonly exportName: string;
}): ReactElement {
  const [switchProblems, setSwitchProblems] = useState<readonly string[]>([]);
  const [exported, setExported] = useState<string | null>(null);
  const { keywords, topicKeyword: keyword, form, everyRun } = context;
  const result = queueResult(queue, context);
  const rows = queue.mode === "yaml" ? result.rows : queue.rows;
  const titleOf = (row: TopicRow): string | undefined =>
    form === undefined
      ? undefined
      : renderedTitle(form, { topicKeyword: keyword, values: everyRun }, row);
  const next = rows[0];
  const preview = next === undefined ? undefined : titleOf(next);
  const titleUsesTopic = keyword !== null && form?.title.includes(`{{${keyword}}}`) === true;
  const yamlText = () => formatTopicList(queueResult(queue, context).rows, keyword);
  const copyYaml = () => {
    const text = yamlText();
    if (!navigator.clipboard) {
      setExported("Couldn't copy the list. Switch to YAML / JSON, select the text and copy it.");
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => setExported(`Copied ${String(rows.length)} topics as YAML.`),
      () =>
        setExported("Couldn't copy the list. Switch to YAML / JSON, select the text and copy it."),
    );
  };
  const downloadYaml = () => {
    const url = URL.createObjectURL(new Blob([yamlText()], { type: "application/yaml" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(exportName.trim() || "schedule").replace(/[^\w.-]+/g, "-")}-topics.yaml`;
    link.click();
    URL.revokeObjectURL(url);
    setExported(`Downloaded ${String(rows.length)} topics as YAML.`);
  };
  const setRow = (index: number, row: TopicRow) =>
    onQueue({ ...queue, rows: queue.rows.map((one, at) => (at === index ? row : one)) });
  const addable = keywords.filter((name) => name !== keyword && !queue.columns.includes(name));
  const problems = [...switchProblems, ...result.problems];
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 border-t border-line p-0 pt-5 min-[700px]:col-span-2">
      <legend className="float-left mb-1 flex w-full items-center gap-1 text-title-3 font-semibold">
        Topics (optional)
        <InfoTip id="planning.schedule.topics" />
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="How to write the topics"
          tip="planning.schedule.topic-format"
          value={queue.mode}
          options={(Object.keys(modeLabels) as TopicMode[]).map((mode) => ({
            value: mode,
            label: modeLabels[mode],
          }))}
          onChange={(mode) => {
            const switched = switchMode(queue, mode, context);
            setSwitchProblems(switched.problems);
            onQueue(switched.queue);
          }}
        />
        <Button
          variant="quiet"
          size="small"
          disabled={rows.length === 0 || result.problems.length > 0}
          disabledReason="Add topics, and fix the problems below, first"
          onClick={copyYaml}
        >
          <CopyIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Copy as YAML
        </Button>
        <Button
          variant="quiet"
          size="small"
          disabled={rows.length === 0 || result.problems.length > 0}
          disabledReason="Add topics, and fix the problems below, first"
          onClick={downloadYaml}
        >
          <DownloadIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Export as YAML
        </Button>
        {exported === null ? null : (
          <span role="status" className="text-small text-ink-2">
            {exported}
          </span>
        )}
      </div>
      {queue.mode === "lines" ? (
        <Field
          id="schedule-topics"
          tip="planning.schedule.topic-lines"
          tipLabel="Topics, one per line"
          label={
            rows.length === 0
              ? "One per line"
              : `${String(rows.length)} ${rows.length === 1 ? "topic" : "topics"} · next: ${next?.title ?? ""}`
          }
        >
          <Textarea
            rows={6}
            value={queue.lines}
            onChange={(event) =>
              onQueue({
                ...queue,
                lines: event.target.value,
                rows: rowsFromLines(event.target.value, queue.base),
              })
            }
            placeholder={"Owlbears\nGelatinous Cubes\nMimics"}
          />
        </Field>
      ) : queue.mode === "yaml" ? (
        <Field
          id="schedule-topics-yaml"
          label="Topics as YAML or JSON"
          tip="planning.schedule.topic-yaml"
        >
          <Textarea
            rows={10}
            className="font-mono"
            spellCheck={false}
            value={queue.yaml}
            onChange={(event) => onQueue({ ...queue, yaml: event.target.value })}
            placeholder={`- ${keyword ?? "Topic"}: Tiamat\n  ${keywords.find((name) => name !== keyword) ?? "Min. Word Count"}: 12000\n- Vecna`}
          />
        </Field>
      ) : (
        <TopicTable
          queue={queue}
          onQueue={onQueue}
          keyword={keyword}
          addable={addable}
          setRow={setRow}
          titleOf={titleOf}
        />
      )}
      {problems.length === 0 ? null : (
        <Callout tone="danger" title="These topics can't be saved yet.">
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {problems.slice(0, 8).map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
            {problems.length > 8 ? <li>{`And ${String(problems.length - 8)} more.`}</li> : null}
          </ul>
        </Callout>
      )}
      {queue.mode === "yaml" && result.rows.length > 0 ? (
        <section aria-label="Project titles">
          <p className="m-0 mb-1 text-small text-ink-2">Project titles, in order:</p>
          <ol className="m-0 flex flex-col gap-1 pl-5 text-small">
            {result.rows.slice(0, 20).map((row, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the same title can be queued twice.
              <li key={index}>{titleOf(row)}</li>
            ))}
            {result.rows.length > 20 ? (
              <li className="list-none text-ink-3">{`And ${String(result.rows.length - 20)} more.`}</li>
            ) : null}
          </ol>
        </section>
      ) : null}
      {loading ? (
        <p className="m-0 text-small text-ink-3">Reading the template's keywords…</p>
      ) : keywords.length === 0 ? (
        <p className="m-0 text-small text-ink-3">
          This template has no keywords such as {"{{Topic}}"}, so each topic becomes the project's
          title.
        </p>
      ) : (
        <div className="grid gap-4 min-[700px]:grid-cols-2">
          <Field
            label="Each topic fills"
            id="schedule-topic-keyword"
            tip="planning.schedule.topic-keyword"
          >
            <Select value={keyword ?? ""} onChange={(event) => onKeyword(event.target.value)}>
              {keywords.map((name) => (
                <option key={name} value={name}>
                  {`{{${name}}}`}
                </option>
              ))}
            </Select>
          </Field>
          {keywords
            .filter((name) => name !== keyword)
            .map((name) => (
              <Field
                key={name}
                label={`${name} (every run)`}
                tip="planning.schedule.every-run"
                {...(queue.columns.includes(name) ? { help: "Unless a topic sets its own." } : {})}
              >
                <Input
                  maxLength={10000}
                  aria-label={`${name} for every run`}
                  value={everyRun[name] ?? ""}
                  onChange={(event) => onValue(name, event.target.value)}
                />
              </Field>
            ))}
        </div>
      )}
      {queue.mode === "lines" && preview !== undefined && next !== undefined ? (
        <p className="m-0 text-small text-ink-2">
          Next project: <span className="font-semibold text-ink">{preview}</span>
          {keyword === null || titleUsesTopic ? null : (
            <span className="block text-ink-3">
              The template's project title does not use {`{{${keyword}}}`}, so every project gets
              this title. Edit the template's title to include it.
            </span>
          )}
        </p>
      ) : null}
    </fieldset>
  );
}

// A row per topic, a column per keyword it sets itself, and the project title it makes.
function TopicTable({
  queue,
  onQueue,
  keyword,
  addable,
  setRow,
  titleOf,
}: {
  readonly queue: TopicQueue;
  readonly onQueue: (next: TopicQueue) => void;
  readonly keyword: string | null;
  readonly addable: readonly string[];
  readonly setRow: (index: number, row: TopicRow) => void;
  readonly titleOf: (row: TopicRow) => string | undefined;
}): ReactElement {
  const topicName = keyword === null ? "Title" : `{{${keyword}}}`;
  return (
    <div className="flex flex-col gap-3" {...helpScope}>
      <div className="overflow-x-auto">
        <table className="sl-table" aria-label="Topics">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">
                <span className="inline-flex items-center gap-1">
                  {topicName}
                  <InfoTip id="planning.schedule.topic-table" className="-my-1" />
                </span>
              </th>
              {queue.columns.map((column) => (
                <th key={column} scope="col">
                  <span className="inline-flex items-center gap-1">
                    {`{{${column}}}`}
                    <IconButton
                      label={`Use the every-run ${column} for all topics`}
                      size="small"
                      onClick={() =>
                        onQueue({
                          ...queue,
                          columns: queue.columns.filter((one) => one !== column),
                          rows: queue.rows.map((row) => ({
                            title: row.title,
                            values: Object.fromEntries(
                              Object.entries(row.values).filter(([name]) => name !== column),
                            ),
                          })),
                        })
                      }
                    >
                      <XIcon aria-hidden="true" strokeWidth={1.75} />
                    </IconButton>
                  </span>
                </th>
              ))}
              <th scope="col">Project title</th>
              <th scope="col">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {queue.rows.map((row, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity but their place.
              <tr key={index}>
                <td className="num">{index + 1}</td>
                <td>
                  <Input
                    aria-label={`Topic ${String(index + 1)} ${topicName}`}
                    maxLength={200}
                    value={row.title}
                    onChange={(event) => setRow(index, { ...row, title: event.target.value })}
                  />
                </td>
                {queue.columns.map((column) => (
                  <td key={column}>
                    <Input
                      aria-label={`Topic ${String(index + 1)} ${column}`}
                      maxLength={topicValueMax}
                      placeholder="Every-run value"
                      value={row.values[column] ?? ""}
                      onChange={(event) =>
                        setRow(index, {
                          ...row,
                          values: { ...row.values, [column]: event.target.value },
                        })
                      }
                    />
                  </td>
                ))}
                <td className="min-w-[180px] text-small text-ink-2">{titleOf(row) ?? "—"}</td>
                <td>
                  <IconButton
                    label={`Remove topic ${String(index + 1)}`}
                    size="small"
                    onClick={() =>
                      onQueue({ ...queue, rows: queue.rows.filter((_, at) => at !== index) })
                    }
                  >
                    <XIcon aria-hidden="true" strokeWidth={1.75} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="small"
          onClick={() => onQueue({ ...queue, rows: [...queue.rows, { title: "", values: {} }] })}
        >
          <PlusIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Add topic
        </Button>
        {addable.length === 0 ? null : (
          <Select
            aria-label="Set a keyword per topic"
            value=""
            className="w-auto"
            onChange={(event) => {
              const name = event.target.value;
              if (name !== "") onQueue({ ...queue, columns: [...queue.columns, name] });
            }}
          >
            <option value="">Set a keyword per topic…</option>
            {addable.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        )}
      </div>
    </div>
  );
}
