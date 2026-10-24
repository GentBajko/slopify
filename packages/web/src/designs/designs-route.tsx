import type { DesignView } from "@app/slices/designs/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/layout";
import { ButtonLink, TextLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { MediaFrame, MediaGrid } from "@/components/kit/media";
import { LoadFailed, LoadingBlock } from "@/components/kit/query-state";
import { Badge } from "@/components/kit/status";
import { keys } from "@/queries";
import {
  deleteDesign,
  deleteDesignTemplate,
  designsQuery,
  designTemplatesQuery,
  stepPictureUrl,
} from "./api";
import { headStep } from "./design-picture";
import { useDesignStarts } from "./start";

// Designs: the pictures edited and the pieces designed, each opened on its own page. The start
// buttons are in the header; Delete is under each piece. Poster templates, the designs made
// again by hand or by a schedule, are on Templates (its Poster templates tab).
export function DesignsRoute(): ReactElement {
  const starts = useDesignStarts();
  return (
    <div>
      <PageHeader
        crumb={<TextLink to="/templates">Templates</TextLink>}
        title="Designs"
        meta="Pictures you changed with an image model, and posters with your words in real fonts."
        actions={
          <>
            <Button disabled={starts.busy} onClick={starts.startPoster}>
              Design a poster
            </Button>
            <Button variant="primary" disabled={starts.busy} onClick={starts.pickPicture}>
              Edit a picture
            </Button>
          </>
        }
      />
      {starts.problem === null ? null : (
        <p role="alert" className="m-0 mb-3 text-body text-danger">
          {starts.problem}
        </p>
      )}
      {starts.input}
      <DesignGallery />
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
        Change a picture of your own with an image model, or design a poster: both start from the
        buttons above.
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
                <Button
                  size="small"
                  variant="quiet"
                  aria-label={`Delete ${design.name}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(design.id)}
                >
                  Delete
                </Button>
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

// The poster templates, each set up in its own editor (Templates → Poster templates).
export function DesignTemplateList({ onNew }: { readonly onNew: () => void }): ReactElement {
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
        what="Your poster templates"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  if (query.data === undefined) return <LoadingBlock label="Loading your poster templates" />;
  if (query.data.length === 0)
    return (
      <EmptyState
        title="No poster templates yet"
        actions={
          <Button variant="primary" onClick={onNew}>
            New poster template
          </Button>
        }
      >
        Make a poster template once, then make it again for every event, by hand or from a schedule.
      </EmptyState>
    );
  return (
    <List label="Poster templates">
      {query.data.map((template) => {
        const scheduled = template.document.schedule !== undefined;
        return (
          <ListRow
            key={template.id}
            title={
              <Link to="/design-templates/$templateId" params={{ templateId: template.id }}>
                {template.name}
              </Link>
            }
            meta={
              <span className="flex flex-wrap items-center gap-2">
                {`Version ${String(template.headVersion)}${scheduled ? " · made ahead of each date" : ""}`}
                {scheduled ? (
                  template.readyVersion === null ? (
                    <Badge tone="waiting">Not ready for schedules</Badge>
                  ) : (
                    <Badge tone="running">Ready for schedules</Badge>
                  )
                ) : null}
              </span>
            }
            actions={
              <>
                <ButtonLink
                  to="/design-templates/$templateId"
                  params={{ templateId: template.id }}
                  size="small"
                  aria-label={`Edit template ${template.name}`}
                >
                  Edit template
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
        );
      })}
    </List>
  );
}
