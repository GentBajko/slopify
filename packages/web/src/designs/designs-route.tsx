import type { DesignView } from "@app/slices/designs/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button, IconButton } from "@/components/kit/button";
import { EmptyState } from "@/components/kit/empty-state";
import { ButtonLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { MediaFrame, MediaGrid } from "@/components/kit/media";
import { LoadFailed, LoadingBlock } from "@/components/kit/query-state";
import { Badge } from "@/components/kit/status";
import { Tabs } from "@/components/kit/tabs";
import { keys } from "@/queries";
import { LibraryToolbar } from "@/routes/library";
import {
  deleteDesign,
  deleteDesignTemplate,
  designsQuery,
  designTemplatesQuery,
  stepPictureUrl,
} from "./api";
import { headStep } from "./design-picture";
import { useDesignStarts } from "./start";

// Library → Designs: the pictures edited and the pieces designed, and the design templates
// they can be made from again. Every action is on the page: the start buttons in the toolbar,
// Delete on each item.

export type DesignsTab = "designs" | "templates";

export function designsTabOf(value: unknown): DesignsTab {
  return value === "templates" ? "templates" : "designs";
}

export function DesignsRoute({
  tab,
  onTab,
}: {
  readonly tab: DesignsTab;
  readonly onTab: (next: DesignsTab) => void;
}): ReactElement {
  const starts = useDesignStarts();
  return (
    <div>
      <Tabs<DesignsTab>
        label="Designs"
        idPrefix="designs"
        value={tab}
        onChange={onTab}
        items={[
          { id: "designs", label: "Designs" },
          { id: "templates", label: "Templates" },
        ]}
        className="mb-4"
      />
      <LibraryToolbar
        action={
          tab === "designs" ? (
            <>
              <Button disabled={starts.busy} onClick={starts.startPoster}>
                Design a poster
              </Button>
              <Button variant="primary" disabled={starts.busy} onClick={starts.pickPicture}>
                Edit a picture
              </Button>
            </>
          ) : (
            <Button variant="primary" disabled={starts.busy} onClick={starts.startTemplate}>
              New design template
            </Button>
          )
        }
      >
        <p className="m-0 text-small text-ink-2">
          {starts.problem ??
            (tab === "designs"
              ? "Change a picture with an image model, or design a poster with your words laid out in real fonts."
              : "A poster with fields such as {{Event}}, made again by hand or ahead of each date by a schedule.")}
        </p>
      </LibraryToolbar>
      {starts.input}
      <div role="tabpanel" id={`designs-panel-${tab}`} aria-labelledby={`designs-tab-${tab}`}>
        {tab === "designs" ? <DesignGallery /> : <DesignTemplateList />}
      </div>
    </div>
  );
}

function DesignGallery(): ReactElement {
  const { api } = useApp();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery(designsQuery(api));
  const remove = useMutation({
    mutationFn: (id: string) => deleteDesign(api, id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.designs }),
  });
  if (query.error !== null)
    return (
      <LoadFailed
        what="Your designs"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  if (query.data === undefined)
    return <LoadingBlock label="Loading your designs" rows={2} rowClassName="h-48" />;
  if (query.data.length === 0)
    return (
      <EmptyState title="No designs yet">
        Edit a picture of your own, or design a poster: both start from the buttons above.
      </EmptyState>
    );
  return (
    <MediaGrid list label="Designs">
      {query.data.map((design: DesignView) => {
        const head = headStep(design);
        const making = design.steps.some((step) => step.state === "making");
        return (
          <li key={design.id}>
            <MediaFrame
              aspect="square"
              alt={design.name}
              {...(head?.sha256 == null ? {} : { src: stepPictureUrl(api, design.id, head.id) })}
              {...(head === undefined
                ? { generating: making ? "Making the artwork…" : "No artwork yet" }
                : {})}
              title={design.name}
              meta={design.kind === "edit" ? "Picture edit" : "Designed piece"}
              badge={making ? <Badge tone="running">Making</Badge> : undefined}
              onOpen={() =>
                void navigate({ to: "/designs/$designId", params: { designId: design.id } })
              }
              openLabel={`Open ${design.name}`}
              openText="Open"
              actions={
                <IconButton
                  label={`Delete ${design.name}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(design.id)}
                >
                  <Trash2Icon aria-hidden="true" className="size-4" />
                </IconButton>
              }
            />
            {head === undefined ? (
              <Link
                to="/designs/$designId"
                params={{ designId: design.id }}
                className="sl-link text-small"
              >
                {`Open ${design.name}`}
              </Link>
            ) : null}
          </li>
        );
      })}
    </MediaGrid>
  );
}

// The design templates, each opened in its studio. Shown here and in Library → Templates,
// the one list of every kind of template.
export function DesignTemplateList(): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const query = useQuery(designTemplatesQuery(api));
  const remove = useMutation({
    mutationFn: (id: string) => deleteDesignTemplate(api, id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.designTemplates }),
  });
  if (query.error !== null)
    return (
      <LoadFailed
        what="Your design templates"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  if (query.data === undefined) return <LoadingBlock label="Loading your design templates" />;
  if (query.data.length === 0)
    return (
      <EmptyState title="No design templates yet">
        Make a poster template once, then make it again for every event, by hand or from a schedule.
      </EmptyState>
    );
  return (
    <List label="Design templates">
      {query.data.map((template) => (
        <ListRow
          key={template.id}
          title={
            <Link to="/design-templates/$templateId" params={{ templateId: template.id }}>
              {template.name}
            </Link>
          }
          meta={`Version ${String(template.headVersion)}${template.document.schedule === undefined ? "" : " · made ahead of each date"}`}
          lead={
            template.readyVersion === null ? (
              <Badge tone="waiting">Not ready</Badge>
            ) : (
              <Badge tone="running">{`Ready · v${String(template.readyVersion)}`}</Badge>
            )
          }
          actions={
            <>
              <ButtonLink
                to="/design-templates/$templateId"
                params={{ templateId: template.id }}
                variant="secondary"
                size="small"
                aria-label={`Open the studio of ${template.name}`}
              >
                Open studio
              </ButtonLink>
              <Button
                size="small"
                variant="quiet"
                aria-label={`Delete ${template.name}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(template.id)}
              >
                Delete
              </Button>
            </>
          }
        />
      ))}
    </List>
  );
}
