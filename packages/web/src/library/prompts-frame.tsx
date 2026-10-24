import type { EntryCategory, PromptKind } from "@app/slices/library/model.js";
import { entryCategories, promptKinds } from "@app/slices/library/model.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useApp } from "@/app-context";
import { PageHeader, Workspace } from "@/components/kit/layout";
import { Rail, RailLink } from "@/components/kit/rail";
import { keywordSlots } from "@/lib/draft-lint";
import { categoryLabel } from "@/lib/entry-options";
import { kindLabel } from "@/lib/prompt-kinds";
import { entriesQuery, promptsQuery } from "@/queries";

// What the Prompts page is showing: one kind of prompt, or the intros or the outros (saved apart
// from prompts, with a category instead of a kind). A search spans every kind but stays on the
// page of the kind it was typed on, so that kind stays lit.
export type PromptsShown = { readonly kind: PromptKind } | { readonly category: EntryCategory };

// The Prompts page: its title and actions on one line, every kind of prompt down the left with
// how many are saved, and the list of the one picked beside it. Intros and outros sit at the
// foot of the same list: they are written like prompts and spoken before and after the video.
export function PromptsFrame({
  shown,
  actions,
  children,
}: {
  readonly shown: PromptsShown;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div>
      <PageHeader title="Prompts" actions={actions} />
      <Workspace className="sl-workspace--prompts" sections={<PromptKinds shown={shown} />}>
        {children}
      </Workspace>
    </div>
  );
}

function PromptKinds({ shown }: { readonly shown: PromptsShown }): ReactElement {
  const { api } = useApp();
  const prompts = useQuery(promptsQuery(api)).data?.prompts;
  const entries = useQuery(entriesQuery(api)).data?.entries;
  // "Article, 4" to a screen reader; the number alone on screen.
  const count = (counted: number | undefined) =>
    counted === undefined ? undefined : (
      <>
        <span className="sr-only">, </span>
        {String(counted)}
      </>
    );
  return (
    <Rail label="Kinds of prompt">
      {promptKinds.map((kind) => (
        <RailLink
          key={kind}
          to="/prompts"
          search={{ kind }}
          current={"kind" in shown && shown.kind === kind}
          meta={count(prompts?.filter((prompt) => prompt.kind === kind).length)}
        >
          {kindLabel(kind)}
        </RailLink>
      ))}
      <hr className="sl-rule my-2" />
      {entryCategories.map((category) => (
        <RailLink
          key={category}
          to="/entries"
          search={{ category }}
          current={"category" in shown && shown.category === category}
          meta={count(entries?.filter((entry) => entry.category === category).length)}
        >
          {`${categoryLabel(category)}s`}
        </RailLink>
      ))}
    </Rail>
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
export function bodyExcerpt(body: string, length = 90): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length <= length ? flat : `${flat.slice(0, length).trimEnd()}…`;
}
