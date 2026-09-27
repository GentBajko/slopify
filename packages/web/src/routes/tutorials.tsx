import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import {
  type MouseEvent,
  type ReactElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { useSearchShortcut } from "@/components/kit/command-palette";
import { PageHeader, Workspace } from "@/components/kit/layout";
import { ReadingView } from "@/components/kit/reading-view";
import {
  type TutorialHit,
  type TutorialsIndex,
  tutorialPageQuery,
  tutorialSearchQuery,
  tutorialsQuery,
} from "@/tutorials/api";
import { headingForAnchor, parseTutorialHref, rewriteTutorialLinks } from "@/tutorials/links";

// Help → Tutorials: the wiki's pages, shipped with the app so they read offline and describe
// the version that is running. The sidebar's groups on the left with a search across every
// page; the page in the reading view (contents, search in the page, Copy section). A link
// between pages stays in the app, its section kept, and `#section` in the address scrolls there.
export function TutorialsRoute({
  page,
  anchor,
  words,
}: {
  readonly page: string;
  readonly anchor: string | undefined;
  // The words a search result was opened with (`?q=`), marked in the page.
  readonly words: string | undefined;
}): ReactElement {
  const { api } = useApp();
  const index = useQuery(tutorialsQuery(api));
  const markdown = useQuery(tutorialPageQuery(api, page));
  const navigate = useNavigate();
  // The words a search result was opened with, marked in the page until changed.
  const [marked, setMarked] = useState(words ?? "");
  useEffect(() => {
    setMarked(words ?? "");
  }, [words]);
  const body = useRef<HTMLDivElement>(null);

  const pages = useMemo(
    () => new Set((index.data?.pages ?? []).map((one) => one.id)),
    [index.data],
  );
  const title = index.data?.pages.find((one) => one.id === page)?.title ?? page.replace(/-/g, " ");
  const text = useMemo(
    () => (markdown.data === undefined ? "" : rewriteTutorialLinks(markdown.data, pages, page)),
    [markdown.data, pages, page],
  );

  // To the section the address names once the page is drawn, or to the top of a new page.
  useEffect(() => {
    if (text === "") return;
    const root = body.current;
    if (root === null) return;
    const target = anchor === undefined ? undefined : headingForAnchor(root, anchor);
    if (target !== undefined) target.scrollIntoView?.({ block: "start" });
    else window.scrollTo?.({ top: 0 });
  }, [text, anchor]);

  const group = index.data?.groups.find((one) => one.pages.some((item) => item.id === page));

  // Links inside the page open in the app; outside links open in a new tab, so the app stays.
  const follow = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    const link = (event.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href");
    if (link === null || href == null) return;
    const inside = parseTutorialHref(href);
    if (inside !== undefined) {
      event.preventDefault();
      void navigate({
        to: "/help/tutorials/$page",
        params: { page: inside.page },
        ...(inside.anchor === undefined ? {} : { hash: inside.anchor }),
      });
      return;
    }
    if (/^https?:/.test(href)) {
      event.preventDefault();
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div>
      <PageHeader
        crumb={
          <>
            <span>Help</span>
            <span aria-hidden="true">›</span>
            <Link to="/help/tutorials/$page" params={{ page: index.data?.home.id ?? "Home" }}>
              Tutorials
            </Link>
          </>
        }
        title={title}
        meta={
          group === undefined
            ? "Guides to every screen of Slopify, for the version you are running."
            : group.title
        }
      />
      <Workspace
        className="sl-workspace--tutorials"
        sections={
          <TutorialsNav
            index={index.data}
            page={page}
            onOpenHit={(hit, query) => {
              void navigate({
                to: "/help/tutorials/$page",
                params: { page: hit.page },
                search: { q: query },
                ...(hit.anchor === "" ? {} : { hash: hit.anchor }),
              });
            }}
          />
        }
      >
        {markdown.error !== null ? (
          <Callout
            tone="danger"
            title="This tutorial did not load"
            actions={
              <Button onClick={() => void markdown.refetch()} variant="secondary">
                Try again
              </Button>
            }
          >
            {`${markdown.error.message} Press Try again, or pick another page on the left.`}
          </Callout>
        ) : (
          // biome-ignore lint/a11y/noStaticElementInteractions: the links inside are the controls; this only routes their clicks.
          // biome-ignore lint/a11y/useKeyWithClickEvents: Enter on a link fires the same click.
          <div ref={body} onClick={follow}>
            <ReadingView
              markdown={text}
              label="Tutorial"
              what="tutorial"
              query={marked}
              onQuery={setMarked}
              anchorPrefix="tutorial-"
            >
              <p className="m-0 text-ink-3">Loading the tutorial…</p>
            </ReadingView>
            {index.data?.footer ? (
              <p className="mt-8 border-t border-line pt-4 text-small text-ink-3">
                {index.data.footer.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")}
              </p>
            ) : null}
          </div>
        )}
      </Workspace>
    </div>
  );
}

function TutorialsNav({
  index,
  page,
  onOpenHit,
}: {
  readonly index: TutorialsIndex | undefined;
  readonly page: string;
  readonly onOpenHit: (hit: TutorialHit, query: string) => void;
}): ReactElement {
  const { api } = useApp();
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const searchId = useId();
  useSearchShortcut(input, "the tutorials");
  // A search per pause in typing, not per key.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), 200);
    return () => clearTimeout(timer);
  }, [typed]);
  const found = useQuery(tutorialSearchQuery(api, query));

  return (
    <nav aria-label="Tutorials" className="flex min-w-0 flex-col gap-4">
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Search all tutorials
        </label>
        <SearchIcon
          aria-hidden="true"
          strokeWidth={1.75}
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
        />
        <input
          ref={input}
          id={searchId}
          type="search"
          value={typed}
          placeholder="Search all tutorials"
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            const first = found.data?.hits[0];
            if (event.key === "Enter" && first !== undefined) {
              event.preventDefault();
              onOpenHit(first, query);
            }
          }}
          className="sl-input pl-9"
        />
      </div>
      {query !== "" ? (
        <SearchResults query={query} hits={found.data?.hits} error={found.error?.message} />
      ) : index === undefined ? (
        <p className="m-0 text-small text-ink-3">Loading the tutorials…</p>
      ) : (
        <div className="sl-tutorials-nav flex flex-col gap-4">
          <TutorialLink id={index.home.id} title={index.home.title} current={page} />
          {index.groups.map((group) => (
            <div key={group.title} className="flex flex-col gap-0.5">
              <div className="sl-kicker px-2.5 pb-1">{group.title}</div>
              {group.pages.map((one) => (
                <TutorialLink key={one.id} id={one.id} title={one.title} current={page} />
              ))}
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}

function TutorialLink({
  id,
  title,
  current,
}: {
  readonly id: string;
  readonly title: string;
  readonly current: string;
}): ReactElement {
  return (
    <Link
      to="/help/tutorials/$page"
      params={{ page: id }}
      aria-current={id === current ? "page" : undefined}
      className="sl-tutorials-nav__link"
    >
      {title}
    </Link>
  );
}

function SearchResults({
  query,
  hits,
  error,
}: {
  readonly query: string;
  readonly hits: readonly TutorialHit[] | undefined;
  readonly error: string | undefined;
}): ReactElement {
  if (error !== undefined)
    return (
      <p role="alert" className="m-0 text-small text-danger">
        {`The search didn't run: ${error} Change the words or reload the page.`}
      </p>
    );
  if (hits === undefined) return <p className="m-0 text-small text-ink-3">Searching…</p>;
  if (hits.length === 0)
    return (
      <p role="status" className="m-0 text-small text-ink-2">
        {`No tutorial mentions "${query}". Try fewer or other words.`}
      </p>
    );
  return (
    <div className="flex flex-col gap-1">
      <p role="status" className="m-0 px-2.5 text-small text-ink-3">
        {hits.length === 1 ? "1 section" : `${String(hits.length)} sections`}
      </p>
      <ul aria-label="Search results" className="m-0 flex list-none flex-col gap-1 p-0">
        {hits.map((hit) => (
          <li key={`${hit.page}#${hit.anchor}`}>
            <Link
              to="/help/tutorials/$page"
              params={{ page: hit.page }}
              search={{ q: query }}
              {...(hit.anchor === "" ? {} : { hash: hit.anchor })}
              className="sl-tutorials-hit"
            >
              <span className="block font-semibold text-ink">
                {hit.heading === undefined ? hit.pageTitle : hit.heading}
              </span>
              {hit.heading === undefined ? null : (
                <span className="block text-label text-ink-3">{hit.pageTitle}</span>
              )}
              <span className="mt-0.5 block text-small text-ink-2">{hit.snippet}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
