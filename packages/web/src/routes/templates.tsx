import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { StatusSlot } from "@/components/kit/action-bar";
import { Drawer } from "@/components/kit/drawer";
import { useToast } from "@/components/kit/toast";
import { RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listPlayDrafts, readPlayDraft } from "@/play/draft-api";
import {
  deleteProjectTemplate,
  instantiateProjectTemplate,
  saveProjectTemplate,
  type TemplateSummary,
  templatesKey,
  templatesQuery,
} from "@/templates/api";
import { LibraryToolbar } from "./library.js";

export function TemplatesRoute({
  onApplied,
  beforeApply,
  getGeneration,
  blocked = false,
}: {
  readonly onApplied: (draftId: string, isCurrent: () => boolean) => unknown | Promise<unknown>;
  readonly beforeApply?: () => Promise<boolean>;
  readonly getGeneration?: () => number;
  readonly blocked?: boolean;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const templates = useQuery(templatesQuery(api));
  const drafts = useQuery({
    queryKey: ["play-drafts"],
    queryFn: async () => {
      const reply = await listPlayDrafts(api);
      if (!reply.ok) throw new Error(reply.message);
      return reply.value.drafts;
    },
  });
  const [draftId, setDraftId] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notify = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<TemplateSummary | null>(null);
  const active = useRef(false);
  const saveIdentity = useRef<{ readonly key: string; readonly id: string } | null>(null);
  const applications = useRef(new Map<string, string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function execute(action: () => Promise<void>): Promise<void> {
    if (active.current) return;
    active.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The template action could not finish.");
    } finally {
      active.current = false;
      setPending(false);
    }
  }
  async function save(): Promise<void> {
    const draft = await readPlayDraft(api, draftId);
    if (!draft.ok) throw new Error(draft.message);
    const key = JSON.stringify([draftId, draft.value.draft.version, name.trim()]);
    if (saveIdentity.current?.key !== key) saveIdentity.current = { key, id: crypto.randomUUID() };
    const reply = await saveProjectTemplate(api, {
      id: saveIdentity.current.id,
      name: name.trim(),
      document: draft.value.draft.document,
    });
    if (!reply.ok) {
      saveIdentity.current = null;
      throw new Error(reply.message);
    }
    saveIdentity.current = null;
    setName("");
    setSaving(false);
    notify("Template saved.", "success");
    await client.invalidateQueries({ queryKey: templatesKey });
  }
  async function apply(template: TemplateSummary): Promise<void> {
    const startGeneration = getGeneration?.();
    if (blocked || (beforeApply && !(await beforeApply())))
      throw new Error("Resolve the current Play draft before applying a template.");
    if (
      !mounted.current ||
      (startGeneration !== undefined && startGeneration !== getGeneration?.())
    )
      return;
    const key = `${template.id}:${template.version}`;
    let id = applications.current.get(key);
    if (!id) {
      id = crypto.randomUUID();
      applications.current.set(key, id);
    }
    const reply = await instantiateProjectTemplate(api, template, id);
    if (!reply.ok) {
      applications.current.delete(key);
      throw new Error(reply.message);
    }
    if (
      !mounted.current ||
      (startGeneration !== undefined && startGeneration !== getGeneration?.())
    )
      return;
    await client.invalidateQueries({ queryKey: ["play-drafts"] });
    if (
      !mounted.current ||
      (startGeneration !== undefined && startGeneration !== getGeneration?.())
    )
      return;
    const opened = await onApplied(reply.value.draft.id, () => mounted.current);
    if (opened !== false) applications.current.delete(key);
    else throw new Error("The new template draft could not be opened. Try again.");
  }
  async function remove(): Promise<void> {
    if (!deleting) return;
    const deletedId = deleting.id;
    const reply = await deleteProjectTemplate(api, deleting);
    if (!reply.ok) throw new Error(reply.message);
    setDeleting(null);
    await client.cancelQueries({ queryKey: templatesKey });
    client.setQueryData<readonly TemplateSummary[]>(templatesKey, (current) =>
      current?.filter((template) => template.id !== deletedId),
    );
    notify("Template deleted.", "success");
    await client.invalidateQueries({ queryKey: templatesKey });
  }
  const status =
    error && !deleting
      ? ({ tone: "error", text: error } as const)
      : blocked
        ? ({
            tone: "warning",
            text: "Resolve the pending Start in Play before applying a template.",
          } as const)
        : templates.error
          ? ({ tone: "error", text: templates.error.message } as const)
          : templates.isPending
            ? ({ tone: "info", text: "Loading templates…" } as const)
            : undefined;
  return (
    <div>
      <LibraryToolbar
        action={
          <Button type="button" onClick={() => setSaving(true)} aria-expanded={saving}>
            <PlusIcon aria-hidden="true" className="size-[14px]" />
            Save a setup
          </Button>
        }
      >
        <p className="text-small text-ink2">
          Reuse a Play setup and its checkpoint choices. Apply creates a fresh draft to review.
        </p>
      </LibraryToolbar>
      <div className="mb-2 flex min-h-8 items-center gap-3">
        <StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>
        {templates.error ? (
          <Button type="button" onClick={() => void templates.refetch()}>
            Reload templates
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          disabled={pending || templates.isFetching}
          onClick={() => void templates.refetch()}
        >
          Refresh templates
        </Button>
      </div>
      {templates.data?.length === 0 ? (
        <RailGroup>
          <p className="px-4 py-6 text-ink2">
            No templates yet. Use Save a setup to keep a Play draft for reuse.
          </p>
        </RailGroup>
      ) : null}
      {templates.data?.length ? (
        <ul
          className="overflow-hidden rounded-panel border border-line bg-panel"
          aria-label="Project templates"
        >
          {templates.data.map((template) => (
            <li
              key={template.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-[10px] last:border-b-0"
            >
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                <h2 className="break-words font-semibold">{template.name}</h2>
                <p className="text-small text-ink3">
                  Version {template.version} · Updated{" "}
                  <time dateTime={template.updatedAt}>{template.updatedAt.slice(0, 10)}</time>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  aria-label={`Apply ${template.name}`}
                  disabled={pending || blocked}
                  onClick={() => void execute(() => apply(template))}
                >
                  Apply to Play
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Delete ${template.name}`}
                  disabled={pending}
                  onClick={() => {
                    setDeleting(template);
                    setError(null);
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <Drawer
        open={saving}
        title="Save a setup"
        width="narrow"
        onClose={() => setSaving(false)}
        footer={
          <>
            <StatusSlot tone={error ? "error" : "info"}>
              {error ?? (pending ? "Saving…" : undefined)}
            </StatusSlot>
            <Button
              type="submit"
              form="save-template-form"
              variant="primary"
              disabled={pending || !draftId || !name.trim()}
            >
              Save template
            </Button>
          </>
        }
      >
        <p className="mb-4 text-small text-ink2">
          Choose a saved Play draft, or{" "}
          <Link to="/play" className="underline">
            open Play
          </Link>{" "}
          to prepare one.
        </p>
        <form
          id="save-template-form"
          aria-label="Save a setup"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (draftId && name.trim()) void execute(save);
          }}
        >
          <label className="block space-y-1">
            <span className="engraved text-ink3">Saved Play draft</span>
            <select
              className="h-8 w-full rounded-control border border-line2 bg-panel2 px-2"
              value={draftId}
              required
              disabled={pending}
              onChange={(event) => setDraftId(event.target.value)}
            >
              <option value="">Choose a draft</option>
              {drafts.data
                ?.filter((draft) => draft.readable)
                .map((draft) => (
                  <option key={draft.id} value={draft.id}>
                    {draft.title || "Untitled draft"}
                  </option>
                ))}
            </select>
          </label>
          {drafts.isPending ? (
            <p role="status" className="text-small text-ink2">
              Loading saved drafts…
            </p>
          ) : null}
          {drafts.data?.length === 0 ? (
            <p className="text-small text-ink2">No saved drafts yet.</p>
          ) : null}
          {drafts.error ? (
            <p role="alert" className="text-small text-red">
              {drafts.error.message}{" "}
              <Button type="button" onClick={() => void drafts.refetch()}>
                Reload drafts
              </Button>
            </p>
          ) : null}
          <label className="block space-y-1" htmlFor="template-name">
            <span className="engraved text-ink3">Template name</span>
            <Input
              id="template-name"
              value={name}
              required
              maxLength={120}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </form>
      </Drawer>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "template"}?`}
        consequence={error ?? "Existing projects and drafts keep their setup."}
        verb="Delete template"
        pending={pending}
        onConfirm={() => void execute(remove)}
        onCancel={() => {
          if (!pending) setDeleting(null);
        }}
      />
    </div>
  );
}
