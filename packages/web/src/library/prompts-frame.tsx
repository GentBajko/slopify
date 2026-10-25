import type { EntryCategory, PromptKind } from "@app/slices/library/model.js";
import { entryCategories, promptKinds } from "@app/slices/library/model.js";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactElement, type ReactNode, useId } from "react";
import { useApp } from "@/app-context";
import { PageHeader, Workspace } from "@/components/kit/layout";
import { Rail, RailLink } from "@/components/kit/rail";
import { keywordSlots } from "@/lib/draft-lint";
import { categoryLabel, categoryWrites } from "@/lib/entry-options";
import { kindLabel, kindWrites } from "@/lib/prompt-kinds";
import { entriesQuery, promptsQuery } from "@/queries";
import { TrashLink } from "@/trash/trash-link";

// Whether a prompt or intro/outro has the words (lower case, trimmed) in its name or its text:
// what the page's search box and the counts beside each kind both go by.
export function hasWords(
  item: { readonly name: string; readonly body: string },
  needle: string,
): boolean {
  return item.name.toLowerCase().includes(needle) || item.body.toLowerCase().includes(needle);
}

// What the Prompts page is showing: one kind of prompt, or the intros or the outros (saved apart
// from prompts, with a category instead of a kind).
type PromptsShown = { readonly kind: PromptKind } | { readonly category: EntryCategory };

// The search box's words, when it has any: the list of kinds then counts what matches in each
// and lights none, and picking a kind ends the search.
interface FrameSearch {
  readonly needle: string;
  readonly clear: () => void;
}

// The Prompts page: its title and actions on one line, every kind of prompt down the left with
// what it writes and how many are saved, and the list of the one picked beside it. Intros and
// outros sit at the foot of the same list: they are written like prompts and spoken before and
// after the video. On a phone the kinds are one "Showing:" choice with their counts.
export function PromptsFrame({
  shown,
  search,
  actions,
  children,
}: {
  readonly shown: PromptsShown;
  readonly search?: FrameSearch | undefined;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  const counts = useKindCounts(search?.needle ?? "");
  return (
    <div>
      <PageHeader
        title="Prompts"
        actions={
          <>
            <TrashLink kinds={["prompt", "entry"]} />
            {actions}
          </>
        }
      />
      <Workspace
        className="sl-workspace--prompts"
        sections={
          <>
            <PromptKinds shown={shown} counts={counts} search={search} />
            <PhoneKinds shown={shown} counts={counts} />
          </>
        }
      >
        {children}
      </Workspace>
    </div>
  );
}

interface KindCounts {
  readonly kind: (kind: PromptKind) => number | undefined;
  readonly category: (category: EntryCategory) => number | undefined;
}

// How many of each kind are saved, or, while searching, how many of each have the words.
function useKindCounts(needle: string): KindCounts {
  const { api } = useApp();
  const prompts = useQuery(promptsQuery(api)).data?.prompts;
  const entries = useQuery(entriesQuery(api)).data?.entries;
  const shownPrompts = needle === "" ? prompts : prompts?.filter((one) => hasWords(one, needle));
  const shownEntries = needle === "" ? entries : entries?.filter((one) => hasWords(one, needle));
  return {
    kind: (kind) => shownPrompts?.filter((prompt) => prompt.kind === kind).length,
    category: (category) => shownEntries?.filter((entry) => entry.category === category).length,
  };
}

function PromptKinds({
  shown,
  counts,
  search,
}: {
  readonly shown: PromptsShown;
  readonly counts: KindCounts;
  readonly search: FrameSearch | undefined;
}): ReactElement {
  const searching = search !== undefined && search.needle !== "";
  // "Article, 4" to a screen reader; the number alone on screen.
  const count = (counted: number | undefined) =>
    counted === undefined ? undefined : (
      <span className="relative">
        <span className="sr-only">, </span>
        {String(counted)}
      </span>
    );
  return (
    <Rail label="Kinds of prompt" className="max-md:hidden">
      {promptKinds.map((kind) => (
        <RailLink
          key={kind}
          to="/prompts"
          search={{ kind }}
          current={!searching && "kind" in shown && shown.kind === kind}
          meta={count(counts.kind(kind))}
          onClick={search?.clear}
        >
          <KindName name={kindLabel(kind)} writes={kindWrites(kind)} />
        </RailLink>
      ))}
      <hr className="sl-rule my-2" />
      {entryCategories.map((category) => (
        <RailLink
          key={category}
          to="/entries"
          search={{ category }}
          current={!searching && "category" in shown && shown.category === category}
          meta={count(counts.category(category))}
          onClick={search?.clear}
        >
          <KindName name={`${categoryLabel(category)}s`} writes={categoryWrites(category)} />
        </RailLink>
      ))}
    </Rail>
  );
}

// A kind's name over what it writes, so "Review" says what it is before it is picked.
function KindName({ name, writes }: { readonly name: string; readonly writes: string }) {
  return (
    <span className="flex flex-col">
      <span>{name}</span>
      <span className="text-small font-normal text-ink-3">{writes}</span>
    </span>
  );
}

// A phone has no room for the list of kinds beside the list: "Showing: Article prompts (36) ▾"
// over it instead, the platform's own menu, every kind in reach and the one on show named.
function PhoneKinds({
  shown,
  counts,
}: {
  readonly shown: PromptsShown;
  readonly counts: KindCounts;
}): ReactElement {
  const id = useId();
  const navigate = useNavigate();
  const counted = (name: string, count: number | undefined) =>
    count === undefined ? name : `${name} (${String(count)})`;
  return (
    <div className="flex min-w-0 items-center gap-2 md:hidden">
      <label htmlFor={id} className="shrink-0 text-small text-ink-2">
        Showing:
      </label>
      <select
        id={id}
        className="sl-select min-w-0 flex-1"
        value={"kind" in shown ? `kind:${shown.kind}` : `category:${shown.category}`}
        onChange={(event) => {
          const [what, value] = event.target.value.split(":");
          const kind = promptKinds.find((one) => one === value);
          const category = entryCategories.find((one) => one === value);
          if (what === "kind" && kind !== undefined)
            void navigate({ to: "/prompts", search: { kind } });
          else if (category !== undefined) void navigate({ to: "/entries", search: { category } });
        }}
      >
        {promptKinds.map((kind) => (
          <option key={kind} value={`kind:${kind}`}>
            {counted(`${kindLabel(kind)} prompts`, counts.kind(kind))}
          </option>
        ))}
        {entryCategories.map((category) => (
          <option key={category} value={`category:${category}`}>
            {counted(`${categoryLabel(category)}s`, counts.category(category))}
          </option>
        ))}
      </select>
    </div>
  );
}

// The line over a list: what it holds and what that kind makes, with the search and the order
// on the right.
export function PromptsListHead({
  title,
  about,
  tools,
}: {
  readonly title: string;
  // Left out where the empty state below says it.
  readonly about?: string | undefined;
  readonly tools: ReactNode;
}): ReactElement {
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0">
        <h2 className="sl-section-head__title text-title-3">{title}</h2>
        {about === undefined ? null : <p className="m-0 min-w-0 text-small text-ink-2">{about}</p>}
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{tools}</div>
    </div>
  );
}

// A prompt row's second line: what it asks you for, then its first words, so a row says what
// the prompt does without opening it. While searching every kind, the kind leads.
export function PromptRowMeta({
  kind,
  body,
  slots,
}: {
  readonly kind?: string | undefined;
  readonly body: string;
  readonly slots: readonly string[];
}): ReactElement {
  const { own } = keywordSlots(slots);
  const lead = [kind, own.length === 0 ? undefined : `Asks for: ${own.join(", ")}`].filter(
    (part) => part !== undefined,
  );
  return (
    <span className="flex min-w-0 gap-1">
      {lead.length === 0 ? null : (
        <span className="shrink-0 text-ink">{`${lead.join(" · ")} ·`}</span>
      )}
      <span className="min-w-0 truncate">{bodyExcerpt(body)}</span>
    </span>
  );
}

// The first words of a prompt, on one line.
function bodyExcerpt(body: string, length = 90): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length <= length ? flat : `${flat.slice(0, length).trimEnd()}…`;
}
