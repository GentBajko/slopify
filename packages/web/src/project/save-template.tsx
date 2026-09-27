import { useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Dialog } from "@/components/kit/dialog";
import { Field, Input } from "@/components/kit/field";
import { useToast } from "@/components/kit/toast";
import { saveTemplateFromProject, templatesKey } from "@/templates/api";

// Save as template: the current revision's setup as a template for a fresh Play draft. Opened
// from the project's More menu or the command palette.
export function SaveProjectTemplate({
  projectId,
  revisionId,
  title,
  open,
  onClose,
}: {
  readonly projectId: string;
  readonly revisionId: string | null;
  readonly title: string;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const [editing, setEditing] = useState<{
    readonly revisionId: string;
    readonly name: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notify = useToast();
  const active = useRef(false);
  const identity = useRef<{ readonly key: string; readonly id: string } | null>(null);
  useEffect(() => {
    if (open && revisionId !== null) {
      setEditing({ revisionId, name: title });
      setError(null);
    }
    if (!open) setEditing(null);
  }, [open, revisionId, title]);
  async function save(): Promise<void> {
    if (!editing || active.current || !editing.name.trim()) return;
    active.current = true;
    setPending(true);
    setError(null);
    const key = JSON.stringify([projectId, editing.revisionId, editing.name.trim()]);
    if (identity.current?.key !== key) identity.current = { key, id: crypto.randomUUID() };
    try {
      const reply = await saveTemplateFromProject(api, projectId, {
        id: identity.current.id,
        name: editing.name.trim(),
        revisionId: editing.revisionId,
      });
      if (!reply.ok) {
        identity.current = null;
        setError(reply.message);
        return;
      }
      identity.current = null;
      onClose();
      notify("Template saved.", "success");
      await client.invalidateQueries({ queryKey: templatesKey });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The template wasn't saved. Press Save template to try again.",
      );
    } finally {
      active.current = false;
      setPending(false);
    }
  }
  return (
    <Dialog
      open={open && editing !== null}
      onOpenChange={(next) => {
        if (!next && !active.current) onClose();
      }}
      title="Save as template"
      description="Save this revision’s setup for a fresh Play draft. This does not rebuild the project."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="Template name" tip="play.template-name">
          <Input
            autoFocus
            required
            maxLength={200}
            disabled={pending}
            value={editing?.name ?? ""}
            onChange={(event) => {
              const name = event.target.value;
              setEditing((current) => (current ? { ...current, name } : current));
            }}
          />
        </Field>
        {error ? (
          <p role="alert" className="m-0 text-small text-danger">
            {error}
          </p>
        ) : null}
        <div className="sl-dialog__foot">
          <Button disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={pending || !editing?.name.trim()}>
            Save template
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
