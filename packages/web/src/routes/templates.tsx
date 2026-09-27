import { templateNameMax } from "@app/slices/project-templates/schema.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment, type ReactElement, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { channelsQuery } from "@/channels/api";
import { channelOfTemplate } from "@/channels/members-tabs";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { useCommand } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Drawer } from "@/components/kit/drawer";
import { EmptyState } from "@/components/kit/empty-state";
import { Field, Input, Select } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { ListDetail } from "@/components/kit/layout";
import { List, ListRow } from "@/components/kit/list-row";
import { useToast } from "@/components/kit/toast";
import { RetiredModelRow } from "@/components/retired-models";
import { InlineName } from "@/library/inline-name";
import { ListSkeleton, libraryListDetail } from "@/library/list-states";
import { LibraryRowActions } from "@/library/row-actions";
import { PacksDrawer } from "@/onboarding/packs-drawer";
import { listPlayDrafts, readPlayDraft } from "@/play/draft-api";
import {
  deleteProjectTemplate,
  instantiateProjectTemplate,
  readProjectTemplate,
  renameProjectTemplate,
  saveProjectTemplate,
  type TemplateSummary,
  templatesKey,
  templatesQuery,
} from "@/templates/api";
import { TemplateDetail, TemplateHistoryDrawer } from "@/templates/row-parts";
import { LibraryToolbar } from "./library.js";

// Library → Templates: saved Play setups, each used in Play as a fresh draft to review. The
// rows carry the Library's row actions in view (Edit, Duplicate, Use in Play, History,
// Delete) and a pencil to rename in place; the picked row's keywords sit beside the list.
// Save a setup opens a drawer.
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
  const channels = useQuery(channelsQuery(api));
  // "" shows every channel's templates.
  const [channelFilter, setChannelFilter] = useState("");
  const shown = templates.data?.filter(
    (template) => channelFilter === "" || channelOfTemplate(template) === channelFilter,
  );
  const channelName = (template: TemplateSummary): string | undefined =>
    channels.data?.find((channel) => channel.id === channelOfTemplate(template))?.name;
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
  // "" keeps the draft's own channel.
  const [saveChannel, setSaveChannel] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notify = useToast();
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<TemplateSummary | null>(null);
  // The template shown beside the list: its keywords and how to change its settings.
  const [picked, setPicked] = useState<string | null>(null);
  const [historyOf, setHistoryOf] = useState<TemplateSummary | null>(null);
  const duplicates = useRef(new Map<string, string>());
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
      setError(error instanceof Error ? error.message : "That didn't finish. Try again.");
    } finally {
      active.current = false;
      setPending(false);
    }
  }
  async function save(): Promise<void> {
    const draft = await readPlayDraft(api, draftId);
    if (!draft.ok) throw new Error(draft.message);
    const key = JSON.stringify([draftId, draft.value.draft.version, name.trim(), saveChannel]);
    if (saveIdentity.current?.key !== key) saveIdentity.current = { key, id: crypto.randomUUID() };
    const document = draft.value.draft.document;
    // A draft that never picked a channel runs in its template's, which the server reads too.
    const source = templates.data?.find((template) => template.id === document.templateSource?.id);
    const channelId =
      saveChannel || document.channelId || (source ? channelOfTemplate(source) : undefined);
    const reply = await saveProjectTemplate(api, {
      id: saveIdentity.current.id,
      name: name.trim(),
      document: channelId === undefined ? document : { ...document, channelId },
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
      throw new Error(
        "Save or discard the draft open in Play first, then apply the template again.",
      );
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
    else
      throw new Error(
        "The template's draft was created but didn't open. Press Use in Play again to open it.",
      );
  }
  // The copy is "<name> copy" in the same channel; pressed twice for one version it is made once.
  async function duplicate(template: TemplateSummary): Promise<void> {
    const key = `${template.id}:${template.version}`;
    let id = duplicates.current.get(key);
    if (!id) {
      id = crypto.randomUUID();
      duplicates.current.set(key, id);
    }
    const read = await readProjectTemplate(api, template.id);
    if (!read.ok) throw new Error(read.message);
    const reply = await saveProjectTemplate(api, {
      id,
      name: `${template.name} copy`,
      document: read.value.document,
    });
    if (!reply.ok) throw new Error(reply.message);
    duplicates.current.delete(key);
    notify(`Duplicated as ${reply.value.name}.`, "success");
    await client.invalidateQueries({ queryKey: templatesKey });
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
    notify(
      "Template moved to the trash. Restore it in Settings → Trash within 30 days.",
      "success",
    );
    await client.invalidateQueries({ queryKey: templatesKey });
  }
  useCommand({
    id: "library.save-template",
    title: "Save a setup as a template",
    group: "Library",
    keywords: ["template", "new template", "play draft"],
    run: () => setSaving(true),
  });
  const status =
    error && !deleting
      ? ({ tone: "error", text: error } as const)
      : blocked
        ? ({
            tone: "warning",
            text: "A run is still starting in Play. Wait for it to finish (or press Check Start result there), then apply a template.",
          } as const)
        : templates.error
          ? ({ tone: "error", text: templates.error.message } as const)
          : templates.isPending
            ? ({ tone: "info", text: "Loading templates…" } as const)
            : undefined;
  return (
    <div>
      <PacksDrawer
        open={adding}
        onClose={() => setAdding(false)}
        onInstalled={() =>
          void client.invalidateQueries({ queryKey: templatesQuery(api).queryKey })
        }
      />
      <LibraryToolbar
        action={
          <>
            <span className="flex items-center gap-1">
              <Button variant="secondary" onClick={() => setAdding(true)} aria-expanded={adding}>
                Add pack
              </Button>
              <InfoTip id="welcome.packs" label="Add pack" />
            </span>
            <span className="flex items-center gap-1">
              <Button variant="primary" onClick={() => setSaving(true)} aria-expanded={saving}>
                Save a setup
              </Button>
              <InfoTip id="templates.save" label="Save a setup" />
            </span>
          </>
        }
      >
        <span className="flex w-full items-center gap-1 sm:w-auto" {...helpScope}>
          <Select
            aria-label="Show templates of"
            value={channelFilter}
            className="w-full sm:w-56"
            onChange={(event) => setChannelFilter(event.target.value)}
          >
            <option value="">All channels</option>
            {(channels.data ?? []).map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </Select>
          <InfoTip id="templates.show-channel" />
        </span>
        <p className="m-0 flex items-center gap-1 text-small text-ink-2">
          Reuse a Play setup and its checkpoint choices. Use in Play creates a fresh draft to
          review.
          <InfoTip id="templates.apply" label="Use in Play" />
        </p>
      </LibraryToolbar>
      <div className="mb-2 flex min-h-8 flex-wrap items-center gap-3">
        <StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>
        {templates.error ? (
          <Button size="small" onClick={() => void templates.refetch()}>
            Reload templates
          </Button>
        ) : null}
        <Button
          variant="quiet"
          size="small"
          disabled={pending || templates.isFetching}
          onClick={() => void templates.refetch()}
        >
          Refresh templates
        </Button>
      </div>
      {templates.data?.length === 0 ? (
        <EmptyState title="No templates yet">
          Use Save a setup to keep a Play draft for reuse.
        </EmptyState>
      ) : null}
      {templates.data?.length && shown?.length === 0 ? (
        <p className="m-0 py-3 text-small text-ink-2">No templates in this channel.</p>
      ) : null}
      {templates.isPending && !templates.error ? <ListSkeleton label="Project templates" /> : null}
      {shown?.length ? (
        <ListDetail
          className={libraryListDetail}
          list={
            <List label="Project templates">
              {shown.map((template) => (
                <Fragment key={template.id}>
                  <ListRow
                    className="max-md:grid-cols-1"
                    title={
                      <InlineName
                        name={template.name}
                        maxLength={templateNameMax}
                        onSelect={() => setPicked(template.id)}
                        onRename={async (next) => {
                          const refused = await renameProjectTemplate(api, template.id, next);
                          await client.invalidateQueries({ queryKey: templatesKey });
                          return refused;
                        }}
                      />
                    }
                    selected={template.id === picked}
                    meta={
                      <>
                        {channelName(template) === undefined ? "" : `${channelName(template)} · `}
                        Version {template.version} · updated{" "}
                        <time dateTime={template.updatedAt}>{template.updatedAt.slice(0, 10)}</time>
                      </>
                    }
                    actions={
                      <LibraryRowActions
                        name={template.name}
                        edit={
                          <Button
                            variant="quiet"
                            size="small"
                            aria-label={`Edit ${template.name}`}
                            onClick={() => setPicked(template.id)}
                          >
                            Edit
                          </Button>
                        }
                        duplicate={
                          <Button
                            variant="quiet"
                            size="small"
                            aria-label={`Duplicate ${template.name}`}
                            disabled={pending}
                            disabledReason="Working on the last press"
                            onClick={() => void execute(() => duplicate(template))}
                          >
                            Duplicate
                          </Button>
                        }
                        play={{
                          run: () => void execute(() => apply(template)),
                          blocked: blocked
                            ? "A run is still starting in Play. Wait for it, then use the template."
                            : pending
                              ? "Working on the last press"
                              : undefined,
                        }}
                        onHistory={() => setHistoryOf(template)}
                        onDelete={() => {
                          setDeleting(template);
                          setError(null);
                        }}
                      />
                    }
                  />
                  <RetiredModelRow kind="template" id={template.id} name={template.name} />
                </Fragment>
              ))}
            </List>
          }
          detail={<TemplateDetail template={shown.find((one) => one.id === picked)} />}
        />
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
        <p className="m-0 mb-4 text-small text-ink-2">
          Choose a saved Play draft, or{" "}
          <Link to="/play" className="text-accent-ink underline">
            open Play
          </Link>{" "}
          to prepare one.
        </p>
        <p className="mb-4 text-small text-ink-2">
          A template keeps the settings, not one video&apos;s topic.
        </p>
        <form
          id="save-template-form"
          aria-label="Save a setup"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (draftId && name.trim()) void execute(save);
          }}
        >
          <Field
            label="Saved Play draft"
            tip="templates.save.draft"
            help={
              drafts.isPending
                ? "Loading saved drafts…"
                : drafts.data?.length === 0
                  ? "No saved drafts yet."
                  : undefined
            }
          >
            <Select
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
            </Select>
          </Field>
          {drafts.error ? (
            <Callout
              tone="danger"
              title="The saved drafts couldn't be loaded."
              actions={
                <Button size="small" onClick={() => void drafts.refetch()}>
                  Reload drafts
                </Button>
              }
            >
              {drafts.error.message}
            </Callout>
          ) : null}
          <Field label="Template name" id="template-name" tip="templates.save.name">
            <Input
              value={name}
              required
              maxLength={templateNameMax}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Channel" id="template-channel" tip="templates.save.channel">
            <Select
              value={saveChannel}
              disabled={pending}
              onChange={(event) => setSaveChannel(event.target.value)}
            >
              <option value="">The draft's channel</option>
              {(channels.data ?? []).map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Drawer>
      {historyOf === null ? null : (
        <TemplateHistoryDrawer
          key={`${historyOf.id}:${String(historyOf.version)}`}
          template={historyOf}
          onClose={() => setHistoryOf(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "template"}?`}
        consequence={
          error ??
          "Moves it to the trash for 30 days (Settings → Trash). Existing projects and drafts keep their setup."
        }
        confirmLabel="Delete template"
        pending={pending}
        onConfirm={() => void execute(remove)}
        onCancel={() => {
          if (!pending) setDeleting(null);
        }}
      />
    </div>
  );
}
