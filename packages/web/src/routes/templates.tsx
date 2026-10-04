import { templateNameMax } from "@app/slices/project-templates/schema.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { channelsQuery } from "@/channels/api";
import { useCurrentChannel } from "@/channels/current";
import { channelOfTemplate } from "@/channels/members-tabs";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Input, Select } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { ListDetail } from "@/components/kit/layout";
import { List, ListRow } from "@/components/kit/list-row";
import { useToast } from "@/components/kit/toast";
import { RetiredModelRow } from "@/components/retired-models";
import { InlineName } from "@/library/inline-name";
import { ListSkeleton, libraryListDetail } from "@/library/list-states";
import { useLibraryItem } from "@/library/list-url";
import { LibraryRowActions } from "@/library/row-actions";
import { sortLibrary, useLibrarySort } from "@/library/sort";
import { SortMenu } from "@/library/sort-menu";
import { Stamp } from "@/library/time";
import { PacksDrawer } from "@/onboarding/packs-drawer";
import {
  deleteProjectTemplate,
  renameProjectTemplate,
  type TemplateSummary,
  templatesKey,
  templatesQuery,
} from "@/templates/api";
import { TemplateDetail, TemplateHistoryDrawer } from "@/templates/row-parts";
import { SaveTemplateDrawer } from "@/templates/save-drawer";
import { useTemplateActions } from "@/templates/use-template-actions";
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
  const sidebarChannel = useCurrentChannel().channelId;
  // Starts on the channel the sidebar shows, then is this list's own choice. "" shows every channel's templates.
  const [channelFilter, setChannelFilter] = useState(sidebarChannel ?? "");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useLibrarySort("template");
  const needle = query.trim().toLowerCase();
  const inChannel = templates.data?.filter(
    (template) => channelFilter === "" || channelOfTemplate(template) === channelFilter,
  );
  const shown =
    inChannel === undefined
      ? undefined
      : sortLibrary(
          inChannel.filter((template) => template.name.toLowerCase().includes(needle)),
          sort,
        );
  const channelName = (template: TemplateSummary): string | undefined =>
    channels.data?.find((channel) => channel.id === channelOfTemplate(template))?.name;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notify = useToast();
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<TemplateSummary | null>(null);
  // The template shown beside the list (`?item=` in the URL): its keywords and versions.
  const [picked, setPicked] = useLibraryItem();
  const [historyOf, setHistoryOf] = useState<TemplateSummary | null>(null);
  const active = useRef(false);
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
  const { apply, duplicate } = useTemplateActions({
    onApplied,
    beforeApply,
    getGeneration,
    blocked,
  });
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
            text: "A run is still starting in Play. Wait for it to finish (or press Check whether it started there), then apply a template.",
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
        <Input
          type="search"
          aria-label="Search templates"
          placeholder="Search templates"
          value={query}
          className="w-full min-w-0 sm:w-56"
          onChange={(event) => setQuery(event.target.value)}
        />
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
        <SortMenu what="templates" sort={sort} onSort={setSort} />
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
        <p className="m-0 py-3 text-small text-ink-2">
          {needle === ""
            ? "No templates in this channel."
            : `No templates match "${query.trim()}"${channelFilter === "" ? "" : " in this channel"}.`}
        </p>
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
                        Version {template.version} · updated <Stamp iso={template.updatedAt} />
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
          detail={<TemplateDetail template={templates.data?.find((one) => one.id === picked)} />}
        />
      ) : null}
      <SaveTemplateDrawer
        open={saving}
        onClose={() => setSaving(false)}
        templates={templates.data}
        channels={channels.data ?? []}
        pending={pending}
        error={error}
        execute={execute}
      />
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
