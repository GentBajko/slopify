import { queueMax } from "@app/slices/schedules/schema.js";
import {
  formatTopicList,
  renderedTitle,
  rowsFromLines,
  type TopicRow,
} from "@app/slices/schedules/topic-list.js";
import { CopyIcon, DownloadIcon, UploadIcon } from "lucide-react";
import { type ReactElement, useRef, useState } from "react";
import { KeywordList, keywordFeeds } from "@/components/keyword-list";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Field, Select, Textarea } from "@/components/kit/field";
import { InfoTip } from "@/components/kit/info-tip";
import { Segmented } from "@/components/kit/switch";
import { limitCount } from "@/lib/limit-count";
import {
  importedRows,
  modeLabels,
  type QueueContext,
  queueResult,
  switchMode,
  type TopicMode,
  type TopicQueue,
  withRows,
} from "./topic-queue-state";
import { TopicTable } from "./topic-table";

// A schedule's topic queue, written three ways (topic-queue-state.ts): one per line, a table,
// or a YAML / JSON list.
export {
  initialQueue,
  type QueueContext,
  queueResult,
  type TopicMode,
  type TopicQueue,
} from "./topic-queue-state";

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
  const feedsOf = (name: string): readonly string[] => context.origins?.get(name) ?? [];
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
  const importInput = useRef<HTMLInputElement>(null);
  const importFile = async (file: File) => {
    const read = importedRows(file.name, await file.text(), context);
    if (!read.ok) {
      setExported(
        `${file.name} wasn't imported: ${read.problems.slice(0, 3).join(" ")} Fix the file and import it again, or paste its text under YAML / JSON to see every problem.`,
      );
      return;
    }
    if (read.rows.length === 0) {
      setExported(
        `${file.name} has no topics in it. Put one topic per line, or a YAML / JSON list.`,
      );
      return;
    }
    onQueue(withRows(queue, [...queueResult(queue, context).rows, ...read.rows], keyword));
    setExported(
      `Imported ${String(read.rows.length)} ${read.rows.length === 1 ? "topic" : "topics"} from ${file.name}, after the ones already here.`,
    );
  };
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
        <Button variant="quiet" size="small" onClick={() => importInput.current?.click()}>
          <UploadIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Import
        </Button>
        <input
          ref={importInput}
          type="file"
          hidden
          accept=".yaml,.yml,.json,.txt,text/plain,application/json,application/yaml"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file !== undefined) void importFile(file);
          }}
        />
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
            // Grows with the list up to 16 lines, then scrolls.
            rows={Math.min(16, Math.max(6, rows.length + 1))}
            value={queue.lines}
            onChange={(event) =>
              onQueue({
                ...queue,
                lines: event.target.value,
                rows: rowsFromLines(event.target.value, queue.base),
              })
            }
            placeholder={"Pyramids\nSphinxes\nObelisks"}
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
            placeholder={`- ${keyword ?? "Topic"}: Cleopatra\n  ${keywords.find((name) => name !== keyword) ?? "Min. Word Count"}: 12000\n- Hypatia`}
          />
        </Field>
      ) : (
        <TopicTable
          queue={queue}
          onQueue={onQueue}
          keyword={keyword}
          addable={addable}
          titleOf={titleOf}
        />
      )}
      {result.rows.length === 0 ? null : (
        <p className="m-0 text-small text-ink-2" aria-live="polite">
          {`${limitCount(result.rows.length, queueMax, "topics")}.`}
        </p>
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
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 min-[700px]:grid-cols-2">
            <Field
              label="Each topic fills"
              id="schedule-topic-keyword"
              tip="planning.schedule.topic-keyword"
              {...(keyword === null ? {} : { help: keywordFeeds({ feeds: feedsOf(keyword) }) })}
            >
              <Select value={keyword ?? ""} onChange={(event) => onKeyword(event.target.value)}>
                {keywords.map((name) => (
                  <option key={name} value={name}>
                    {`{{${name}}}`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {/* The every-run values: the same keyword list as Play, each with what it feeds. */}
          <KeywordList
            keywords={keywords
              .filter((name) => name !== keyword)
              .map((name) => ({
                name,
                value: everyRun[name] ?? "",
                feeds: feedsOf(name),
                ...(queue.columns.includes(name) ? { note: "Unless a topic sets its own." } : {}),
              }))}
            onChange={onValue}
            fieldPrefix="everyRun"
            label={(name) => `${name} (every run)`}
            inputLabel={(name) => `${name} for every run`}
            tip="planning.schedule.every-run"
            maxLength={10000}
          />
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
