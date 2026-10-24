import { keywordOf } from "@app/slices/keywords/specs.js";
import { Link } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import type { LibraryItemKind, UsedBy } from "@/api";
import { keywordLabel } from "@/components/keyword-insert-bar";
import { Button } from "@/components/kit/button";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { SlotChip } from "@/components/slot-chip";
import { keywordSlots } from "@/lib/draft-lint";
import { plural } from "@/lib/format";
import { useLibraryHistory, useLibraryUsedBy } from "./history-drawer";

// The detail beside a prompt list: the selected prompt or intro/outro's text, what it asks you
// for each time, and one line of bookkeeping (when it changed, its versions, what uses it).
// Compare versions appears once there are two to compare; every version and Restore are in
// the History drawer.
export function LibraryItemDetail({
  item,
  id,
  name,
  kicker,
  meta,
  body,
  slots,
  actions,
  onOpenHistory,
}: {
  readonly item: LibraryItemKind;
  readonly id: string;
  readonly name: string;
  readonly kicker: string;
  // "Updated Oct 24, 2026": the versions and what uses it follow on the same line.
  readonly meta: ReactNode;
  readonly body: string;
  readonly slots: readonly string[];
  // Edit, as a link to the editor.
  readonly actions: ReactNode;
  readonly onOpenHistory: () => void;
}): ReactElement {
  const history = useLibraryHistory(item, id);
  const usedBy = useLibraryUsedBy(item, id);
  const versions = history.data?.versions.length;
  const used = usedBy.data;
  const { own, filled } = keywordSlots(slots);
  return (
    <section aria-label={`${name} details`} className="flex min-w-0 flex-col gap-4">
      <SectionHead
        title={name}
        kicker={kicker}
        meta={
          <>
            {meta}
            {versions === undefined ? null : ` · ${plural(versions, "version")}`}
            {used === undefined ? null : ` · ${usedBySummary(used)}`}
          </>
        }
        className="pb-0"
      >
        {versions === undefined || versions < 2 ? null : (
          <Button size="small" aria-label={`Compare versions of ${name}`} onClick={onOpenHistory}>
            Compare versions
          </Button>
        )}
        {actions}
      </SectionHead>
      <PromptText body={body} />
      <section aria-label="Asks you for" className="flex flex-col gap-2">
        <h3 className="sl-section-head__title text-title-3">Asks you for</h3>
        {own.length === 0 ? (
          <p className="m-0 text-small text-ink-2">Nothing: it runs as written.</p>
        ) : (
          <>
            <ul aria-label="Keywords" className="m-0 flex list-none flex-wrap gap-2 p-0">
              {own.map((slot) => (
                <li key={slot} className="flex">
                  <SlotChip name={slot} className="px-2 py-1 text-ink" />
                </li>
              ))}
            </ul>
            <p className="m-0 text-small text-ink-2">
              You answer {own.length === 1 ? "this" : "these"} each time you make a video with it.
            </p>
          </>
        )}
        {filled.length === 0 ? null : (
          <p className="m-0 text-small text-ink-2">
            {`Slopify fills in: ${filled.map((one) => keywordLabel(keywordOf(one)?.name ?? one)).join(", ")}.`}
          </p>
        )}
      </section>
      {usedBy.error === null ? null : (
        <p className="m-0 text-small text-danger">
          {`What uses it couldn't be read: ${usedBy.error.message}`}
        </p>
      )}
      {history.error === null ? null : (
        <p className="m-0 text-small text-danger">
          {`The versions couldn't be read: ${history.error.message}`}
        </p>
      )}
      {used === undefined || usedByTotal(used) === 0 ? null : <UsedByList usedBy={used} />}
    </section>
  );
}

// The prompt as it reads: prose in the reading face, with each `{{keyword}}` in the accent
// colour so the blanks stand out.
function PromptText({ body }: { readonly body: string }): ReactElement {
  const parts = body.split(/(\{\{[^{}]*\}\})/u);
  let at = 0;
  return (
    <div
      data-slot="prompt-text"
      className="m-0 max-h-[60vh] min-w-0 overflow-y-auto whitespace-pre-wrap break-words rounded-media bg-sunken px-4 py-3 text-body text-ink"
    >
      {parts.map((part) => {
        const start = at;
        at += part.length;
        return part.startsWith("{{") && part.endsWith("}}") ? (
          <span key={start} className="font-medium text-accent-ink">
            {part}
          </span>
        ) : (
          part
        );
      })}
    </div>
  );
}

function UsedByList({ usedBy }: { readonly usedBy: UsedBy }): ReactElement {
  return (
    <section aria-label="Used by" className="flex flex-col gap-2">
      <h3 className="sl-section-head__title text-title-3">Used by</h3>
      <List label="Used by">
        {usedBy.templates.map((one) => (
          <ListRow
            key={`t-${one.id}`}
            title={<Link to="/templates">{one.name}</Link>}
            meta="Template"
          />
        ))}
        {usedBy.schedules.map((one) => (
          <ListRow
            key={`s-${one.id}`}
            title={
              <Link to="/calendar" search={{ tab: "schedules", schedule: one.id }}>
                {one.name}
              </Link>
            }
            meta={one.status === "paused" ? "Schedule · paused" : "Schedule"}
          />
        ))}
        {usedBy.projects.map((one) => (
          <ListRow
            key={`p-${one.id}`}
            title={
              <Link to="/projects/$projectId" params={{ projectId: one.id }}>
                {one.title}
              </Link>
            }
            meta={`Project${
              one.totalRevisions === 0
                ? ""
                : ` · ${String(one.revisions)} of ${String(one.totalRevisions)} ${one.totalRevisions === 1 ? "revision" : "revisions"}${one.current ? ", including the current one" : ", not the current one"}`
            }`}
          />
        ))}
      </List>
    </section>
  );
}

function usedByTotal(usedBy: UsedBy): number {
  return usedBy.templates.length + usedBy.schedules.length + usedBy.projects.length;
}

// "not used yet", "used by History starter", "used by 2 templates and 1 project".
export function usedBySummary(usedBy: UsedBy): string {
  const names = [
    ...usedBy.templates.map((one) => one.name),
    ...usedBy.schedules.map((one) => one.name),
    ...usedBy.projects.map((one) => one.title),
  ];
  if (names.length === 0) return "not used yet";
  if (names.length === 1) return `used by ${names[0] ?? ""}`;
  const counts = [
    usedBy.templates.length === 0 ? undefined : plural(usedBy.templates.length, "template"),
    usedBy.schedules.length === 0 ? undefined : plural(usedBy.schedules.length, "schedule"),
    usedBy.projects.length === 0 ? undefined : plural(usedBy.projects.length, "project"),
  ].filter((part) => part !== undefined);
  return `used by ${counts.join(", ")}`;
}

// "1 Sep 2026": the day a row was last saved, for its meta line.
export function updatedOn(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}
