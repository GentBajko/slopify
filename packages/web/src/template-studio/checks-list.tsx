import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { TextLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { Status } from "@/components/kit/status";
import { templateChecksQuery } from "./api";

// The free checks a template passes before Mark ready: each failing one says what is wrong and
// links to where it is fixed. Read on their own, so the studio shows while they load.
export function ChecksList({ templateId }: { readonly templateId: string }): ReactElement {
  const { api } = useApp();
  const query = useQuery(templateChecksQuery(api, templateId));
  const checks = query.data?.checks;
  const failing = checks?.filter((check) => !check.ok).length;
  return (
    <section aria-label="Checks" className="flex flex-col gap-2">
      <SectionHead
        title="Checks"
        as="h3"
        className="pb-0"
        meta={
          failing === undefined
            ? undefined
            : failing === 0
              ? "All pass"
              : `${String(failing)} to fix`
        }
      />
      {query.error ? (
        <p role="alert" className="m-0 text-small text-danger">
          {`The checks didn't load: ${query.error.message} Reload the page to look again.`}
        </p>
      ) : checks === undefined ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Checking the template"
          className="flex flex-col gap-2"
        >
          <div className="h-4 w-3/4 rounded-control bg-raised" />
          <div className="h-4 w-2/3 rounded-control bg-raised" />
          <div className="h-4 w-1/2 rounded-control bg-raised" />
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {checks.map((check) => (
            <li key={check.id} className="flex flex-col gap-1">
              <Status tone={check.ok ? "done" : "failed"}>
                <span className="text-small">{check.sentence}</span>
              </Status>
              {check.fix === undefined ? null : (
                <TextLink to={check.fix.href} className="text-small">
                  {check.fix.label}
                </TextLink>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
