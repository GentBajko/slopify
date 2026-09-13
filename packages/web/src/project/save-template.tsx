import { useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useId, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { saveTemplateFromProject, templatesKey } from "@/templates/api";

export function SaveProjectTemplate({
  projectId,
  revisionId,
  title,
}: {
  readonly projectId: string;
  readonly revisionId: string | null;
  readonly title: string;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const inputId = useId();
  const [editing, setEditing] = useState<{
    readonly revisionId: string;
    readonly name: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const active = useRef(false);
  const identity = useRef<{ readonly key: string; readonly id: string } | null>(null);
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
      setEditing(null);
      setSaved(true);
      await client.invalidateQueries({ queryKey: templatesKey });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the template.");
    } finally {
      active.current = false;
      setPending(false);
    }
  }
  return (
    <>
      <Button
        disabled={revisionId === null || pending}
        onClick={() => {
          if (revisionId === null) return;
          setEditing({ revisionId, name: title });
          setError(null);
          setSaved(false);
        }}
      >
        Save as template
      </Button>
      {saved ? <p role="status">Template saved.</p> : null}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !active.current) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Save this revision’s setup for a fresh Play draft. This does not rebuild the project.
          </DialogDescription>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label htmlFor={inputId}>Template name</label>
            <Input
              id={inputId}
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
            {error ? (
              <p role="alert" className="text-red">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" disabled={pending} onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !editing?.name.trim()}>
                Save template
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
