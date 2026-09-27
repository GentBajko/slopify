import type { DraftSummary } from "@app/slices/play-drafts/model.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, Trash2Icon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button, IconButton } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { InfoTip } from "@/components/kit/info-tip";
import { List, ListRow } from "@/components/kit/list-row";
import { useToast } from "@/components/kit/toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, startedAt } from "@/lib/utils";
import { listPlayDrafts } from "./draft-api";
import { usePlaySession } from "./draft-context";

export function DraftList(): ReactElement {
  const { api } = useApp();
  const session = usePlaySession();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<DraftSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  const list = useQuery({
    queryKey: ["play-drafts"],
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
      await queryClient.cancelQueries({ queryKey: ["play-drafts"] });
      queryClient.setQueryData<readonly DraftSummary[]>(["play-drafts"], (current) =>
        current?.filter((draft) => draft.id !== discardedId),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The draft wasn't discarded. Try again.";
      setError(message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Drafts" className="flex min-w-0 flex-wrap items-center gap-2 text-small">
      <p
        role="status"
        className={cn(
          "engraved min-w-[112px] text-right",
          session.status === "saved"
            ? "text-done"
            : session.status === "error" || session.status === "conflict"
              ? "text-red"
              : "text-ink3",
        )}
      >
        {
          {
            unsaved: "Unsaved",
            saving: "Saving…",
            saved: "Saved",
            error: "Couldn't save",
            conflict: "Changed elsewhere",
          }[session.status]
        }
      </p>
      {session.status === "error" ? (
        <Button
          variant="quiet"
          onClick={() => {
            if (!session.view && session.activeId && session.edited === 0)
              void session.open(session.activeId);
            else void session.flush();
          }}
        >
          Retry
        </Button>
      ) : null}
      {session.status === "conflict" ? (
        <>
          <Button
            variant="quiet"
            onClick={() => {
              if (session.activeId) void session.open(session.activeId);
            }}
          >
            Reload saved draft
          </Button>
          <Button variant="quiet" onClick={() => void session.saveAsNew()}>
            Save as a new draft
          </Button>
          <InfoTip id="play.draft-conflict" />
        </>
      ) : null}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="quiet">
            Drafts
            <ChevronDownIcon aria-hidden="true" className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[340px] p-0" aria-label="Saved drafts">
          {list.isPending ? (
            <p role="status" className="px-3 py-2">
              Loading drafts…
            </p>
          ) : null}
          {list.error ? (
            <p role="alert" className="px-3 py-2 text-red">
              {list.error.message}{" "}
              <Button variant="quiet" onClick={() => void list.refetch()}>
                Retry
              </Button>
            </p>
          ) : null}
          {list.data?.length === 0 ? <p className="px-3 py-2">No saved drafts</p> : null}
          {error ? (
            <p role="alert" className="px-3 py-2 text-red">
              {error}
            </p>
          ) : null}
          {list.data?.length ? (
            // The title opens the draft; Discard sits on the row.
            <List label="Saved drafts" className="max-h-72 overflow-y-auto border-t-0">
              {list.data.map((draft) => (
                <ListRow
                  key={draft.id}
                  title={draft.title || "Untitled draft"}
                  onSelect={() => void session.open(draft.id)}
                  meta={
                    <time dateTime={draft.updatedAt}>Last edited {startedAt(draft.updatedAt)}</time>
                  }
                  actions={
                    <IconButton
                      size="small"
                      label={`Discard ${draft.title || "Untitled draft"}`}
                      onClick={() => {
                        setConfirm(draft);
                        setError(null);
                      }}
                    >
                      <Trash2Icon aria-hidden="true" />
                    </IconButton>
                  }
                >
                  {draft.readable ? null : (
                    <p className="m-0 text-label text-amber">
                      Unsupported or corrupt draft. Try opening it to recover, or discard it.
                    </p>
                  )}
                </ListRow>
              ))}
            </List>
          ) : null}
        </PopoverContent>
      </Popover>
      <Button onClick={() => void session.newDraft()}>New draft</Button>
      <InfoTip id="play.drafts" />
      <ConfirmDialog
        open={confirm !== null}
        title={`Discard ${confirm?.title || "Untitled draft"}?`}
        consequence="The draft is removed. This cannot be undone."
        confirmLabel="Discard draft"
        pending={busy}
        onConfirm={() => void discard()}
        onCancel={() => {
          if (!busy) setConfirm(null);
        }}
      />
    </section>
  );
}
