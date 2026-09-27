import { ChevronDownIcon, ChevronUpIcon, CopyIcon, SearchIcon } from "lucide-react";
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Button, IconButton } from "./button.js";
import { useToast } from "./toast.js";

// The reading view for long text (article, research, sources, narration), the one the whole
// app uses: `reading` type at a 68ch measure, a table of contents built from its headings (the
// top two levels, nested), a search that marks every hit and steps through them, and copy
// buttons that hand back the Markdown source of one section or of the whole text. It is text to
// read, not a box to edit.

export interface ReadingSection {
  // The anchor: a slug of the heading, unique in the document. "" for the text before the
  // first heading.
  readonly id: string;
  readonly heading: string | undefined;
  // 0 for a top-level heading (and the text before the first), 1 for one nested under it.
  readonly depth: 0 | 1;
  // The section's Markdown, heading line and nested sections included.
  readonly markdown: string;
  // The Markdown under the heading.
  readonly body: string;
}

function slug(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return base === "" ? "section" : base;
}

const headingLine = /^(#{1,3})\s+(.+?)\s*#*\s*$/;

// The heading lines of Markdown with their level, skipping `#` inside fenced code.
function headingsOf(lines: readonly string[]): readonly (number | undefined)[] {
  let fenced = false;
  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const match = fenced ? null : headingLine.exec(line);
    return match?.[1]?.length;
  });
}

// Splits Markdown at its headings: of `#`, `##` and `###`, the two highest levels the text
// uses, the lower one nested under the one before it (`depth` 1), so parts and their
// subsections read as one outline whether they are written `#`/`##` or `##`/`###`. Deeper
// headings stay inside their section. `markdown` of a top section includes its subsections,
// so Copy section copies all of it.
export function splitSections(markdown: string): readonly ReadingSection[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const levels = headingsOf(lines);
  // A lone top heading that opens the text is its title: it stays above the contents rather
  // than holding every other section under it.
  const first = levels.find((level) => level !== undefined);
  const titled =
    first !== undefined &&
    levels.filter((level) => level === first).length === 1 &&
    levels.every((level) => level === undefined || level >= first);
  const used = [
    ...new Set(levels.filter((level) => level !== undefined && !(titled && level === first))),
  ].sort((a, b) => a - b);
  const top = used[0];
  const nested = used[1];
  const sections: { heading: string | undefined; depth: 0 | 1; lines: string[] }[] = [
    { heading: undefined, depth: 0, lines: [] },
  ];
  for (const [index, line] of lines.entries()) {
    const level = levels[index];
    const heading = level === top || level === nested ? headingLine.exec(line)?.[2] : undefined;
    if (level !== undefined && heading !== undefined)
      sections.push({ heading, depth: level === top ? 0 : 1, lines: [line] });
    else sections[sections.length - 1]?.lines.push(line);
  }
  const seen = new Map<string, number>();
  const kept = sections.filter(
    (section) => section.heading !== undefined || section.lines.join("").trim() !== "",
  );
  return kept.map((section, at) => {
    let id = "";
    if (section.heading !== undefined) {
      const base = slug(section.heading);
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      id = count === 1 ? base : `${base}-${String(count)}`;
    }
    const end = kept.findIndex(
      (next, index) => index > at && next.depth <= section.depth && next.heading !== undefined,
    );
    const whole =
      section.heading === undefined || section.depth === 1
        ? section.lines
        : kept.slice(at, end === -1 ? undefined : end).flatMap((part) => part.lines);
    const body =
      section.heading === undefined
        ? section.lines.join("\n").trim()
        : section.lines.slice(1).join("\n").trim();
    return {
      id,
      heading: section.heading,
      depth: section.depth,
      markdown: whole.join("\n").trim(),
      body,
    };
  });
}

// Minimal hast shapes: enough to split text nodes, without depending on @types/hast.
interface HastText {
  type: "text";
  value: string;
}
interface HastParent {
  type: string;
  tagName?: string;
  children?: HastNode[];
}
type HastNode = HastText | HastParent;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A rehype plugin that wraps every case-insensitive hit of `query` in <mark class="sl-hit">.
function rehypeHighlight(query: string) {
  return () => (tree: HastNode) => {
    const needle = query.trim();
    if (needle === "") return;
    const pattern = new RegExp(escapeRegExp(needle), "gi");
    const walk = (node: HastNode) => {
      if (!("children" in node) || node.children === undefined) return;
      const next: HastNode[] = [];
      for (const child of node.children) {
        if (child.type === "text" && "value" in child) {
          next.push(...splitText(child.value, pattern));
        } else {
          walk(child);
          next.push(child);
        }
      }
      node.children = next;
    };
    walk(tree);
  };
}

function splitText(value: string, pattern: RegExp): HastNode[] {
  const out: HastNode[] = [];
  let last = 0;
  for (const match of value.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ type: "text", value: value.slice(last, at) });
    out.push({
      type: "element",
      tagName: "mark",
      properties: { className: ["sl-hit"] },
      children: [{ type: "text", value: match[0] }],
    } as HastParent);
    last = at + match[0].length;
  }
  if (last === 0) return [{ type: "text", value }];
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function highlight(text: string, query: string): ReactNode {
  const needle = query.trim();
  if (needle === "") return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, "gi"));
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: the split is positional and stable for one query.
      <mark key={i} className="sl-hit">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function sentenceStart(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ReadingView({
  markdown,
  label,
  what,
  query: controlledQuery,
  onQuery,
  onCopy,
  copyAll = true,
  regionLabel,
  anchorPrefix = "",
  children,
  className,
}: {
  readonly markdown: string;
  // What is being read: "Article", "Research", "Narration script". Names the TOC and search.
  readonly label: string;
  // The noun search and copy use, such as "research notes"; the label in lower case if left out.
  readonly what?: string;
  readonly query?: string;
  readonly onQuery?: (query: string) => void;
  // Takes over copying: the caller writes the clipboard and says how it went. Left out, the
  // view copies itself and says so in a toast.
  readonly onCopy?: (text: string, what: string) => void;
  // Off where the caller's own action row already has a Copy all.
  readonly copyAll?: boolean;
  // Puts the text in a scrolling region of this name, for a page that shows it beside other
  // work (the project page) rather than as the page itself.
  readonly regionLabel?: string;
  // Keeps the anchors unique when several views share a page.
  readonly anchorPrefix?: string;
  // Shown instead of the text while there is none yet; search is off meanwhile.
  readonly children?: ReactNode;
  readonly className?: string;
}): ReactElement {
  const notify = useToast();
  const noun = what ?? label.toLowerCase();
  const [ownQuery, setOwnQuery] = useState("");
  const query = controlledQuery ?? ownQuery;
  const setQuery = onQuery ?? setOwnQuery;
  const sections = useMemo(() => splitSections(markdown), [markdown]);
  const headed = sections.filter((section) => section.heading !== undefined);
  const headingCount = markdown.trim() === "" ? 0 : headed.length;
  const anchor = (id: string): string => (id === "" ? "" : `${anchorPrefix}${id}`);
  const [current, setCurrent] = useState<string | undefined>(anchor(headed[0]?.id ?? ""));
  const [hits, setHits] = useState(0);
  // The hit stepped to with Enter or the arrows; -1 until the reader steps.
  const [hitAt, setHitAt] = useState(-1);
  const body = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const plugins = useMemo(() => [rehypeHighlight(query)], [query]);
  const empty = markdown.trim() === "";

  // The marks are only known once rendered, so the count is read back after every render;
  // setting the same number again is a no-op. The stepped-to hit is marked current.
  useEffect(() => {
    const marks = [...(body.current?.querySelectorAll<HTMLElement>("mark.sl-hit") ?? [])];
    setHits(marks.length);
    for (const [index, mark] of marks.entries())
      mark.dataset.current = index === hitAt ? "true" : "false";
  });

  // The TOC follows the reader: the last heading scrolled past is current. Watched again when
  // the headings change, such as when the text arrives after the view mounted.
  useEffect(() => {
    const root = body.current;
    if (root === null || headingCount === 0 || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible !== undefined) setCurrent(visible.target.id);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    for (const heading of root.querySelectorAll("h2[id], h3[id]")) observer.observe(heading);
    return () => observer.disconnect();
  }, [headingCount]);

  const copy = async (text: string, copied: string) => {
    if (onCopy !== undefined) {
      onCopy(text, copied);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      notify(`${sentenceStart(copied)} copied as Markdown.`, "success");
    } catch {
      notify(
        `Could not copy the ${copied}: the browser blocked clipboard access. Select the text and press Ctrl+C.`,
        "error",
      );
    }
  };

  const step = (by: number) => {
    const marks = body.current?.querySelectorAll<HTMLElement>("mark.sl-hit");
    if (marks === undefined || marks.length === 0) return;
    const next =
      hitAt < 0 ? (by > 0 ? 0 : marks.length - 1) : (hitAt + by + marks.length) % marks.length;
    setHitAt(next);
    marks[next]?.scrollIntoView?.({ block: "center" });
  };

  const count =
    query.trim() === ""
      ? ""
      : hits === 0
        ? "No matches"
        : hitAt >= 0 && hitAt < hits
          ? `${String(hitAt + 1)} of ${String(hits)}`
          : hits === 1
            ? "1 match"
            : `${String(hits)} matches`;

  const text = (
    <div ref={body} className="sl-reading">
      {sections.map((section) => (
        <section key={section.id || "intro"} aria-labelledby={anchor(section.id) || undefined}>
          {section.heading === undefined ? null : (
            <div className="sl-reading__head">
              {section.depth === 0 ? (
                <h2 id={anchor(section.id)}>{highlight(section.heading, query)}</h2>
              ) : (
                <h3 id={anchor(section.id)}>{highlight(section.heading, query)}</h3>
              )}
              <Button
                variant="quiet"
                size="small"
                aria-label={`Copy section: ${section.heading}`}
                onClick={() => void copy(section.markdown, `section "${section.heading}"`)}
              >
                <CopyIcon aria-hidden="true" strokeWidth={1.75} />
                Copy section
              </Button>
            </div>
          )}
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={plugins}>
            {section.body}
          </Markdown>
        </section>
      ))}
    </div>
  );

  return (
    <div
      className={cn(
        "sl-reading-layout",
        (headed.length === 0 || empty) && "!grid-cols-1",
        className,
      )}
    >
      {headed.length === 0 || empty ? null : (
        <nav aria-label={`${label} contents`} className="sl-toc">
          <div className="sl-kicker px-[10px] pb-1">Contents</div>
          {headed.map((section) => (
            <a
              key={section.id}
              href={`#${anchor(section.id)}`}
              aria-current={anchor(section.id) === current ? "true" : undefined}
              className={section.depth === 1 ? "sl-toc__nested" : undefined}
              onClick={(event) => {
                event.preventDefault();
                setCurrent(anchor(section.id));
                document.getElementById(anchor(section.id))?.scrollIntoView?.({ block: "start" });
              }}
            >
              {section.heading}
            </a>
          ))}
        </nav>
      )}
      <div className="min-w-0">
        <div className="sl-reading__tools">
          <label htmlFor={searchId} className="sr-only">
            {`Search the ${noun}`}
          </label>
          <div className="relative w-full max-w-[320px]">
            <SearchIcon
              aria-hidden="true"
              strokeWidth={1.75}
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
            />
            <input
              id={searchId}
              type="search"
              value={query}
              disabled={empty}
              placeholder={`Search the ${noun}`}
              onChange={(event) => {
                setHitAt(-1);
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  step(event.shiftKey ? -1 : 1);
                }
              }}
              className="sl-input pl-9"
            />
          </div>
          <span className="min-w-[9ch] text-small text-ink-3 tabular-nums" aria-live="polite">
            {count}
          </span>
          <IconButton
            label="Previous match"
            size="small"
            disabled={hits === 0}
            onClick={() => step(-1)}
          >
            <ChevronUpIcon aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
          <IconButton label="Next match" size="small" disabled={hits === 0} onClick={() => step(1)}>
            <ChevronDownIcon aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
          {copyAll ? (
            <Button
              variant="quiet"
              size="small"
              className="ml-auto"
              disabled={empty}
              onClick={() => void copy(markdown, noun)}
            >
              <CopyIcon aria-hidden="true" strokeWidth={1.75} />
              Copy all
            </Button>
          ) : null}
        </div>
        {regionLabel === undefined ? (
          empty ? (
            children
          ) : (
            text
          )
        ) : (
          <section
            aria-label={regionLabel}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll this reading region.
            tabIndex={0}
            className="sl-reading__scroll"
          >
            {empty ? children : text}
          </section>
        )}
      </div>
    </div>
  );
}
