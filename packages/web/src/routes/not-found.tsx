import { type ErrorComponentProps, useLocation, useRouter } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "@/components/document-title";
import { Button } from "@/components/kit/button";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/layout";
import { ButtonLink, FileLink } from "@/components/kit/link";

// An address no screen answers: an old bookmark, a mistyped link, a page from another version.
// The shell stays around it, so every destination is still one press away.
export function NotFoundRoute(): ReactElement {
  const pathname = useLocation({ select: (location) => location.pathname });
  useDocumentTitle("Page not found");
  return (
    <div>
      <PageHeader title="Page not found" />
      <EmptyState
        title="There is no page at this address"
        actions={
          <>
            <ButtonLink to="/" variant="primary">
              Open Home
            </ButtonLink>
            <ButtonLink to="/projects" variant="secondary">
              Open Projects
            </ButtonLink>
          </>
        }
      >
        {`${pathname} is not a screen in Slopify: the link may be mistyped or from an older version. Pick a destination on the left, or press Ctrl+K to search.`}
      </EmptyState>
    </div>
  );
}

// A screen that failed while drawing. The rest of the app keeps working; Try again draws it
// once more, and the diagnostics file is what a bug report needs.
export function RouteError({ error, reset }: ErrorComponentProps): ReactElement {
  const router = useRouter();
  useDocumentTitle("Something went wrong");
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div>
      <PageHeader title="This screen stopped working" />
      <EmptyState
        title="Something on this screen failed"
        actions={
          <>
            <Button
              variant="primary"
              onClick={() => {
                reset();
                void router.invalidate();
              }}
            >
              Try again
            </Button>
            <ButtonLink to="/" variant="secondary">
              Open Home
            </ButtonLink>
            <FileLink
              href="/api/diagnostics"
              download="slopify-diagnostics.json"
              variant="secondary"
            >
              Download diagnostics
            </FileLink>
          </>
        }
      >
        {`${message} Press Try again. If it fails again, download the diagnostics and attach them to a bug report on GitHub.`}
      </EmptyState>
    </div>
  );
}
