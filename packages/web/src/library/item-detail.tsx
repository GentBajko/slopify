import { Link } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import type { LibraryItemKind, UsedBy } from "@/api";
import { Button } from "@/components/kit/button";
import { Code } from "@/components/kit/field";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { DiffColumns } from "./diff-view";
import { useLibraryHistory, useLibraryUsedBy, versionMeta } from "./history-drawer";

// The detail beside a Library list: the selected prompt or intro/outro's text and keywords,
// what uses it now, and its latest change as a word diff. Every version and Restore are one
// press away in the History drawer.
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
  readonly meta: string;
  readonly body: string;
  readonly slots: readonly string[];
  // Edit, as a link to the editor.
  readonly actions: ReactNode;
  readonly onOpenHistory: () => void;
}): ReactElement {
  return (
    <section aria-label={`${name} details`} className="flex min-w-0 flex-col gap-6">
      <SectionHead title={name} kicker={kicker} meta={meta} className="pb-0">
        {actions}
      </SectionHead>
      <div className="flex flex-col gap-3">
        <div className="m-0 max-h-[420px] min-w-0 overflow-y-auto whitespace-pre-wrap break-words rounded-media bg-sunken p-4 font-mono text-small text-ink-2">
          {body}
        </div>
        {slots.length === 0 ? (
          <p className="m-0 text-small text-ink-2">No keywords. It runs as written.</p>
        ) : (
          <ul aria-label="Keywords" className="m-0 flex list-none flex-wrap gap-2 p-0">
            {slots.map((slot) => (
              <li key={slot}>
                <Code>{`{{${slot}}}`}</Code>
              </li>
            ))}
          </ul>
        )}
      </div>
      <UsedBySection item={item} id={id} />
      <LatestChange item={item} id={id} name={name} onOpenHistory={onOpenHistory} />
    </section>
  );
}

function UsedBySection({
  item,
  id,
}: {
  readonly item: LibraryItemKind;
  readonly id: string;
}): ReactElement {
  const usedBy = useLibraryUsedBy(item, id);
  const data = usedBy.data;
  return (
    <section className="flex flex-col gap-2">
      <SectionHead
        title="Used by"
        as="h3"
        className="pb-0"
        info="library.used-by"
        {...(data === undefined ? {} : { meta: usedByCounts(data) })}
      />
      {usedBy.error === null ? null : (
        <p className="m-0 text-small text-danger">
          {`What uses it couldn't be read: ${usedBy.error.message}`}
        </p>
      )}
      {data === undefined ? null : data.templates.length +
          data.schedules.length +
          data.projects.length ===
        0 ? (
        <p className="m-0 text-small text-ink-2">Nothing uses it yet.</p>
      ) : (
        <List label="Used by">
          {data.templates.map((one) => (
            <ListRow
              key={`t-${one.id}`}
              title={<Link to="/templates">{one.name}</Link>}
              meta="Template"
            />
          ))}
          {data.schedules.map((one) => (
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
          {data.projects.map((one) => (
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
      )}
    </section>
  );
}

function LatestChange({
  item,
  id,
  name,
  onOpenHistory,
}: {
  readonly item: LibraryItemKind;
  readonly id: string;
  readonly name: string;
  readonly onOpenHistory: () => void;
}): ReactElement {
  const history = useLibraryHistory(item, id);
  const versions = history.data?.versions ?? [];
  const [newer, older] = versions;
  return (
    <section className="flex flex-col gap-3">
      <SectionHead
        title="History"
        as="h3"
        className="pb-0"
        info="library.history"
        {...(newer === undefined
          ? {}
          : {
              meta: `${plural(versions.length, "version")} · latest ${versionMeta(newer)}`,
            })}
      >
        <Button size="small" aria-label={`Compare versions of ${name}`} onClick={onOpenHistory}>
          Compare versions
        </Button>
      </SectionHead>
      {history.error === null ? null : (
        <p className="m-0 text-small text-danger">
          {`The history couldn't be read: ${history.error.message}`}
        </p>
      )}
      {newer === undefined ? null : older === undefined ? (
        <p className="m-0 text-small text-ink-2">Only one version so far.</p>
      ) : (
        <DiffColumns
          before={older.body}
          after={newer.body}
          beforeLabel={`Version ${String(older.version)}`}
          afterLabel={`Version ${String(newer.version)}`}
        />
      )}
    </section>
  );
}

export function usedByCounts(usedBy: UsedBy): string {
  return [
    plural(usedBy.templates.length, "template"),
    plural(usedBy.schedules.length, "schedule"),
    plural(usedBy.projects.length, "project"),
  ].join(", ");
}

export function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

// "1 Sep 2026": the day a row was last saved, for its meta line.
export function updatedOn(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}
