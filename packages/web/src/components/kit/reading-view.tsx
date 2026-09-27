import { CopyIcon, SearchIcon } from "lucide-react";
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
import { Button } from "./button.js";
import { useToast } from "./toast.js";

// The reading view for long text (article, research, narration): `reading` type at a 68ch
// measure, a table of contents built from its `##` headings, a search that marks every hit,
// and copy buttons that hand back the Markdown source of one section or of the whole text.

export interface ReadingSection {
  // The anchor: a slug of the heading, unique in the document. "" for the text before the
  // first heading.
  readonly id: string;
  readonly heading: string | undefined;
  // The section's own Markdown, heading line included.
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

// Splits Markdown at its level-two headings, ignoring `##` inside fenced code.
export function splitSections(markdown: string): readonly ReadingSection[] {
  const sections: { heading: string | undefined; lines: string[] }[] = [
    { heading: undefined, lines: [] },
  ];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const match = fenced ? null : /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (match?.[1] !== undefined) sections.push({ heading: match[1], lines: [line] });
    else sections[sections.length - 1]?.lines.push(line);
  }
  const seen = new Map<string, number>();
  return sections
    .filter((section) => section.heading !== undefined || section.lines.join("").trim() !== "")
    .map((section) => {
      let id = "";
      if (section.heading !== undefined) {
        const base = slug(section.heading);
        const count = (seen.get(base) ?? 0) + 1;
        seen.set(base, count);
        id = count === 1 ? base : `${base}-${String(count)}`;
      }
      const markdown = section.lines.join("\n").trim();
      const body =
        section.heading === undefined ? markdown : section.lines.slice(1).join("\n").trim();
      return { id, heading: section.heading, markdown, body };
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

export function ReadingView({
  markdown,
  label,
  query: controlledQuery,
  onQuery,
  className,
}: {
  readonly markdown: string;
  // What is being read: "Article", "Research", "Narration script". Names the TOC and search.
  readonly label: string;
  readonly query?: string;
  readonly onQuery?: (query: string) => void;
  readonly className?: string;
}): ReactElement {
  const notify = useToast();
  const [ownQuery, setOwnQuery] = useState("");
  const query = controlledQuery ?? ownQuery;
  const setQuery = onQuery ?? setOwnQuery;
  const sections = useMemo(() => splitSections(markdown), [markdown]);
  const headed = sections.filter((section) => section.heading !== undefined);
  const [current, setCurrent] = useState<string | undefined>(headed[0]?.id);
  const [hits, setHits] = useState(0);
  const hitAt = useRef(-1);
  const body = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const plugins = useMemo(() => [rehypeHighlight(query)], [query]);

  // The marks are only known once rendered, so the count is read back after every render;
  // setting the same number again is a no-op.
  useEffect(() => {
    setHits(body.current?.querySelectorAll("mark.sl-hit").length ?? 0);
  });

  // The TOC follows the reader: the last heading scrolled past is current.
  useEffect(() => {
    const root = body.current;
    if (root === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible !== undefined) setCurrent(visible.target.id);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    for (const heading of root.querySelectorAll("h2[id]")) observer.observe(heading);
    return () => observer.disconnect();
  }, []);

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${what} copied as Markdown.`, "success");
    } catch {
      notify(
        `Could not copy ${what.toLowerCase()}: the browser blocked clipboard access. Select the text and press Ctrl+C.`,
        "error",
      );
    }
  };

  const nextHit = () => {
    const marks = body.current?.querySelectorAll<HTMLElement>("mark.sl-hit");
    if (marks === undefined || marks.length === 0) return;
    hitAt.current = (hitAt.current + 1) % marks.length;
    marks[hitAt.current]?.scrollIntoView?.({ block: "center" });
  };

  return (
    <div className={cn("sl-reading-layout", headed.length === 0 && "!grid-cols-1", className)}>
      {headed.length === 0 ? null : (
        <nav aria-label={`${label} contents`} className="sl-toc">
          <div className="sl-kicker px-[10px] pb-1">Contents</div>
          {headed.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={section.id === current ? "true" : undefined}
              onClick={() => setCurrent(section.id)}
            >
              {section.heading}
            </a>
          ))}
        </nav>
      )}
      <div className="min-w-0">
        <div className="sl-reading__tools">
          <label htmlFor={searchId} className="sr-only">
            {`Search the ${label.toLowerCase()}`}
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
              placeholder={`Search the ${label.toLowerCase()}`}
              onChange={(event) => {
                hitAt.current = -1;
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  nextHit();
                }
              }}
              className="sl-input pl-9"
            />
          </div>
          <span className="text-small text-ink-3" aria-live="polite">
            {query.trim() === "" ? "" : hits === 1 ? "1 match" : `${String(hits)} matches`}
          </span>
          <Button
            variant="quiet"
            size="small"
            className="ml-auto"
            onClick={() => void copy(markdown, label)}
          >
            <CopyIcon aria-hidden="true" strokeWidth={1.75} />
            Copy all
          </Button>
        </div>
        <div ref={body} className="sl-reading">
          {sections.map((section) => (
            <section key={section.id || "intro"} aria-labelledby={section.id || undefined}>
              {section.heading === undefined ? null : (
                <div className="sl-reading__head">
                  <h2 id={section.id}>{highlight(section.heading, query)}</h2>
                  <Button
                    variant="quiet"
                    size="small"
                    aria-label={`Copy section: ${section.heading}`}
                    onClick={() => void copy(section.markdown, "Section")}
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
      </div>
    </div>
  );
}
