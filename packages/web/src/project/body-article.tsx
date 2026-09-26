import type { Stage } from "@app/slices/admission/model.js";
import { sourceEntries } from "@app/slices/article/source-lines.js";
import { splitEndMatter } from "@app/slices/article/split.js";
import { useQuery } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { TabPanel, Tabs } from "@/components/kit/tabs";
import { Button } from "@/components/ui/button";
import { keys } from "@/queries";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { ResearchNotes } from "./body-research.js";
import { ConfirmedButton } from "./controls.js";
import { useProjectRevision } from "./live-revision.js";
import { LiveWriting, type WritingPreview, writingKey } from "./live-writing.js";
import {
  ActionRow,
  InlineProse,
  Instructions,
  OutputDownload,
  Prose,
  StageBody,
  splitTitle,
  useOutputText,
} from "./parts.js";
import { shownStage } from "./sections.js";

// A stage that has not started, or is not part of the run, has nothing to re-run yet.
const ran = (stage: Stage): boolean => stage.state !== "pending" && stage.state !== "skipped";

type Part = "article" | "research" | "sources" | "pronunciation";

// A section's text without its own heading line, which the tab already names.
function withoutHeading(section: string): string {
  return section.replace(/^\s*[^\n]*\n?/u, "").trim();
}

export function ArticleBody({ stage, companion, project, outputs, actions, busy }: BodyProps) {
  const revisionId = useProjectRevision(project.id);
  const mine = outputsOf(outputs, stage);
  const research = companion?.kind === "research" ? companion : undefined;
  const researched = research === undefined ? [] : outputsOf(outputs, research);
  const notes = roleOf(researched, "notes");
  const notesText = useOutputText(notes);
  const markdown = roleOf(mine, "article_md") ?? roleOf(mine, "article_txt");
  const sources = roleOf(mine, "sources");
  const glossary = roleOf(mine, "glossary");

  const stored = useOutputText(markdown);
  const previews = useQuery({
    queryKey: writingKey(project.id, revisionId),
    queryFn: (): readonly WritingPreview[] => [],
    enabled: false,
  });
  const hasLivePreview = previews.data?.some((one) => one.stage === "article") === true;
  // The article arrives token by token while the stage runs and is only ever patched into
  // the cache, never fetched: this query exists to read and subscribe to it.
  const streaming = useQuery({
    queryKey: keys.article(project.id, revisionId),
    queryFn: (): string => "",
    enabled: false,
  });

  const text = stored.data ?? "";
  const running = stage.state === "running";
  const shown = running ? (streaming.data ?? "") : text;
  // The article's own heading becomes the body's title line, so it is not typeset twice.
  const split = splitTitle(shown);
  const title = split.title ?? project.title;
  // Research, the sources list and the pronunciation glossary get tabs of their own, and only
  // when the run has them; an article without any reads exactly as before, with no tab row.
  const parts = useMemo(
    () => (running ? { body: split.body, sources: "", glossary: "" } : splitEndMatter(split.body)),
    [running, split.body],
  );
  const entries = useMemo(() => sourceEntries(parts.sources), [parts.sources]);
  const table = withoutHeading(parts.glossary);
  const tabs = [
    { id: "article" as const, label: "Article" },
    ...(research === undefined ? [] : [{ id: "research" as const, label: "Research" }]),
    ...(entries.length > 0
      ? [{ id: "sources" as const, label: "Sources", badge: String(entries.length) }]
      : []),
    ...(table === "" ? [] : [{ id: "pronunciation" as const, label: "Pronunciation" }]),
  ];
  // Until the reader picks a tab, the one that needs them is open: Research while it runs or
  // after it stopped, since the article waits on it.
  const researchFirst =
    research !== undefined &&
    shownStage({ kind: "article", stage, companion: research }) === research;
  const [picked, setPicked] = useState<Part | undefined>();
  const wanted = picked ?? (researchFirst ? "research" : "article");
  const open = tabs.some((tab) => tab.id === wanted) ? wanted : "article";
  const idPrefix = useId().replace(/:/gu, "");
  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | undefined>();

  // Markdown, so it pastes cleanly into a document, a post or a description.
  const copyText: Record<Part, string> = {
    article: `${split.title === undefined ? "" : `# ${split.title}\n\n`}${parts.body.trim()}\n`,
    research: `${(notesText.data ?? "").trim()}\n`,
    sources: `${entries.map((entry) => `- ${entry}`).join("\n")}\n`,
    pronunciation: `${table}\n`,
  };
  const names: Record<Part, string> = {
    article: "article",
    research: "research notes",
    sources: "sources",
    pronunciation: "pronunciation table",
  };
  const copy = (part: Part) => {
    const what = names[part];
    if (!navigator.clipboard) {
      setStatus({ text: `Couldn't copy the ${what}. Select the text and copy it.`, tone: "error" });
      return;
    }
    void navigator.clipboard.writeText(copyText[part]).then(
      () => setStatus({ text: `Copied the ${what} as Markdown.`, tone: "success" }),
      () =>
        setStatus({
          text: `Couldn't copy the ${what}. Select the text and copy it.`,
          tone: "error",
        }),
    );
  };

  return (
    <StageBody>
      <div className="flex flex-wrap items-baseline gap-[14px] text-small text-ink2">
        <span className="text-row font-semibold text-ink">
          <InlineProse markdown={title} />
        </span>
        {sources === undefined ? null : <OutputDownload output={sources} label="Sources" />}
        {glossary === undefined ? null : <OutputDownload output={glossary} label="Glossary" />}
      </div>

      <p className="text-small text-ink2">
        Use Edit project to save changes, then Resume to recover affected work. Advanced rebuild
        review is optional.
      </p>
      {/* The row acts on the open tab: the research's own Re-run, instructions and notes
          while Research is open, the article's otherwise. */}
      <ActionRow>
        {open === "research" && research !== undefined ? (
          <>
            <ConfirmedButton
              action={{ kind: "rerun", stage: research.kind }}
              run={() => actions.run({ kind: "rerun", stage: research.kind })}
              disabled={busy || !ran(research)}
              pending={actions.pending}
            >
              Re-run research
            </ConfirmedButton>
            <Instructions output={roleOf(researched, "instructions")} />
            {notes === undefined ? null : <OutputDownload output={notes} />}
          </>
        ) : (
          <>
            <ConfirmedButton
              action={{ kind: "rerun", stage: stage.kind }}
              run={() => actions.run({ kind: "rerun", stage: stage.kind })}
              disabled={busy || !ran(stage)}
              pending={actions.pending}
            >
              Re-run
            </ConfirmedButton>
            <Instructions output={roleOf(mine, "instructions")} />
            {markdown === undefined ? null : <OutputDownload output={markdown} />}
          </>
        )}
        {(
          open === "research"
            ? research?.state === "running" || notesText.data === undefined
            : running || text === ""
        ) ? null : (
          <Button type="button" onClick={() => copy(open)}>
            Copy {names[open]}
          </Button>
        )}
      </ActionRow>
      <StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>

      {stored.error === null ? null : <p className="text-body text-red">{stored.error.message}</p>}

      {tabs.length > 1 ? (
        <Tabs
          items={tabs}
          value={open}
          onChange={(next) => {
            setPicked(next);
            setStatus(undefined);
          }}
          label="Article parts"
          idPrefix={idPrefix}
        />
      ) : null}

      <TabPanel idPrefix={idPrefix} id="article" active={open === "article"}>
        <section
          aria-label="Article content"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll this reading region.
          tabIndex={0}
          className="max-h-[min(58vh,640px)] min-h-48 overflow-auto pr-3"
        >
          {running && hasLivePreview ? (
            <LiveWriting projectId={project.id} stage="article" className="" />
          ) : !running && text === "" && !ran(stage) ? (
            <p className="text-small text-ink2">
              {research === undefined
                ? "The article will be written when its inputs are ready."
                : "The article is written once the research has finished."}
            </p>
          ) : (
            <Prose markdown={parts.body} />
          )}
        </section>
      </TabPanel>
      {research === undefined ? null : (
        <TabPanel idPrefix={idPrefix} id="research" active={open === "research"}>
          <ResearchNotes projectId={project.id} stage={research} notes={notes} />
        </TabPanel>
      )}
      {entries.length === 0 ? null : (
        <TabPanel idPrefix={idPrefix} id="sources" active={open === "sources"}>
          <ol className="max-h-[min(58vh,640px)] list-decimal space-y-2 overflow-auto pr-3 pl-6 text-body text-ink marker:text-ink3">
            {entries.map((entry, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the list is read-only and keeps its order
              <li key={index} className="break-words">
                <InlineProse markdown={entry} />
              </li>
            ))}
          </ol>
        </TabPanel>
      )}
      {table === "" ? null : (
        <TabPanel idPrefix={idPrefix} id="pronunciation" active={open === "pronunciation"}>
          <div className="max-h-[min(58vh,640px)] overflow-auto pr-3">
            <Prose markdown={table} />
          </div>
        </TabPanel>
      )}
    </StageBody>
  );
}
