import { ChevronDownIcon, ChevronUpIcon, CopyIcon, SearchIcon } from "lucide-react";
import {
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { readingHeadings, rehypeReading } from "./reading.js";

// The project page's reading view for long text - the article, its research notes and sources,
// and the narration text: book-like type at a readable measure (about 70 characters), a table
// of contents built from the headings, search with every hit marked and a way to step through
// them, and Copy for any section or the whole text as Markdown. It is text to read, not a box to
// edit: no line numbers, no field border.
export function ReadingView({
  markdown,
  label,
  what,
  onCopy,
  copyAll = true,
  children,
}: {
  readonly markdown: string;
  // The region's accessible name, such as "Article content".
  readonly label: string;
  // What Copy names in its message, such as "article" or "research notes".
  readonly what: string;
  // Copies Markdown and says how it went; the caller owns the status line.
  readonly onCopy: (text: string, what: string) => void;
  // Whether the toolbar has its own Copy all; off where the caller's action row already has one.
  readonly copyAll?: boolean;
  // Shown instead of the text while there is none yet.
  readonly children?: ReactNode;
}): ReactElement {
  const idPrefix = useId().replace(/:/gu, "");
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const [hits, setHits] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const headings = useMemo(() => readingHeadings(markdown), [markdown]);
  const plugins = useMemo(
    () => [rehypeReading({ idPrefix, query })] as ComponentProps<typeof Markdown>["rehypePlugins"],
    [idPrefix, query],
  );
  const components = useMemo(
    () => readingComponents(headings, idPrefix, onCopy),
    [headings, idPrefix, onCopy],
  );

  // The hits are the marks the render left; counting them there keeps the number and the
  // highlighting the same thing.
  useEffect(() => {
    const marks = [...(body.current?.querySelectorAll<HTMLElement>("mark[data-hit]") ?? [])];
    setHits(marks.length);
    for (const [index, mark] of marks.entries())
      mark.dataset.current = index === current ? "true" : "false";
    marks[current]?.scrollIntoView?.({ block: "nearest" });
  });

  const step = (by: number) => {
    if (hits === 0) return;
    setCurrent((now) => (now + by + hits) % hits);
  };
  const searchId = `${idPrefix}-search`;
  const empty = markdown.trim() === "";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={searchId} className="sr-only">
          {`Search the ${what}`}
        </label>
        <span className="relative inline-flex w-full max-w-[320px] items-center">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-[8px] size-[14px] text-ink3"
          />
          <Input
            id={searchId}
            type="search"
            placeholder="Search"
            className="pl-[28px]"
            value={query}
            disabled={empty}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setCurrent(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                step(event.shiftKey ? -1 : 1);
              }
            }}
          />
        </span>
        <span className="min-w-[9ch] text-small text-ink2 tabular-nums" aria-live="polite">
          {query.trim() === ""
            ? ""
            : hits === 0
              ? "No matches"
              : `${String(current + 1)} of ${String(hits)}`}
        </span>
        <Button
          type="button"
          variant="ghost"
          aria-label="Previous match"
          disabled={hits === 0}
          onClick={() => step(-1)}
          className="size-8 p-0"
        >
          <ChevronUpIcon aria-hidden="true" className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-label="Next match"
          disabled={hits === 0}
          onClick={() => step(1)}
          className="size-8 p-0"
        >
          <ChevronDownIcon aria-hidden="true" className="size-4" />
        </Button>
        {copyAll ? (
          <Button
            type="button"
            variant="ghost"
            disabled={empty}
            onClick={() => onCopy(`${markdown.trim()}\n`, what)}
          >
            <CopyIcon aria-hidden="true" className="size-[14px]" />
            Copy all
          </Button>
        ) : null}
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-4 xl:grid-cols-[minmax(0,70ch)_minmax(180px,240px)]">
        <section
          aria-label={label}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll this reading region.
          tabIndex={0}
          className="max-h-[min(64vh,720px)] min-h-48 overflow-auto pr-3"
        >
          {empty ? (
            children
          ) : (
            <div
              ref={body}
              className="flex max-w-[70ch] flex-col gap-3 text-pretty text-body leading-[1.7] text-ink [&_mark[data-current=true]]:outline [&_mark[data-current=true]]:outline-2 [&_mark[data-current=true]]:outline-amber [&_mark]:rounded-[2px] [&_mark]:bg-amber/30 [&_mark]:text-ink"
            >
              <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={plugins} components={components}>
                {markdown}
              </Markdown>
            </div>
          )}
        </section>
        {headings.length < 2 ? null : (
          <nav aria-label={`Contents of the ${what}`} className="order-first xl:order-none">
            <h4 className="engraved mb-2 text-ink3">Contents</h4>
            <ol className="flex max-h-[min(64vh,720px)] flex-col gap-1 overflow-auto text-small">
              {headings.map((heading, index) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: headings keep their order
                  key={index}
                  style={{ paddingLeft: `${String(Math.max(0, heading.level - 1) * 12)}px` }}
                >
                  <a
                    href={`#${idPrefix}-h${String(index + 1)}`}
                    className="text-ink2 hover:text-ink hover:underline"
                    onClick={(event) => {
                      event.preventDefault();
                      document
                        .getElementById(`${idPrefix}-h${String(index + 1)}`)
                        ?.scrollIntoView?.({ block: "start" });
                    }}
                  >
                    {heading.text === "" ? `Section ${String(index + 1)}` : heading.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
      </div>
    </div>
  );
}

// The prose styles of the project page, with room to read: more space before a heading than
// after it, and each heading carrying Copy for its section.
function readingComponents(
  headings: readonly { readonly markdown: string; readonly text: string }[],
  idPrefix: string,
  onCopy: (text: string, what: string) => void,
): Components {
  const heading =
    (size: string) =>
    ({ children, id }: { children?: ReactNode; id?: string | undefined }) => {
      const index = Number((id ?? "").slice(`${idPrefix}-h`.length)) - 1;
      const section = headings[index];
      return (
        <div className="group mt-4 flex items-baseline gap-2 first:mt-0">
          <h3 id={id} className={cn("scroll-mt-2 font-bold tracking-[-0.01em]", size)}>
            {children}
          </h3>
          {section === undefined ? null : (
            <Button
              type="button"
              variant="ghost"
              className="h-6 px-2 text-small opacity-70 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Copy section ${section.text}`}
              onClick={() => onCopy(`${section.markdown}\n`, `section "${section.text}"`)}
            >
              <CopyIcon aria-hidden="true" className="size-[12px]" />
              Copy section
            </Button>
          )}
        </div>
      );
    };
  return {
    h1: heading("text-title"),
    h2: heading("text-row"),
    h3: heading("text-row"),
    h4: heading("text-body"),
    h5: heading("text-body"),
    h6: heading("text-body"),
    p: ({ children }) => <p className="m-0">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    ul: ({ children }) => <ul className="m-0 flex list-disc flex-col gap-1 pl-6">{children}</ul>,
    ol: ({ children }) => (
      <ol className="m-0 flex list-decimal flex-col gap-1 pl-6 marker:text-ink3">{children}</ol>
    ),
    li: ({ children }) => <li className="m-0 break-words">{children}</li>,
    a: ({ children, href }) => (
      <a
        href={href}
        className="rounded-control text-run-text underline underline-offset-[3px]"
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
      <th className="engraved border-b border-line py-[6px] pr-4 text-left text-ink3">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border-b border-line py-[6px] pr-4 align-top">{children}</td>
    ),
  };
}
