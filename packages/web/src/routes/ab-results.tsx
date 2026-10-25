import type { AbResult } from "@app/slices/studio/stats.js";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CopyIcon } from "lucide-react";
import type { ReactElement } from "react";
import { readAbResults } from "@/api";
import { useApp } from "@/app-context";
import { channelsQuery } from "@/channels/api";
import { Button } from "@/components/kit/button";
import { PageHeader } from "@/components/kit/layout";
import { LoadingBlock, QueryState } from "@/components/kit/query-state";
import { useToast } from "@/components/kit/toast";
import { EditorCrumb } from "@/library/editor-frame";

// What worked on YouTube (a channel's page links here): every finished title and thumbnail test
// the extension read from Studio, the winner first, with each variant's share of watch time. Copy as prompt
// notes turns them into a short summary to paste into the prompts that write titles and
// thumbnails; nothing changes a prompt by itself. With no finished test there is nothing to
// copy, so the button is not drawn.

type Result = AbResult & { readonly projectTitle: string };

function variantName(variant: AbResult["variants"][number], index: number): string {
  if (variant.title !== null) return variant.title;
  return variant.thumbnail === null
    ? `Variant ${String(index + 1)}`
    : `Thumbnail ${String.fromCharCode(64 + variant.thumbnail)}`;
}

function notesOf(results: readonly Result[]): string {
  const lines = results.flatMap((result) => {
    const sorted = [...result.variants].sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
    const [won, ...lost] = sorted;
    if (won === undefined) return [];
    return [
      `- ${result.projectTitle}: "${variantName(won, 0)}" won${won.share === null ? "" : ` (${String(won.share)}% of watch time)`} over ${lost.map((one, at) => `"${variantName(one, at + 1)}"${one.share === null ? "" : ` (${String(one.share)}%)`}`).join(", ")}.`,
    ];
  });
  return [
    "What won YouTube's A/B tests on this channel (share of watch time):",
    ...lines,
    "",
    "Write new titles and thumbnails closer to the winners than to the losers.",
  ].join("\n");
}

function ResultList({ results }: { readonly results: readonly Result[] }): ReactElement {
  return (
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {results.map((result) => {
        const sorted = [...result.variants].sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
        return (
          <li
            key={`${result.projectId}-${String(result.short ?? 0)}`}
            className="flex flex-col gap-1"
          >
            <div className="sl-row__title">{result.projectTitle}</div>
            <ol className="m-0 flex flex-col gap-1 pl-5 text-small">
              {sorted.map((variant, index) => (
                <li
                  key={variantName(variant, index)}
                  className={index === 0 ? "text-ink" : "text-ink-2"}
                >
                  {variantName(variant, index)}
                  {variant.share === null ? "" : ` · ${String(variant.share)}% of watch time`}
                  {index === 0 ? " · winner" : ""}
                </li>
              ))}
            </ol>
          </li>
        );
      })}
    </ul>
  );
}

export function AbResultsRoute(): ReactElement {
  const { api } = useApp();
  const notify = useToast();
  const results = useQuery({
    queryKey: ["studio", "ab-results"],
    queryFn: () => readAbResults(api),
  });
  const list = results.data ?? [];
  // The way back is the channel page this is opened from: Channels with several, and with one,
  // where Settings → Your channel goes (the rail lights Settings for it).
  const several = (useQuery(channelsQuery(api)).data?.length ?? 0) > 1;
  return (
    <div>
      <PageHeader
        crumb={
          <EditorCrumb>
            <Link to="/channels">{several ? "Channels" : "Your channel"}</Link>
          </EditorCrumb>
        }
        title="What worked on YouTube"
        meta="Which title or thumbnail won each test YouTube ran, the winner first"
        actions={
          list.length === 0 ? undefined : (
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                void navigator.clipboard?.writeText(notesOf(list)).then(
                  () =>
                    notify(
                      "Copied the notes. Paste them into the prompt that writes titles.",
                      "success",
                    ),
                  () => notify("Couldn't copy the notes. Select them and copy by hand.", "error"),
                )
              }
            >
              <CopyIcon aria-hidden="true" strokeWidth={1.75} />
              Copy as prompt notes
            </Button>
          )
        }
      />
      <p className="m-0 mb-3 max-w-[var(--measure)] text-small text-ink-2">
        The Slopify Studio extension reads these from YouTube Studio once a day.
      </p>
      <QueryState
        query={results}
        what="The test results"
        loading={<LoadingBlock label="Loading the test results…" rows={3} rowClassName="h-14" />}
      >
        {(loaded) =>
          loaded.length === 0 ? (
            <p className="m-0 text-small text-ink-2">
              No finished tests yet. Start one from a project's YouTube section: under YouTube
              links, open Test other titles and thumbnails. Its result shows here once YouTube
              Studio has one.
            </p>
          ) : (
            <ResultList results={loaded} />
          )
        }
      </QueryState>
    </div>
  );
}
