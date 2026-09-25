import type { DraftSummary } from "@app/slices/play-drafts/model.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { useToast } from "@/components/kit/toast";
import { Button } from "@/components/ui/button";
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
          variant="ghost"
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
            variant="ghost"
            onClick={() => {
              if (session.activeId) void session.open(session.activeId);
            }}
          >
            Reload saved draft
          </Button>
          <Button variant="ghost" onClick={() => void session.saveAsNew()}>
            Save as a new draft
          </Button>
        </>
      ) : null}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost">
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
              <Button variant="ghost" onClick={() => void list.refetch()}>
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
          <ul className="max-h-72 overflow-y-auto">
            {list.data?.map((draft) => (
              <li
                key={draft.id}
                className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2 first:border-t-0"
              >
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="w-full break-words text-left text-ink hover:underline"
                    onClick={() => void session.open(draft.id)}
                  >
                    <span className="block">{draft.title || "Untitled draft"}</span>
                  </button>
                  <time dateTime={draft.updatedAt} className="block text-label text-ink3">
                    Last edited {startedAt(draft.updatedAt)}
                  </time>
                </div>
                {!draft.readable ? (
                  <p className="basis-full text-label text-amber">
                    Unsupported or corrupt draft. Try opening it to recover, or discard it.
                  </p>
                ) : null}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setConfirm(draft);
                    setError(null);
                  }}
                  aria-label={`Discard ${draft.title || "Untitled draft"}`}
                >
                  Discard
                </Button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      <Button onClick={() => void session.newDraft()}>New draft</Button>
      <ConfirmDialog
        open={confirm !== null}
        title="Discard draft"
        consequence={`Discard ${confirm?.title || "Untitled draft"}? This cannot be undone.`}
        verb="Confirm discard"
        pending={busy}
        onConfirm={() => void discard()}
        onCancel={() => {
          if (!busy) setConfirm(null);
        }}
      />
    </section>
  );
}
