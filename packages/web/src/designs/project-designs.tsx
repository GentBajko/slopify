import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { EmptyState } from "@/components/kit/empty-state";
import { List, ListRow } from "@/components/kit/list-row";
import { LoadFailed, LoadingBlock } from "@/components/kit/query-state";
import { designsQuery, stepPictureUrl } from "./api";
import { headStep } from "./design-picture";
import { useDesignStarts } from "./start";

// A project's designs, from its More menu: the posters and pictures kept with it (linked, never
// written into its video), and the two ways to start another for it.

export function useProjectDesignCount(projectId: string): number | undefined {
  const { api } = useApp();
  return useQuery(designsQuery(api, projectId)).data?.length;
}

export function ProjectDesigns({
  projectId,
  open,
  onClose,
}: {
  readonly projectId: string;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactElement | null {
  const { api } = useApp();
  const query = useQuery({ ...designsQuery(api, projectId), enabled: open });
  const starts = useDesignStarts({ projectId });
  return (
    <Drawer
      open={open}
      title="Designs"
      onClose={onClose}
      footer={
        <>
          <Button disabled={starts.busy} onClick={starts.startPoster}>
            Design a poster
          </Button>
          <Button variant="primary" disabled={starts.busy} onClick={starts.pickPicture}>
            Edit a picture
          </Button>
          {starts.input}
          {starts.problem === null ? null : (
            <span role="alert" className="basis-full text-small text-danger">
              {starts.problem}
            </span>
          )}
        </>
      }
    >
      {query.error !== null ? (
        <LoadFailed
          what="The project's designs"
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          compact
        />
      ) : query.data === undefined ? (
        <LoadingBlock label="Loading the project's designs" />
      ) : query.data.length === 0 ? (
        <EmptyState title="No designs kept with this project">
          A poster or picture made here is kept with the project. To keep one you already made, open
          it and choose this project under Formats → Keep in project.
        </EmptyState>
      ) : (
        <List label="The project's designs">
          {query.data.map((design) => {
            const head = headStep(design);
            return (
              <ListRow
                key={design.id}
                lead={
                  head?.sha256 == null ? undefined : (
                    <img
                      src={stepPictureUrl(api, design.id, head.id)}
                      alt=""
                      className="size-12 shrink-0 rounded-control border border-line object-cover"
                    />
                  )
                }
                title={
                  <Link to="/designs/$designId" params={{ designId: design.id }}>
                    {design.name}
                  </Link>
                }
                meta={design.kind === "edit" ? "Picture edit" : "Designed piece"}
              />
            );
          })}
        </List>
      )}
    </Drawer>
  );
}
