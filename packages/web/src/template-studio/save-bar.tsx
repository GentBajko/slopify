import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import type { StudioView } from "@app/slices/template-studio/schema.js";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { ActionBar, StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { templatesKey } from "@/templates/api";
import { saveInStudio, templateStudioKey } from "./api";

// Edit template's one Save, at the foot of the window while something changed or there is
// something to say. Save keeps the change as the template's next version and spends nothing:
// the free samples are made again on this computer, and each paid one waits for its section's
// Make sample, priced there.
export function SaveBar({
  view,
  document,
  name,
  dirty,
  note,
}: {
  readonly view: StudioView;
  readonly document: PlayDraftDocument;
  // The name as typed; an empty one keeps the saved name.
  readonly name: string;
  readonly dirty: boolean;
  // A word from the page (where files are added, a request that failed).
  readonly note?: { readonly tone: StatusTone; readonly text: string } | undefined;
}): ReactElement | null {
  const { api } = useApp();
  const client = useQueryClient();
  const id = view.template.id;
  const [status, setStatus] = useState<{ tone: StatusTone; text: string } | undefined>();
  const [saving, setSaving] = useState(false);
  const mutation = useRef(crypto.randomUUID());

  async function save(): Promise<void> {
    setSaving(true);
    setStatus({ tone: "info", text: "Saving…" });
    try {
      const reply = await saveInStudio(api, id, {
        mutationId: mutation.current,
        baseVersion: view.template.version,
        name: name.trim() === "" ? view.template.name : name.trim(),
        document,
        sample: "skip",
        acknowledgedHigh: 0,
        acknowledgedUnknown: false,
      });
      if (!reply.ok) {
        setStatus({ tone: "error", text: `The template wasn't saved: ${reply.message}` });
        return;
      }
      mutation.current = crypto.randomUUID();
      setStatus(undefined);
      await client.invalidateQueries({ queryKey: templatesKey });
      await client.invalidateQueries({ queryKey: templateStudioKey(id) });
    } catch (error) {
      setStatus({
        tone: "error",
        text: `The template wasn't saved: ${error instanceof Error ? error.message : String(error)} Press Save again.`,
      });
    } finally {
      setSaving(false);
    }
  }

  const message =
    status ??
    note ??
    (dirty
      ? { tone: "info" as const, text: "Unsaved changes. Save them before you make a video." }
      : undefined);
  if (!dirty && message === undefined) return null;
  return (
    <ActionBar
      status={
        <StatusSlot tone={message?.tone ?? "info"} wrap>
          {message?.text}
        </StatusSlot>
      }
    >
      {dirty ? (
        <Button variant="primary" disabled={saving} onClick={() => void save()}>
          Save
        </Button>
      ) : null}
    </ActionBar>
  );
}
