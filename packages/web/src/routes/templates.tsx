import { type UseQueryResult, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EllipsisIcon } from "lucide-react";
import { type ReactElement, useEffect, useRef, useState } from "react";
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
import { PageHeader } from "@/components/kit/layout";
import { ButtonLink, TextLink } from "@/components/kit/link";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/kit/menu";
import { Badge } from "@/components/kit/status";
import { Tabs } from "@/components/kit/tabs";
import { useToast } from "@/components/kit/toast";
import { RetiredModelRow } from "@/components/retired-models";
import { designTemplatesQuery } from "@/designs/api";
import { DesignTemplateList } from "@/designs/designs-route";
import { useDesignStarts } from "@/designs/start";
import { sortLibrary, useLibrarySort } from "@/library/sort";
import { SortMenu } from "@/library/sort-menu";
import { onboardingKey, readFirstRun } from "@/onboarding/api";
import { PacksDrawer } from "@/onboarding/packs-drawer";
import { providersQuery } from "@/queries";
import { downloadPack, type TemplateCard, templateCardsQuery } from "@/template-studio/api";
import { templateGateBadge } from "@/template-studio/gate-words";
import { useImportFile } from "@/template-studio/pack";
import {
  deleteProjectTemplate,
  type TemplateSummary,
  templatesKey,
  templatesQuery,
} from "@/templates/api";
import { cardFacts } from "@/templates/card-facts";
import type { PlayHandoff } from "@/templates/play-handoff";
import { TemplateHistoryDrawer } from "@/templates/row-parts";
import { useTemplateActions } from "@/templates/use-template-actions";
import { restoreTrashItem } from "@/trash/api";
import { useOpenTrash } from "@/trash/open-trash";

export type TemplatesTab = "videos" | "posters";

export function templatesTabOf(value: unknown): TemplatesTab {
  return value === "posters" ? "posters" : "videos";
}

// With more templates than this, a search box and the sort appear.
const toolsFrom = 7;

// Templates: every saved setup, video templates first and poster templates on their own tab.
// A video template is a card that shows what it makes (a still, its shape, voice, length,
// captions and shorts, and what each video asks for) with Make a video, which opens Create
// with the template picked and only the topic to type, and Edit template.
export function TemplatesRoute({
  tab = "videos",
  onTab,
  item,
  ...play
}: PlayHandoff & {
  readonly tab?: TemplatesTab;
  readonly onTab?: (next: TemplatesTab) => void;
  // A template a link names: its card is scrolled into view and marked.
  readonly item?: string | undefined;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const templates = useQuery(templatesQuery(api));
  const cards = useQuery(templateCardsQuery(api));
  const channels = useQuery(channelsQuery(api));
  const designs = useDesignStarts();
  const [adding, setAdding] = useState(false);
  const importing = useImportFile();
  const [shown, setShown] = useState<TemplatesTab>(tab);
  const current = onTab === undefined ? shown : tab;
  const pick = (next: TemplatesTab) => (onTab === undefined ? setShown(next) : onTab(next));
  useCommand({
    id: "templates.add-starters",
    title: "Add starter templates",
    group: "Templates",
    keywords: ["template", "starter", "pack"],
    run: () => setAdding(true),
  });
  const count = templates.data?.length;
  const posters = useQuery(designTemplatesQuery(api));
  // Add starter templates goes once every starter is added: its drawer would offer nothing.
  const starters = useQuery({ queryKey: onboardingKey, queryFn: () => readFirstRun(api) });
  const allAdded = starters.data?.packs.every((pack) => pack.installed) === true;
  // An empty list teaches with its own button; the header doesn't repeat it.
  return (
    <div>
      <PageHeader
        title="Templates"
        meta={
          current === "videos"
            ? "A template is a saved setup. Make a video from one, or edit what it makes."
            : "A poster template is a saved poster with keywords. Make a poster from one, or edit what it makes."
        }
        actions={
          current === "videos" ? (
            <>
              {count === 0 || allAdded ? null : (
                <Button onClick={() => setAdding(true)} aria-expanded={adding}>
                  Add starter templates
                </Button>
              )}
              <Button disabled={importing.busy} onClick={importing.choose}>
                Import a template file (.zip)
              </Button>
            </>
          ) : posters.data?.length === 0 ? undefined : (
            <Button disabled={designs.busy} onClick={designs.startTemplate}>
              New poster template
            </Button>
          )
        }
      />
      {importing.input}
      {designs.input}
      <PacksDrawer
        open={adding}
        onClose={() => setAdding(false)}
        onInstalled={() => void client.invalidateQueries({ queryKey: templatesKey })}
      />
      <Tabs<TemplatesTab>
        label="Kinds of template"
        idPrefix="templates"
        value={current}
        onChange={pick}
        items={[
          {
            id: "videos",
            label: count === undefined ? "Video templates" : `Video templates (${String(count)})`,
          },
          { id: "posters", label: "Poster templates" },
        ]}
        className="mb-4"
      />
      <div
        role="tabpanel"
        id={`templates-panel-${current}`}
        aria-labelledby={`templates-tab-${current}`}
      >
        {importing.problem === null ? null : (
          <p role="alert" className="m-0 mb-3 text-small text-danger">
            {importing.problem}
          </p>
        )}
        {current === "videos" ? (
          <VideoTemplates
            templates={templates}
            cards={cards.data}
            channels={channels.data ?? []}
            play={play}
            item={item}
            onAdd={() => setAdding(true)}
          />
        ) : (
          <PosterTemplates problem={designs.problem} onNew={designs.startTemplate} />
        )}
      </div>
    </div>
  );
}

function VideoTemplates({
  templates,
  cards,
  channels,
  play,
  item,
  onAdd,
}: {
  readonly templates: UseQueryResult<readonly TemplateSummary[]>;
  readonly cards: readonly TemplateCard[] | undefined;
  readonly channels: readonly { readonly id: string; readonly name: string }[];
  readonly play: PlayHandoff;
  readonly item: string | undefined;
  readonly onAdd: () => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const openTrash = useOpenTrash();
  const providers = useQuery(providersQuery(api));
  const sidebarChannel = useCurrentChannel().channelId;
  // Starts on the channel the app shows, then is this list's own choice. "" is every channel.
  const [channelFilter, setChannelFilter] = useState(
    channels.length > 1 ? (sidebarChannel ?? "") : "",
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useLibrarySort("template");
  const [problem, setProblem] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TemplateSummary | null>(null);
  const [versionsOf, setVersionsOf] = useState<TemplateSummary | null>(null);
  const [pending, setPending] = useState(false);
  const active = useRef(false);
  const actions = useTemplateActions(play);
  const all = templates.data ?? [];
  const tools = all.length >= toolsFrom;
  const needle = tools ? query.trim().toLowerCase() : "";
  const inChannel = all.filter(
    (template) =>
      channels.length < 2 || channelFilter === "" || channelOfTemplate(template) === channelFilter,
  );
  const shown = sortLibrary(
    inChannel.filter((template) => template.name.toLowerCase().includes(needle)),
    tools ? sort : "name",
  );
  async function execute(action: () => Promise<void>): Promise<void> {
    if (active.current) return;
    active.current = true;
    setPending(true);
    setProblem(null);
    try {
      await action();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That didn't finish. Try again.");
    } finally {
      active.current = false;
      setPending(false);
    }
  }
  async function remove(): Promise<void> {
    if (deleting === null) return;
    const gone = deleting.id;
    const reply = await deleteProjectTemplate(api, deleting);
    if (!reply.ok) throw new Error(reply.message);
    setDeleting(null);
    await client.cancelQueries({ queryKey: templatesKey });
    client.setQueryData<readonly TemplateSummary[]>(templatesKey, (current) =>
      current?.filter((template) => template.id !== gone),
    );
    const name = deleting.name;
    notify(`Moved "${name}" to the trash.`, "success", {
      label: "Undo",
      run: () =>
        void restoreTrashItem(api, "template", gone).then(
          async () => {
            notify(`Restored "${name}".`, "success");
            await client.invalidateQueries({ queryKey: templatesKey });
          },
          (error: Error) =>
            notify(
              `"${name}" wasn't restored: ${error.message} Restore it in Settings → Trash.`,
              "error",
              openTrash,
            ),
        ),
    });
    await client.invalidateQueries({ queryKey: templatesKey });
  }
  async function exportFile(template: TemplateSummary): Promise<void> {
    const reply = await downloadPack(api, template.id);
    if (!reply.ok) throw new Error(reply.message);
    const url = URL.createObjectURL(reply.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = reply.filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  if (templates.error)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <StatusSlot tone="error">{`The templates didn't load: ${templates.error.message}`}</StatusSlot>
        <Button size="small" onClick={() => void templates.refetch()}>
          Reload templates
        </Button>
      </div>
    );
  if (templates.data === undefined)
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading templates"
        className="sl-template-cards"
      >
        <div className="h-72 rounded-media bg-raised" />
        <div className="h-72 rounded-media bg-raised" />
        <div className="h-72 rounded-media bg-raised" />
      </div>
    );
  if (all.length === 0)
    return (
      <EmptyState
        title="No templates yet"
        actions={
          <Button variant="primary" onClick={onAdd}>
            Add starter templates
          </Button>
        }
      >
        A template keeps a whole setup, so a video takes only a topic. Start from a starter
        template, or save one from Create with Save as template.
      </EmptyState>
    );
  return (
    <div className="flex flex-col gap-3">
      {tools || channels.length > 1 ? (
        <div className="flex flex-wrap items-center gap-3">
          {tools ? (
            <Input
              type="search"
              aria-label="Search templates"
              placeholder="Search templates"
              value={query}
              className="w-full min-w-0 sm:w-56"
              onChange={(event) => setQuery(event.target.value)}
            />
          ) : null}
          {channels.length > 1 ? (
            <Select
              aria-label="Show templates of"
              value={channelFilter}
              className="w-full sm:w-56"
              onChange={(event) => setChannelFilter(event.target.value)}
            >
              <option value="">All channels</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </Select>
          ) : null}
          {tools ? <SortMenu what="templates" sort={sort} onSort={setSort} /> : null}
        </div>
      ) : null}
      <StatusSlot tone={play.blocked ? "warning" : "error"}>
        {(deleting === null ? problem : null) ??
          (play.blocked
            ? "A video is still starting on Create. Wait for it, then make the next one."
            : undefined)}
      </StatusSlot>
      {shown.length === 0 ? (
        <p className="m-0 py-3 text-small text-ink-2">
          {needle === ""
            ? "No templates in this channel."
            : `No templates match "${query.trim()}"${channelFilter === "" ? "" : " in this channel"}.`}
        </p>
      ) : (
        <ul aria-label="Video templates" className="sl-template-cards m-0 list-none p-0">
          {shown.map((template) => (
            <TemplateCardItem
              key={template.id}
              template={template}
              picked={template.id === item}
              card={cards?.find((one) => one.id === template.id)}
              channel={
                channels.length > 1
                  ? channels.find((one) => one.id === channelOfTemplate(template))?.name
                  : undefined
              }
              providerName={(id) =>
                providers.data?.providers.find((one) => one.id === id)?.displayName ?? id
              }
              pending={pending}
              onMake={() => void execute(() => actions.apply(template))}
              onDuplicate={() => void execute(() => actions.duplicate(template))}
              onExport={() => void execute(() => exportFile(template))}
              onVersions={() => setVersionsOf(template)}
              onDelete={() => {
                setDeleting(template);
                setProblem(null);
              }}
            />
          ))}
        </ul>
      )}
      {versionsOf === null ? null : (
        <TemplateHistoryDrawer
          key={`${versionsOf.id}:${String(versionsOf.version)}`}
          template={versionsOf}
          onClose={() => setVersionsOf(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "template"}?`}
        consequence={
          problem ??
          "Moves it to the trash for 30 days (Settings → Trash). Projects already made from it keep their setup."
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

// One template as a card: what it makes, at a glance, and the two things to do with it.
function TemplateCardItem({
  template,
  picked,
  card,
  channel,
  providerName,
  pending,
  onMake,
  onDuplicate,
  onExport,
  onVersions,
  onDelete,
}: {
  readonly template: TemplateSummary;
  readonly picked: boolean;
  readonly card: TemplateCard | undefined;
  readonly channel: string | undefined;
  readonly providerName: (id: string) => string;
  readonly pending: boolean;
  readonly onMake: () => void;
  readonly onDuplicate: () => void;
  readonly onExport: () => void;
  readonly onVersions: () => void;
  readonly onDelete: () => void;
}): ReactElement {
  const { api } = useApp();
  const badge = templateGateBadge(template.gate, card?.schedules ?? 0);
  const format = card?.format ?? "16:9";
  const shown = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (picked) shown.current?.scrollIntoView?.({ block: "nearest" });
  }, [picked]);
  return (
    <li
      ref={shown}
      className="sl-template-card"
      aria-label={template.name}
      aria-current={picked ? "true" : undefined}
    >
      {card?.still == null ? null : (
        <Link
          to="/templates/$templateId"
          params={{ templateId: template.id }}
          search={{}}
          // The name below is the way in from the keyboard; the still is one more for a pointer.
          tabIndex={-1}
          className="sl-template-card__still"
          data-format={format}
        >
          <img src={`${api.origin}${card.still}`} alt={`A still from ${template.name}'s sample`} />
        </Link>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="m-0 text-title-3 [overflow-wrap:anywhere]">
          <Link
            to="/templates/$templateId"
            params={{ templateId: template.id }}
            search={{}}
            className="text-ink no-underline hover:underline"
          >
            {template.name}
          </Link>
        </h3>
        <p className="m-0 text-small text-ink-2">
          {card === undefined ? "Reading what it makes…" : cardFacts(card, providerName)}
        </p>
        {card === undefined || card.asks.length === 0 ? null : (
          <p className="m-0 text-small text-ink-2">{`Asks for: ${card.asks.join(", ")}`}</p>
        )}
        {badge === undefined && channel === undefined ? null : (
          <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-2">
            {badge === undefined ? null : <Badge tone={badge.tone}>{badge.word}</Badge>}
            {channel === undefined ? null : <span>{channel}</span>}
          </p>
        )}
        {badge === undefined || badge.tone !== "waiting" ? null : (
          <p className="m-0 text-small text-ink-2">{badge.detail}</p>
        )}
      </div>
      <div className="sl-template-card__actions">
        <Button
          variant="primary"
          size="small"
          aria-label={`Make a video with ${template.name}`}
          disabled={pending}
          disabledReason="Working on the last press"
          onClick={onMake}
        >
          Make a video
        </Button>
        <ButtonLink
          to="/templates/$templateId"
          params={{ templateId: template.id }}
          search={{}}
          size="small"
          aria-label={`Edit template ${template.name}`}
        >
          Edit template
        </ButtonLink>
        <Menu>
          <MenuTrigger asChild>
            <Button size="small" variant="quiet" aria-label={`More for ${template.name}`}>
              <EllipsisIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem
              aria-label={`Duplicate ${template.name}`}
              disabled={pending}
              onSelect={onDuplicate}
            >
              Duplicate
            </MenuItem>
            <MenuItem aria-label={`Versions of ${template.name}`} onSelect={onVersions}>
              Versions
            </MenuItem>
            <MenuItem
              aria-label={`Export ${template.name} as a file (.zip)`}
              disabled={pending}
              onSelect={onExport}
            >
              Export as a file (.zip)
            </MenuItem>
            <MenuSeparator />
            <MenuItem aria-label={`Delete ${template.name}`} onSelect={onDelete}>
              Delete…
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <RetiredModelRow kind="template" id={template.id} name={template.name} />
    </li>
  );
}

// Poster templates: posters and flyers with keywords such as {{Event}}, made again by hand or
// ahead of each date by a schedule, each set up in its own editor.
function PosterTemplates({
  problem,
  onNew,
}: {
  readonly problem: string | null;
  readonly onNew: () => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-small text-ink-2">
        A poster with keywords such as {"{{Event}}"}, made again by hand or ahead of each date by a
        schedule. Your posters and picture edits are under{" "}
        <TextLink to="/designs">Designs</TextLink>.
      </p>
      {problem === null ? null : (
        <p role="alert" className="m-0 text-body text-danger">
          {problem}
        </p>
      )}
      <DesignTemplateList onNew={onNew} />
    </div>
  );
}
