import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { keys } from "@/queries";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { confirmationFor } from "./confirmations.js";
import { ConfirmedButton } from "./controls.js";
import { splitTitle } from "./markdown.js";
import {
  ActionRow,
  Instructions,
  OutputDownload,
  ProseBlocks,
  StageBody,
  useOutputText,
} from "./parts.js";

// "Article: the markdown rendered in a 75 ch measure; Edit (inline editor with Save &
// re-run from audio, Discard); Download; links to the sources and glossary files beside
// the title; 'Show instructions'" (uiux/screens/08-project.md).
export function ArticleBody({ stage, project, outputs, actions, busy }: BodyProps) {
  const mine = outputsOf(outputs, stage);
  const markdown = roleOf(mine, "article_md");
  const sources = roleOf(mine, "sources");
  const glossary = roleOf(mine, "glossary");

  const stored = useOutputText(markdown);
  // The article arrives token by token while the stage runs and is only ever patched into
  // the cache, never fetched: this query exists to read and subscribe to it.
  const streaming = useQuery({
    queryKey: keys.article(project.id),
    queryFn: (): string => "",
    enabled: false,
  });

  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [discarding, setDiscarding] = useState(false);
  const text = stored.data ?? "";
  const shown = stage.state === "running" ? (streaming.data ?? "") : text;
  // The article's own heading becomes the body's title line, so it is not typeset twice.
  const split = splitTitle(shown);
  const title = split.title ?? project.title;
  const discard = confirmationFor({ kind: "discard-article" });

  return (
    <StageBody>
      <div className="flex flex-wrap items-baseline gap-[14px] text-small text-ink2">
        <span className="text-row font-semibold text-ink">{title}</span>
        {sources === undefined ? null : <OutputDownload output={sources} label="Sources" />}
        {glossary === undefined ? null : <OutputDownload output={glossary} label="Glossary" />}
      </div>

      {stored.error === null ? null : <p className="text-body text-red">{stored.error.message}</p>}

      {draft === undefined ? (
        <ProseBlocks blocks={split.body} />
      ) : (
        <>
          <label htmlFor="article-editor" className="engraved text-ink3">
            Article
          </label>
          <textarea
            id="article-editor"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            className="h-[420px] w-full max-w-[75ch] resize-y rounded-control border border-line2 bg-panel2 p-[10px] font-sans text-body text-ink"
          />
        </>
      )}

      <ActionRow>
        {draft === undefined ? (
          <>
            <Button
              type="button"
              disabled={busy || markdown === undefined || stored.data === undefined}
              onClick={() => {
                setDraft(text);
              }}
            >
              Edit
            </Button>
            <ConfirmedButton
              action={{ kind: "rerun", stage: stage.kind }}
              run={() => {
                actions.run({ kind: "rerun", stage: stage.kind });
              }}
              disabled={busy}
              pending={actions.pending}
            >
              Re-run
            </ConfirmedButton>
            <Instructions output={roleOf(mine, "instructions")} />
            {markdown === undefined ? null : <OutputDownload output={markdown} />}
          </>
        ) : (
          <>
            <ConfirmedButton
              action={{ kind: "save-article", markdown: draft }}
              run={() => {
                // The editor closes only once the server has taken the text (§Q106).
                actions.run({ kind: "save-article", markdown: draft }, () => {
                  setDraft(undefined);
                });
              }}
              disabled={busy}
              pending={actions.pending}
            >
              Save &amp; re-run from audio
            </ConfirmedButton>
            <Button
              type="button"
              onClick={() => {
                setDiscarding(true);
              }}
            >
              Discard
            </Button>
          </>
        )}
      </ActionRow>

      <ConfirmDialog
        open={discarding}
        title={discard.title}
        consequence={discard.consequence}
        verb={discard.verb}
        dismiss={discard.dismiss}
        onConfirm={() => {
          setDiscarding(false);
          setDraft(undefined);
        }}
        onCancel={() => {
          setDiscarding(false);
        }}
      />
    </StageBody>
  );
}
