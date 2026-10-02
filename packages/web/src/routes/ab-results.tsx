import type { AbResult } from "@app/slices/studio/stats.js";
import { useQuery } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import type { ReactElement } from "react";
import { readAbResults } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { useToast } from "@/components/kit/toast";

// Library → A/B results: every finished A/B test the extension read from Studio, the winner
// first, with each variant's share of watch time. Copy as prompt notes turns them into a short
// summary to paste into the Library prompts that write titles and thumbnails; nothing changes a
// prompt by itself.

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

export function AbResultsRoute(): ReactElement {
  const { api } = useApp();
  const notify = useToast();
  const results = useQuery({
    queryKey: ["studio", "ab-results"],
    queryFn: () => readAbResults(api),
  });
  const list = results.data ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 flex-1 text-small text-ink-2">
          Finished A/B tests, as the Slopify Studio extension read them from YouTube Studio once a
          day. The winner is listed first.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={list.length === 0}
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
      </div>
      {results.isPending ? (
        <p className="text-small text-ink-3">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-small text-ink-3">
          No finished A/B tests yet. Start one from a project's Video section (On YouTube → A/B
          test) or the extension; its result shows here once Studio has one.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {list.map((result) => {
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
      )}
    </div>
  );
}
