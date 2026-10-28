import { render } from "@app/slices/admission/substitute.js";
import type { DraftSummary } from "@app/slices/play-drafts/model.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { List, ListRow } from "@/components/kit/list-row";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/kit/popover";
import { useToast } from "@/components/kit/toast";
import { exactTime, startedAt } from "@/lib/utils";
import { keys } from "@/queries";
import { listPlayDrafts } from "./draft-api";
import { usePlaySession } from "./draft-context";

// A draft's name as a person reads it: its title once every keyword in it is filled, else
// "Untitled". Never a raw {{Topic}}.
export function draftName(form: {
  readonly title: string;
  readonly values: Readonly<Record<string, string>>;
}): string {
  const values = Object.fromEntries(
    Object.entries(form.values).filter(([, value]) => value.trim() !== ""),
  );
  const title = render(form.title, values).trim();
  return title === "" || title.includes("{{") ? "Untitled" : title;
}

const saved: Readonly<Record<string, string>> = {
  unsaved: "Not saved yet",
  saving: "Saving…",
  saved: "Saved. Every change is saved as you go.",
  error: "Couldn't save",
  conflict: "Changed in another tab",
};

// "Draft: Untitled ▾" in Create's header: the draft being set up, and a menu with whether it
// is saved, New draft, and the saved drafts to open again or delete. Only a draft that could
// not be saved, or was changed in another tab, says so beside it, with the way out.
export function DraftList({
  onSaveTemplate,
}: {
  // On a phone, Save as template sits in this menu rather than in the page header.
  readonly onSaveTemplate?: () => void;
} = {}): ReactElement {
  const { api } = useApp();
  const session = usePlaySession();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<DraftSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const notify = useToast();
  const list = useQuery({
    queryKey: keys.playDrafts,
    queryFn: async () => {
      const reply = await listPlayDrafts(api);
      if (!reply.ok) throw new Error(reply.message);
      return reply.value.drafts;
    },
  });
  const discard = async () => {
    if (!confirm || busy) return;
    const discardedId = confirm.id;
    setBusy(true);
    setError(null);
    try {
      await session.discard({ id: confirm.id, version: confirm.version });
      setConfirm(null);
      await queryClient.cancelQueries({ queryKey: keys.playDrafts });
      queryClient.setQueryData<readonly DraftSummary[]>(keys.playDrafts, (current) =>
        current?.filter((draft) => draft.id !== discardedId),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The draft wasn't deleted. Press Delete on it again.";
      setError(message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  };
  const name = draftName(session.document.form);
  return (
    <section aria-label="Draft" className="flex min-w-0 flex-wrap items-center gap-2 text-small">
      {session.status === "error" ? (
        <>
          <span role="alert" className="text-danger">
            Couldn't save
          </span>
          <Button
            variant="quiet"
            size="small"
            onClick={() => {
              if (!session.view && session.activeId && session.edited === 0)
                void session.open(session.activeId);
              else void session.flush();
            }}
          >
            Retry
          </Button>
        </>
      ) : null}
      {session.status === "conflict" ? (
        <>
          <span role="alert" className="text-waiting">
            Changed in another tab.
          </span>
          <Button
            variant="quiet"
            size="small"
            onClick={() => {
              if (session.activeId) void session.open(session.activeId);
            }}
          >
            Reload saved draft
          </Button>
          <Button variant="quiet" size="small" onClick={() => void session.saveAsNew()}>
            Save as a new draft
          </Button>
        </>
      ) : null}
      <Popover open={menu} onOpenChange={setMenu}>
        <PopoverTrigger asChild>
          <Button variant="quiet" className="min-w-0 max-w-[280px]">
            <span className="truncate">Draft: {name}</span>
            <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[340px] p-0" aria-label="Drafts">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <p role="status" className="m-0 text-small text-ink-2">
              {saved[session.status]}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              {onSaveTemplate === undefined ? null : (
                <Button
                  variant="quiet"
                  size="small"
                  onClick={() => {
                    setMenu(false);
                    onSaveTemplate();
                  }}
                >
                  Save as template
                </Button>
              )}
              <Button
                size="small"
                onClick={() => {
                  setMenu(false);
                  void session.newDraft();
                }}
              >
                <PlusIcon aria-hidden="true" strokeWidth={1.75} />
                New draft
              </Button>
            </div>
          </div>
          {list.isPending ? (
            <p role="status" className="m-0 border-t border-line px-3 py-2">
              Loading drafts…
            </p>
          ) : null}
          {list.error ? (
            <p role="alert" className="m-0 border-t border-line px-3 py-2 text-danger">
              {list.error.message}{" "}
              <Button variant="quiet" onClick={() => void list.refetch()}>
                Retry
              </Button>
            </p>
          ) : null}
          {list.data?.length === 0 ? (
            <p className="m-0 border-t border-line px-3 py-2 text-ink-2">No saved drafts yet.</p>
          ) : null}
          {error ? (
            <p role="alert" className="m-0 px-3 py-2 text-danger">
              {error}
            </p>
          ) : null}
          {list.data?.length ? (
            // The title (with the topic typed in) opens the draft; Delete sits on the same line,
            // so eight or more fit.
            <List label="Saved drafts" className="max-h-80 overflow-y-auto">
              {list.data.map((draft) => {
                const title = draftName({ title: draft.title, values: {} });
                const named = title === "Untitled" ? "Untitled draft" : title;
                const open = draft.id === session.activeId;
                return (
                  <ListRow
                    key={draft.id}
                    className="grid-cols-[minmax(0,1fr)_auto] gap-2 px-3 py-1.5"
                    title={named}
                    onSelect={() => {
                      setMenu(false);
                      void session.open(draft.id);
                    }}
                    meta={
                      <>
                        {open ? "Open now · " : null}
                        <time dateTime={draft.updatedAt} title={exactTime(draft.updatedAt)}>
                          Last edited {startedAt(draft.updatedAt)}
                        </time>
                      </>
                    }
                    actions={
                      <Button
                        variant="quiet"
                        size="small"
                        aria-label={`Delete ${named}`}
                        onClick={() => {
                          setConfirm(draft);
                          setError(null);
                        }}
                      >
                        Delete
                      </Button>
                    }
                  >
                    {draft.readable ? null : (
                      <p className="m-0 text-label text-waiting">
                        Unsupported or corrupt draft. Try opening it to recover, or delete it.
                      </p>
                    )}
                  </ListRow>
                );
              })}
            </List>
          ) : null}
        </PopoverContent>
      </Popover>
      <ConfirmDialog
        open={confirm !== null}
        title={`Delete ${
          confirm === null || draftName({ title: confirm.title, values: {} }) === "Untitled"
            ? "Untitled draft"
            : draftName({ title: confirm.title, values: {} })
        }?`}
        consequence="The saved draft is deleted for good; it does not go to the trash."
        confirmLabel="Delete draft"
        pending={busy}
        onConfirm={() => void discard()}
        onCancel={() => {
          if (!busy) setConfirm(null);
        }}
      />
    </section>
  );
}
