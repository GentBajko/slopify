import { assetOf } from "@app/slices/storage/asset-name.js";
import type { Output } from "@app/slices/storage/model.js";
import { useQuery } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { fileUrl } from "@/api";
import { useApp } from "@/app-context";
import { cn } from "@/lib/utils";
import { keys } from "@/queries";
import { readOutputText } from "./api.js";
import type { Block } from "./markdown.js";
import { blocksOf } from "./markdown.js";

// The furniture every stage body is made of: the indented frame under a rundown row, the
// 75 ch prose measure, a download link, and the "Show instructions" toggle each stage
// carries (uiux/screens/08-project.md). It sits apart from the bodies so none of the six
// has to redraw it.

// The reference sheet's body inset: flush with the row's name column, not its lamp.
export function StageBody({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 pt-0 pr-4 pb-[18px] pl-[66px]", className)}>
      {children}
    </div>
  );
}

export function ActionRow({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-4 text-small">{children}</div>;
}

export function EngravedLabel({ children }: { readonly children: ReactNode }) {
  return <span className="engraved text-ink3">{children}</span>;
}

// 65-75 ch, which is the measure `uiux/02-system.md` locks for prose.
export function Prose({ markdown }: { readonly markdown: string }) {
  return <ProseBlocks blocks={blocksOf(markdown)} />;
}

// For a caller that has already taken the article's title off the top.
export function ProseBlocks({ blocks }: { readonly blocks: readonly Block[] }) {
  return (
    <div className="flex max-w-[75ch] flex-col gap-2 text-pretty text-body text-ink">
      {blocks.map((block, at) => {
        const spans = block.spans.map((span, span_at) =>
          span.bold ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: a rendered article has no ids of its own, and the blocks are only ever replaced wholesale.
            <strong key={span_at} className="font-semibold">
              {span.text}
            </strong>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: as above.
            <span key={span_at}>{span.text}</span>
          ),
        );
        if (block.kind === "heading") {
          const size = block.level === 1 ? "text-title" : "text-row";
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: as above.
            <h3 key={at} className={cn("mt-2 font-bold tracking-[-0.01em]", size)}>
              {spans}
            </h3>
          );
        }
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: as above.
          <p key={at} className="m-0">
            {spans}
          </p>
        );
      })}
    </div>
  );
}

// `logic/14` §Q116 names the file the server sends; the anchor only has to ask for it.
export function DownloadLink({
  projectId,
  asset,
  label = "Download",
}: {
  readonly projectId: string;
  readonly asset: string;
  readonly label?: string;
}) {
  const { api } = useApp();
  return (
    <a
      href={fileUrl(api, projectId, asset)}
      download
      className="inline-flex items-center gap-[5px] rounded-control text-small text-ink2 hover:text-ink"
    >
      <DownloadIcon aria-hidden="true" className="size-[14px] shrink-0" />
      {label}
    </a>
  );
}

export function OutputDownload({
  output,
  label,
}: {
  readonly output: Output;
  readonly label?: string;
}) {
  return (
    <DownloadLink
      projectId={output.projectId}
      asset={assetOf(output)}
      {...(label === undefined ? {} : { label })}
    />
  );
}

// One of the project's own files, read as text. Loading and failure are said here so the
// six bodies do not each spell them out.
export function useOutputText(output: Output | undefined) {
  const { api } = useApp();
  return useQuery({
    queryKey: keys.file(output?.projectId ?? "", output?.id ?? ""),
    queryFn: () =>
      output === undefined ? "" : readOutputText(api, output.projectId, assetOf(output)),
    enabled: output !== undefined,
    // A file is immutable for as long as its row is, and `logic/12` §Q106 replaces a row
    // rather than versioning it, so a changed file always arrives under a new key.
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function OutputText({
  output,
  as = "prose",
}: {
  readonly output: Output;
  readonly as?: "prose" | "plain";
}) {
  const text = useOutputText(output);
  if (text.error !== null) {
    return <p className="text-body text-red">{text.error.message}</p>;
  }
  if (text.data === undefined) {
    return <span className="h-4 w-[40ch] max-w-full rounded-control bg-panel2" />;
  }
  return as === "prose" ? (
    <Prose markdown={text.data} />
  ) : (
    <pre className="max-w-[75ch] overflow-x-auto whitespace-pre-wrap font-sans text-small text-ink2">
      {text.data}
    </pre>
  );
}

// `uiux/03-experience.md`, Progressive disclosure: "the instructions sent to the LLM sit
// behind a 'Show instructions' toggle per stage".
export function Instructions({ output }: { readonly output: Output | undefined }) {
  const [shown, setShown] = useState(false);
  if (output === undefined) {
    return null;
  }
  return (
    <>
      <button
        type="button"
        aria-expanded={shown}
        onClick={() => {
          setShown(!shown);
        }}
        className="rounded-control text-small text-ink2 underline underline-offset-[3px] hover:text-ink"
      >
        {shown ? "Hide instructions" : "Show instructions"}
      </button>
      {shown ? <OutputText output={output} as="plain" /> : null}
    </>
  );
}
