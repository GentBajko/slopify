import { assetOf } from "@app/slices/storage/asset-name.js";
import type { Output } from "@app/slices/storage/model.js";
import { useQuery } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fileUrl } from "@/api";
import { useApp } from "@/app-context";
import { cn } from "@/lib/utils";
import { keys } from "@/queries";
import { readOutputText } from "./api.js";

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

// `logic/07` writes the article as markdown and this page shows it as prose. The parser
// is react-markdown, the pick `05-dependencies.md` records for article display; the
// components below only give its output this project's type scale and colours. GFM is on
// for the same reason `packages/app` turns it on for the narration source: without it a
// `| Year | Event |` row survives as literal pipes.
//
// Six heading levels collapse onto the two prose sizes the scale has, and every one of
// them renders as an `h3`: this sits inside a stage row, under the page's own `h1` and
// the project title, so an article that opens with `#` may not claim to be the page.
const article: Components = {
  h1: ({ children }) => <Heading size="text-title">{children}</Heading>,
  h2: ({ children }) => <Heading size="text-row">{children}</Heading>,
  h3: ({ children }) => <Heading size="text-row">{children}</Heading>,
  h4: ({ children }) => <Heading size="text-row">{children}</Heading>,
  h5: ({ children }) => <Heading size="text-row">{children}</Heading>,
  h6: ({ children }) => <Heading size="text-row">{children}</Heading>,
  p: ({ children }) => <p className="m-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }) => <ul className="m-0 flex list-disc flex-col gap-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="m-0">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      className="rounded-control text-run-text underline underline-offset-[3px]"
      // An article's links point off this machine, and this page is not their referrer.
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded-control bg-panel2 px-[4px] py-[1px] font-sans text-small">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="m-0 overflow-x-auto rounded-control bg-panel2 p-[10px] font-sans text-small">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="m-0 flex flex-col gap-2 border-l-2 border-line2 pl-3 text-ink2">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-line" />,
  table: ({ children }) => (
    <table className="w-full border-collapse text-left text-small">{children}</table>
  ),
  th: ({ children }) => (
    <th className="engraved border-b border-line py-[6px] pr-4 text-left text-ink3">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-line py-[6px] pr-4 align-top">{children}</td>
  ),
};

// The article's own title, typeset on the row that carries it: a heading's worth of
// inline markup with no block of its own.
const inline: Components = {
  p: ({ children }) => <>{children}</>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ children }) => <>{children}</>,
};

function Heading({ size, children }: { readonly size: string; readonly children: ReactNode }) {
  return <h3 className={cn("mt-2 font-bold tracking-[-0.01em]", size)}>{children}</h3>;
}

// 65-75 ch, which is the measure `uiux/02-system.md` locks for prose.
export function Prose({ markdown }: { readonly markdown: string }) {
  return (
    <div className="flex max-w-[75ch] flex-col gap-2 text-pretty text-body text-ink">
      <Markdown remarkPlugins={[remarkGfm]} components={article}>
        {markdown}
      </Markdown>
    </div>
  );
}

export function InlineProse({ markdown }: { readonly markdown: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={inline}>
      {markdown}
    </Markdown>
  );
}

// The article's own heading, so the body does not typeset it under the title line that
// already shows it. Only the first line, and only when that line is an ATX heading: this
// reads the source rather than parsing it, because a heading line is a line and the
// markdown below it goes to react-markdown untouched.
export interface Split {
  // Markdown, not text: the caller typesets it with `InlineProse`. Undefined when the
  // article opens with something other than a heading, and the caller falls back to the
  // project's title.
  readonly title: string | undefined;
  readonly body: string;
}

const atxHeading = /^#{1,6}[ \t]+(.*?)[ \t]*#*[ \t]*(?:\r?\n|$)/;

export function splitTitle(markdown: string): Split {
  const opening = markdown.replace(/^[\s]*\n/, "");
  const matched = atxHeading.exec(opening);
  if (matched === null) {
    return { title: undefined, body: markdown.trim() };
  }
  return { title: matched[1] ?? "", body: opening.slice(matched[0].length).trim() };
}

// A refused action, said where the press happened. `role="alert"` so it reaches a screen
// reader without the focus having to move (`uiux/03-experience.md`, Error recovery).
export function RefusalLine({
  message,
  onDismiss,
}: {
  readonly message: string;
  readonly onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-control bg-red-tint px-[10px] py-[6px] text-small text-red">
      <span role="alert" className="min-w-0 break-words">
        {message}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-auto shrink-0 rounded-control px-2 text-ink2 hover:text-ink"
      >
        Dismiss
      </button>
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
