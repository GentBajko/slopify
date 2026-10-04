import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/layout";
import { ButtonLink, TextLink } from "@/components/kit/link";
import { readTrash, trashKey } from "@/trash/api";

const day = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });
const formatDate = (iso: string): string => day.format(new Date(iso));

// A project page whose project could not be read: deleted (then Trash is the way back, and
// only then is Trash offered), a link to something that never existed, or the server not
// answering. Each says what happened and where to go instead.
export function ProjectMissing({
  projectId,
  error,
  retry,
  retrying,
}: {
  readonly projectId: string;
  readonly error: Error;
  readonly retry: () => void;
  readonly retrying: boolean;
}): ReactElement {
  const { api } = useApp();
  const trash = useQuery({ queryKey: trashKey, queryFn: () => readTrash(api), retry: false });
  const trashed = trash.data?.find((item) => item.kind === "project" && item.id === projectId);
  const back = <TextLink to="/projects">Projects</TextLink>;
  if (trashed !== undefined)
    return (
      <div>
        <PageHeader crumb={back} title={trashed.name} />
        <EmptyState
          title="This project is in Trash"
          actions={
            <>
              <ButtonLink to="/settings" search={{ section: "trash" }} variant="primary">
                Open Trash
              </ButtonLink>
              <ButtonLink to="/projects" variant="secondary">
                Back to Projects
              </ButtonLink>
            </>
          }
        >
          {`It was deleted on ${formatDate(trashed.deletedAt)} and stays in Settings → Trash until ${formatDate(trashed.purgeAt)}. Restore it there to open it again.`}
        </EmptyState>
      </div>
    );
  return (
    <div>
      <PageHeader crumb={back} title="Project not opened" />
      <EmptyState
        title="The project could not be opened"
        actions={
          <>
            <ButtonLink to="/projects" variant="primary">
              Open Projects
            </ButtonLink>
            <Button disabled={retrying} disabledReason="Trying again…" onClick={retry}>
              Try again
            </Button>
          </>
        }
      >
        {`${error.message} If it was deleted more than 30 days ago it is gone for good; otherwise press Try again, or pick it from Projects.`}
      </EmptyState>
    </div>
  );
}
