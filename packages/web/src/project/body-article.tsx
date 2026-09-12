import { useQuery } from "@tanstack/react-query";
import { keys } from "@/queries";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
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

export function ArticleBody({ stage, project, outputs, actions, busy }: BodyProps) {
  const revisionId = useProjectRevision(project.id);
  const mine = outputsOf(outputs, stage);
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
  const shown = stage.state === "running" ? (streaming.data ?? "") : text;
  // The article's own heading becomes the body's title line, so it is not typeset twice.
  const split = splitTitle(shown);
  const title = split.title ?? project.title;

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
        Use Edit project to save changes, then review affected outputs before rebuilding.
      </p>
      <ActionRow>
        <ConfirmedButton
          action={{ kind: "rerun", stage: stage.kind }}
          run={() => actions.run({ kind: "rerun", stage: stage.kind })}
          disabled={busy}
          pending={actions.pending}
        >
          Re-run
        </ConfirmedButton>
        <Instructions output={roleOf(mine, "instructions")} />
        {markdown === undefined ? null : <OutputDownload output={markdown} />}
      </ActionRow>

      {stored.error === null ? null : <p className="text-body text-red">{stored.error.message}</p>}

      <section
        aria-label="Article content"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll this reading region.
        tabIndex={0}
        className="max-h-[min(58vh,640px)] min-h-48 overflow-auto pr-3"
      >
        {stage.state === "running" && hasLivePreview ? (
          <LiveWriting projectId={project.id} stage="article" />
        ) : (
          <Prose markdown={split.body} />
        )}
      </section>
    </StageBody>
  );
}
