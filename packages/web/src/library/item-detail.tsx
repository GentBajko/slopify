import { keywordOf } from "@app/slices/keywords/specs.js";
import { Link } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import type { LibraryItemKind, UsedBy } from "@/api";
import { keywordLabel } from "@/components/keyword-insert-bar";
import { Button } from "@/components/kit/button";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { ownKeywordLook } from "@/components/slot-body";
import { SlotChip } from "@/components/slot-chip";
import { keywordSlots } from "@/lib/draft-lint";
import { plural } from "@/lib/format";
import { useLibraryHistory, useLibraryUsedBy } from "./history-drawer";

// The detail beside a prompt list: the selected prompt or intro/outro's text, what it asks you
// for each time, one line of bookkeeping (when it changed, its versions) and what uses it, said
// once: "not used yet" on that line, or the Used by list under the text. Compare versions
// appears once there are two to compare; every version and Restore are in the Versions drawer.
// The list's head already names the kind, so the detail opens on the name.
export function LibraryItemDetail({
  item,
  id,
  name,
  meta,
  body,
  slots,
  actions,
  onOpenHistory,
}: {
  readonly item: LibraryItemKind;
  readonly id: string;
  readonly name: string;
  // "Updated Oct 24, 2026": the versions, and "not used yet", follow on the same line.
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
        meta={
          <>
            {meta}
            {versions === undefined ? null : ` · ${plural(versions, "version")}`}
            {used === undefined || usedByTotal(used) > 0 ? null : " · not used yet"}
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
        <SectionHead title="Asks you for" as="h3" className="pb-0" />
        {own.length === 0 ? (
          <p className="m-0 text-small text-ink-2">Nothing: it runs as written.</p>
        ) : (
          <>
            <ul aria-label="Keywords" className="m-0 flex list-none flex-wrap gap-2 p-0">
              {own.map((slot) => (
                <li key={slot} className="flex">
                  <SlotChip
                    name={slot}
                    className="border-accent/40 bg-accent-tint px-2 py-1 text-ink"
                  />
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

// The prompt as it reads: prose in the reading face, marked as the editor marks it. A keyword
// of your own (the question you answer on Create) is highlighted; one Slopify fills is in
// accent ink.
function PromptText({ body }: { readonly body: string }): ReactElement {
  const parts = body.split(/(\{\{[^{}\n]*\}\})/u);
  let at = 0;
  return (
    <div
      data-slot="prompt-text"
      className="m-0 max-h-[60vh] min-w-0 overflow-y-auto whitespace-pre-wrap break-words rounded-media bg-sunken px-4 py-3 text-body text-ink"
    >
      {parts.map((part) => {
        const start = at;
        at += part.length;
        if (!(part.startsWith("{{") && part.endsWith("}}"))) return part;
        const name = part.slice(2, -2).trim();
        if (name === "") return part;
        return keywordOf(name) === undefined ? (
          <span key={start} data-own-keyword="" className={ownKeywordLook}>
            {part}
          </span>
        ) : (
          <span key={start} className="text-accent-ink">
            {part}
          </span>
        );
      })}
    </div>
  );
}

function UsedByList({ usedBy }: { readonly usedBy: UsedBy }): ReactElement {
  return (
    <section aria-label="Used by" className="flex flex-col gap-2">
      <SectionHead title="Used by" as="h3" className="pb-0" />
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
                : ` · ${String(one.revisions)} of ${String(one.totalRevisions)} ${one.totalRevisions === 1 ? "version" : "versions"}${one.current ? ", including the current one" : ", not the current one"}`
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

// "1 Sep 2026": the day a row was last saved, for its meta line.
export function updatedOn(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}
