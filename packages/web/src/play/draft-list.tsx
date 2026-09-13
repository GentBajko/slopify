import type { DraftSummary } from "@app/slices/play-drafts/model.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { startedAt } from "@/lib/utils";
import { listPlayDrafts } from "./draft-api";
import { usePlaySession } from "./draft-context";

export function DraftList(): ReactElement {
  const { api } = useApp();
  const session = usePlaySession();
  const [confirm, setConfirm] = useState<DraftSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    setError(null);
    try {
      await session.discard({ id: confirm.id, version: confirm.version });
      setConfirm(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Couldn't discard draft");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Drafts" className="min-w-0 max-w-full text-small">
      <div className="flex flex-wrap items-start gap-2">
        <details className="max-w-full rounded-control border border-line bg-panel px-3">
          <summary className="flex min-h-10 cursor-pointer items-center font-semibold">
            Drafts
          </summary>
          {list.isPending ? <p role="status">Loading drafts…</p> : null}
          {list.error ? (
            <p role="alert">
              {list.error.message}
              <button type="button" onClick={() => void list.refetch()}>
                Retry
              </button>
            </p>
          ) : null}
          {list.data?.length === 0 ? <p>No saved drafts</p> : null}
          <ul className="max-h-72 max-w-[320px] overflow-y-auto pb-2">
            {list.data?.map((draft) => (
              <li
                key={draft.id}
                className="flex flex-wrap items-center gap-2 border-t border-line py-2"
              >
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="w-full break-words text-left"
                    onClick={() => void session.open(draft.id)}
                  >
                    <span className="block">{draft.title || "Untitled draft"}</span>
                  </button>
                  <time dateTime={draft.updatedAt} className="block text-label text-ink3">
                    Last edited {startedAt(draft.updatedAt)}
                  </time>
                </div>
                {!draft.readable ? (
                  <p>Unsupported or corrupt draft. Try opening it to recover, or discard it.</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setConfirm(draft);
                    setError(null);
                  }}
                  aria-label={`Discard ${draft.title || "Untitled draft"}`}
                >
                  Discard
                </button>
              </li>
            ))}
          </ul>
        </details>
        <Button onClick={() => void session.newDraft()}>New draft</Button>
      </div>
      <p role="status" className="mt-2 text-small text-ink3">
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
      {error ? <p role="alert">{error}</p> : null}
      {session.error ? <p role="alert">Couldn't save. {session.error}</p> : null}
      {session.status === "error" ? (
        <button
          type="button"
          onClick={() => {
            if (!session.view && session.activeId && session.edited === 0)
              void session.open(session.activeId);
            else void session.flush();
          }}
        >
          Retry
        </button>
      ) : null}
      {session.status === "conflict" ? (
        <>
          <button
            type="button"
            onClick={() => {
              if (session.activeId) void session.open(session.activeId);
            }}
          >
            Reload saved draft
          </button>
          <button type="button" onClick={() => void session.saveAsNew()}>
            Save as a new draft
          </button>
        </>
      ) : null}
    </section>
  );
}
