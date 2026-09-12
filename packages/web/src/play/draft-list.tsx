import type { DraftSummary } from "@app/slices/play-drafts/model.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { discardPlayDraft, listPlayDrafts } from "./draft-api";
import { usePlaySession } from "./draft-context";

export function DraftList(): ReactElement {
  const { api } = useApp();
  const session = usePlaySession();
  const current = useRef(session);
  current.current = session;
  const client = useQueryClient();
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
      if (session.activeId === confirm.id && session.view) {
        await session.discard();
        setConfirm(null);
        return;
      }
      const reply = await discardPlayDraft(api, { id: confirm.id, baseVersion: confirm.version });
      if (!reply.ok) {
        setError(reply.message);
        return;
      }
      if (current.current.activeId === confirm.id && !current.current.view)
        await current.current.newDraft();
      setConfirm(null);
      await client.invalidateQueries({ queryKey: ["play-drafts"] });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Couldn't discard draft");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Drafts">
      <h2>Drafts</h2>
      <button type="button" onClick={() => void session.newDraft()}>
        New draft
      </button>
      <p role="status">
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
      <ul>
        {list.data?.map((draft) => (
          <li key={draft.id}>
            <button type="button" onClick={() => void session.open(draft.id)}>
              {draft.title || "Untitled draft"}
            </button>
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
              if (session.view) void session.open(session.view.draft.id);
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
