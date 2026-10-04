import { assetOf } from "@app/slices/storage/asset-name.js";
import type { Output } from "@app/slices/storage/model.js";
import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, DownloadIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useApp } from "@/app-context";
import { Button, ButtonRow } from "@/components/kit/button";
import { FileLink } from "@/components/kit/link";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/kit/menu";
import { readText } from "@/http";
import { cn } from "@/lib/utils";
import { keys } from "@/queries";
import { OpenFolder } from "./open-folder.js";
import type { ZipSet } from "./output-api.js";
import { outdatedWords } from "./output-status.js";
import { useAssetMedia, useCurrentRevisionView, useOutputMedia } from "./revision-media.js";
import { SetDownload } from "./set-download.js";

// The furniture every stage body is made of: the column a body stacks in, the prose measure,
// a stage's download and folder actions, and the "Show instructions" toggle each stage carries. It sits apart from
// the bodies so none of them has to redraw it.

// A body's column: sections of the page, not a box of its own.
export function StageBody({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <div className={cn("flex min-w-0 flex-col gap-5", className)}>{children}</div>;
}

export function EngravedLabel({ children }: { readonly children: ReactNode }) {
  return <span className="sl-kicker">{children}</span>;
}

// The article is stored as markdown and shown here as prose. The parser is react-markdown;
// the components below only give its output this project's type scale and colours. GFM is
// on for the same reason `packages/app` turns it on for the narration source: without it a
// `| Year | Event |` row survives as literal pipes.
//
// Six heading levels collapse onto the two prose sizes the scale has, and every one of
// them renders as an `h3`: this sits inside a stage row, under the page's own `h1` and
// the project title, so an article that opens with `#` may not claim to be the page.
const article: Components = {
  h1: ({ children }) => <Heading size="text-title-2">{children}</Heading>,
  h2: ({ children }) => <Heading size="text-title-3">{children}</Heading>,
  h3: ({ children }) => <Heading size="text-title-3">{children}</Heading>,
  h4: ({ children }) => <Heading size="text-title-3">{children}</Heading>,
  h5: ({ children }) => <Heading size="text-title-3">{children}</Heading>,
  h6: ({ children }) => <Heading size="text-title-3">{children}</Heading>,
  p: ({ children }) => <p className="m-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }) => <ul className="m-0 flex list-disc flex-col gap-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="m-0">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      className="rounded-control text-accent-ink underline underline-offset-[3px]"
      // An article's links point off this machine, and this page is not their referrer.
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded-control bg-sunken px-1 py-0.5 font-mono text-small">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="m-0 overflow-x-auto rounded-control bg-sunken p-3 font-mono text-small">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="m-0 flex flex-col gap-2 border-l-2 border-line-strong pl-3 text-ink-2">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-line" />,
  table: ({ children }) => (
    <table className="w-full border-collapse text-left text-small">{children}</table>
  ),
  th: ({ children }) => (
    <th className="sl-kicker border-b border-line py-2 pr-4 text-left">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-line py-2 pr-4 align-top">{children}</td>,
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

// 65-75 ch, the measure this app locks for prose.
export function Prose({ markdown }: { readonly markdown: string }) {
  return (
    <div className="flex max-w-[68ch] flex-col gap-2 text-pretty text-body text-ink">
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
// reader without the focus having to move.
export function RefusalLine({
  message,
  onDismiss,
}: {
  readonly message: string;
  readonly onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-control bg-danger-tint px-3 py-2 text-small text-danger">
      <span role="alert" className="min-w-0 break-words">
        {message}
      </span>
      <Button variant="quiet" size="small" className="ml-auto shrink-0" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

// The server names the file it sends; the anchor only has to ask for it. A download of a
// whole stage (Images' zip) with its one Open folder beside it: the section's main action
// unless it has a more important one, so primary by default.
export function DownloadLink({
  projectId,
  asset,
  label = "Download",
  variant = "primary",
}: {
  readonly projectId: string;
  readonly asset: string;
  readonly label?: string;
  readonly variant?: "primary" | "secondary";
}) {
  const media = useAssetMedia(projectId, asset);
  if (media === undefined) return null;
  return (
    <>
      <FileLink href={media.url} download variant={variant}>
        <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
        {label}
      </FileLink>
      <OpenFolder projectId={projectId} asset={asset} folder={media.folder} />
    </>
  );
}

export interface StageFile {
  readonly output: Output | undefined;
  // What the file is, as the menu lists it: "Body narration (.mp3)".
  readonly label: string;
}

function present(files: readonly StageFile[]): readonly Output[] {
  return files.flatMap((file) => (file.output === undefined ? [] : [file.output]));
}

// A stage's files behind one Download button, so a section with five files shows one
// control rather than a row of links each with its own Open folder beside it. One file is
// a plain download, no menu in between.
export function DownloadMenu({
  files,
  label = "Download",
  variant = "primary",
}: {
  readonly files: readonly StageFile[];
  readonly label?: string;
  // Primary: the stage's main action. Secondary when the section has a more important one.
  readonly variant?: "primary" | "secondary";
}) {
  const shown = files.filter(
    (file): file is { readonly output: Output; readonly label: string } =>
      file.output !== undefined,
  );
  const older = useOlderOutputs(shown.map((file) => file.output));
  const [only] = shown;
  if (only === undefined) return null;
  if (shown.length === 1)
    return (
      <SingleDownload
        output={only.output}
        label={older.has(only.output.id) ? `${label} (previous version)` : label}
        file={only.label}
        variant={variant}
      />
    );
  return (
    // Not modal: an open menu leaves the rest of the page readable and clickable.
    <Menu modal={false}>
      <MenuTrigger asChild>
        <Button variant={variant}>
          <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
          {label}
          <ChevronDownIcon aria-hidden="true" strokeWidth={1.75} />
        </Button>
      </MenuTrigger>
      <MenuContent>
        {shown.map((file) => (
          <DownloadItem
            key={file.output.id}
            output={file.output}
            label={older.has(file.output.id) ? `${file.label} · previous version` : file.label}
          />
        ))}
      </MenuContent>
    </Menu>
  );
}

function SingleDownload({
  output,
  label,
  file,
  variant,
}: {
  readonly output: Output;
  readonly label: string;
  // What the file is, as its tooltip: "Video (.mp4)".
  readonly file: string;
  readonly variant: "primary" | "secondary";
}) {
  const media = useOutputMedia(output);
  if (media === undefined) return null;
  return (
    <FileLink href={media.url} download variant={variant} title={file}>
      <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
      {label}
    </FileLink>
  );
}

function DownloadItem({ output, label }: { readonly output: Output; readonly label: string }) {
  const media = useOutputMedia(output);
  if (media === undefined) return null;
  return (
    <MenuItem asChild>
      <a href={media.url} download>
        <DownloadIcon aria-hidden="true" strokeWidth={1.75} className="size-4 text-ink-2" />
        {label}
      </a>
    </MenuItem>
  );
}

// The folder a stage's files are saved in, without a download beside it.
export function OutputFolder({ output }: { readonly output: Output | undefined }) {
  const media = useOutputMedia(output);
  if (output === undefined || media === undefined) return null;
  return <OpenFolder projectId={output.projectId} asset={assetOf(output)} folder={media.folder} />;
}

// A stage's file actions, in their own row apart from any text: one Download (a menu when
// there are several files), the stage's ONE Open folder, then whatever else the stage does
// (Copy article, Show instructions) in the order primary, secondary, quiet.
export function StageFiles({
  files,
  label = "Download",
  variant = "primary",
  noteOlder = true,
  zip,
  children,
}: {
  readonly files: readonly StageFile[];
  readonly label?: string;
  readonly variant?: "primary" | "secondary";
  // False where the body already says its file is from before the last change.
  readonly noteOlder?: boolean;
  // Download all as one zip (the shorts, the thumbnails), its files listed before it downloads.
  readonly zip?: { readonly set: ZipSet; readonly members: readonly Output[] } | undefined;
  readonly children?: ReactNode;
}) {
  const saved = present(files);
  const older = useOlderOutputs(saved);
  const first = saved.find((output) => older.has(output.id));
  if (saved.length === 0 && children === undefined) return null;
  return (
    <>
      <ButtonRow>
        <DownloadMenu files={files} label={label} variant={variant} />
        {zip === undefined || zip.members.length < 2 || saved[0] === undefined ? null : (
          <SetDownload
            projectId={saved[0].projectId}
            set={zip.set}
            members={zip.members}
            variant="secondary"
          />
        )}
        <OutputFolder output={saved[0]} />
        {children}
      </ButtonRow>
      {noteOlder && first !== undefined ? (
        <MetaLine>
          {`${outdatedWords(first.role)}. The download is that previous version until you remake it.`}
        </MetaLine>
      ) : null}
    </>
  );
}

// The files an edit made outdated: they stay usable, named as the previous version.
function useOlderOutputs(outputs: readonly Output[]): ReadonlySet<string> {
  const view = useCurrentRevisionView();
  const ids = new Set(outputs.map((output) => output.id));
  return new Set(
    view?.outputs
      .filter((row) => row.state === "outdated" && ids.has(row.output.id))
      .map((row) => row.output.id) ?? [],
  );
}

// The quiet line under a row of actions: lengths, formats, what a file measured. Its own
// line in ink-2, never beside the buttons.
export function MetaLine({ children }: { readonly children: ReactNode }) {
  return <p className="m-0 text-small text-ink-2 tabular-nums">{children}</p>;
}

// One of the project's own files, read as text. Loading and failure are said here so the
// six bodies do not each spell them out.
export function useOutputText(output: Output | undefined) {
  const { api } = useApp();
  const media = useOutputMedia(output);
  return useQuery({
    queryKey: media?.cacheKey ?? keys.revisionFile("", "", "unavailable"),
    queryFn: async () => (media === undefined ? "" : readText(await api.fetch(media.url))),
    enabled: media !== undefined,
    // A file is immutable for as long as its row is, and a re-run replaces a row rather
    // than versioning it, so a changed file always arrives under a new key.
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
    return <p className="m-0 text-body text-danger">{text.error.message}</p>;
  }
  if (text.data === undefined) {
    return <span className="h-4 w-[40ch] max-w-full rounded-control bg-sunken" />;
  }
  return as === "prose" ? (
    <Prose markdown={text.data} />
  ) : (
    <pre className="m-0 max-w-[68ch] overflow-x-auto whitespace-pre-wrap font-sans text-small text-ink-2">
      {text.data}
    </pre>
  );
}

// The instructions sent to the LLM sit behind a "Show instructions" toggle per stage.
export function Instructions({ output }: { readonly output: Output | undefined }) {
  const [shown, setShown] = useState(false);
  if (output === undefined) {
    return null;
  }
  return (
    <>
      <Button
        variant="quiet"
        size="small"
        aria-expanded={shown}
        onClick={() => {
          setShown(!shown);
        }}
      >
        {shown ? "Hide instructions" : "Show instructions"}
      </Button>
      {/* Its own line under the row of actions the toggle sits in. */}
      {shown ? (
        <div className="w-full basis-full">
          <OutputText output={output} as="plain" />
        </div>
      ) : null}
    </>
  );
}
