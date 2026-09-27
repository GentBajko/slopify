import type { Stage } from "@app/slices/admission/model.js";
import { sourceEntries } from "@app/slices/article/source-lines.js";
import { splitEndMatter } from "@app/slices/article/split.js";
import { parsePronunciationGlossary } from "@app/slices/narration/pronunciation.js";
import { usesVoices } from "@app/slices/voices/model.js";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useId, useMemo, useState } from "react";
import { StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { ReadingView } from "@/components/kit/reading-view";
import { TabPanel, Tabs } from "@/components/kit/tabs";
import { keys } from "@/queries";
import { ScriptView } from "@/voices/script-view";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { ResearchNotes } from "./body-research.js";
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
import { ReviewVerdict, reviewFor, useReviews } from "./review-verdict.js";
import { shownStage } from "./sections.js";

// A stage that has not started, or is not part of the run, has nothing to re-run yet.
const ran = (stage: Stage): boolean => stage.state !== "pending" && stage.state !== "skipped";

type Part = "article" | "script" | "research" | "sources" | "pronunciation";

// A section's text without its own heading line, which the tab already names.
function withoutHeading(section: string): string {
  return section.replace(/^\s*[^\n]*\n?/u, "").trim();
}

export function ArticleBody({ stage, companion, project, outputs, busy }: BodyProps) {
  const reviews = useReviews(project.id);
  const revisionId = useProjectRevision(project.id);
  const mine = outputsOf(outputs, stage);
  const research = companion?.kind === "research" ? companion : undefined;
  const researched = research === undefined ? [] : outputsOf(outputs, research);
  const notes = roleOf(researched, "notes");
  const notesText = useOutputText(notes);
  const markdown = roleOf(mine, "article_md") ?? roleOf(mine, "article_txt");
  const sources = roleOf(mine, "sources");
  const glossary = roleOf(mine, "glossary");
  // A multi-voice run's script: the article itself, or the speaker split made from it.
  const voices = usesVoices(project.config) ? project.config.voices : undefined;
  const speakerSplit = roleOf(mine, "script_md");
  const speakerSplitText = useOutputText(speakerSplit);

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
  // The rows narration leaves out, numbered as the narration counts them, never quoted.
  const skipped = useMemo(() => {
    if (parts.glossary.trim() === "") return [];
    const parsed = parsePronunciationGlossary(parts.glossary);
    return parsed.ok ? (parsed.skipped ?? []) : [];
  }, [parts.glossary]);
  const script =
    voices === undefined || running
      ? ""
      : voices.source === "script"
        ? splitEndMatter(text).body
        : (speakerSplitText.data ?? "");
  const tabs = [
    { id: "article" as const, label: voices?.source === "script" ? "Script text" : "Article" },
    ...(script.trim() === "" ? [] : [{ id: "script" as const, label: "Speakers" }]),
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
    script: `${script.trim()}\n`,
    research: `${(notesText.data ?? "").trim()}\n`,
    sources: `${entries.map((entry) => `- ${entry}`).join("\n")}\n`,
    pronunciation: `${table}\n`,
  };
  const names: Record<Part, string> = {
    article: "article",
    script: "script",
    research: "research notes",
    sources: "sources",
    pronunciation: "pronunciation table",
  };
  // One copy for the action row's Copy and the reading view's Copy section and Copy all.
  const copyMarkdown = useCallback((text: string, what: string) => {
    if (!navigator.clipboard) {
      setStatus({ text: `Couldn't copy the ${what}. Select the text and copy it.`, tone: "error" });
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => setStatus({ text: `Copied the ${what} as Markdown.`, tone: "success" }),
      () =>
        setStatus({
          text: `Couldn't copy the ${what}. Select the text and copy it.`,
          tone: "error",
        }),
    );
  }, []);
  const copy = (part: Part) => copyMarkdown(copyText[part], names[part]);

  return (
    <StageBody>
      <ReviewVerdict
        review={reviewFor(reviews, { itemKey: "article:body" })}
        projectId={project.id}
        busy={busy}
      />
      <div className="flex flex-wrap items-baseline gap-3 text-small text-ink-2">
        <span className="text-title-3 font-semibold text-ink">
          <InlineProse markdown={title} />
        </span>
        {sources === undefined ? null : <OutputDownload output={sources} label="Sources" />}
        {glossary === undefined ? null : <OutputDownload output={glossary} label="Glossary" />}
      </div>

      {/* The row acts on the open tab: the research's instructions and notes while Research
          is open, the article's otherwise. Writing either again is in the section's More. */}
      <ActionRow>
        {open === "research" && research !== undefined ? (
          <>
            <Instructions output={roleOf(researched, "instructions")} />
            {notes === undefined ? null : <OutputDownload output={notes} />}
          </>
        ) : (
          <>
            <Instructions output={roleOf(mine, "instructions")} />
            {markdown === undefined ? null : <OutputDownload output={markdown} />}
          </>
        )}
        {(
          open === "research"
            ? research?.state === "running" || notesText.data === undefined
            : running || text === ""
        ) ? null : (
          <Button variant="quiet" size="small" onClick={() => copy(open)}>
            Copy {names[open]}
          </Button>
        )}
      </ActionRow>
      <StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>

      {stored.error === null ? null : (
        <p className="m-0 text-body text-danger">{stored.error.message}</p>
      )}

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
        {running ? (
          // While it is written the text grows token by token; the reading tools wait for it.
          <section
            aria-label="Article content"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll this reading region.
            tabIndex={0}
            className="max-h-[min(58vh,640px)] min-h-48 overflow-auto pr-3"
          >
            {hasLivePreview ? (
              <LiveWriting projectId={project.id} stage="article" className="" />
            ) : (
              <Prose markdown={parts.body} />
            )}
          </section>
        ) : (
          <ReadingView
            markdown={parts.body}
            label="Article"
            regionLabel="Article content"
            anchorPrefix="article-"
            what="article"
            onCopy={copyMarkdown}
            copyAll={false}
          >
            {ran(stage) && markdown !== undefined && stored.data === undefined ? (
              <span className="block h-4 w-[40ch] max-w-full rounded-control bg-sunken" />
            ) : (
              <p className="m-0 text-small text-ink-2">
                {!ran(stage)
                  ? research === undefined
                    ? "The article will be written when its inputs are ready."
                    : "The article is written once the research has finished."
                  : "No article was saved."}
              </p>
            )}
          </ReadingView>
        )}
      </TabPanel>
      {voices === undefined || script.trim() === "" ? null : (
        <TabPanel idPrefix={idPrefix} id="script" active={open === "script"}>
          <section
            aria-label="Script by speaker"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll this reading region.
            tabIndex={0}
            className="max-h-[min(58vh,640px)] min-h-48 overflow-auto pr-3"
          >
            <ScriptView script={script} voices={voices} />
          </section>
        </TabPanel>
      )}
      {research === undefined ? null : (
        <TabPanel idPrefix={idPrefix} id="research" active={open === "research"}>
          <ResearchNotes
            projectId={project.id}
            stage={research}
            notes={notes}
            onCopy={copyMarkdown}
          />
        </TabPanel>
      )}
      {entries.length === 0 ? null : (
        <TabPanel idPrefix={idPrefix} id="sources" active={open === "sources"}>
          <ReadingView
            markdown={entries.map((entry, index) => `${String(index + 1)}. ${entry}`).join("\n")}
            label="Sources"
            regionLabel="Sources"
            anchorPrefix="sources-"
            what="sources"
            onCopy={copyMarkdown}
            copyAll={false}
          />
        </TabPanel>
      )}
      {table === "" ? null : (
        <TabPanel idPrefix={idPrefix} id="pronunciation" active={open === "pronunciation"}>
          {skipped.length === 0 ? null : (
            <Callout
              className="mb-3"
              title={`${skipped.length === 1 ? "1 entry is" : `${skipped.length} entries are`} skipped by the narration and read as ordinary text`}
            >
              <ul className="m-0 flex flex-col gap-1 pl-5">
                {skipped.map((row) => (
                  <li key={row.row}>
                    Entry {row.row}: {row.reason}.
                  </li>
                ))}
              </ul>
              <p className="m-0 mt-1">
                The other entries are used. To fix these, edit the Pronunciation Glossary at the end
                of the article in Edit settings → Article.
              </p>
            </Callout>
          )}
          <div className="max-h-[min(58vh,640px)] overflow-auto pr-3">
            <Prose markdown={table} />
          </div>
        </TabPanel>
      )}
    </StageBody>
  );
}
