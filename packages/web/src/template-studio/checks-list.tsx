import type { StudioChecks } from "@app/slices/template-studio/schema.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Fold } from "@/components/kit/fold";
import { TextLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { Status } from "@/components/kit/status";
import { templateChecksQuery } from "./api";

// What a run of this template needs that it lacks, one line per missing thing with the link to
// where it is fixed, so "3 to fix" means three lines to fix; what passes is folded under them.
// Read on their own, so the page shows while they load.
export function ChecksList({ templateId }: { readonly templateId: string }): ReactElement {
  const { api } = useApp();
  const query = useQuery(templateChecksQuery(api, templateId));
  const checks = query.data?.checks;
  const failing = checks?.filter((check) => !check.ok);
  const passing = checks?.filter((check) => check.ok) ?? [];
  return (
    <section aria-label="Checks" className="flex flex-col gap-2">
      <SectionHead
        title="Checks"
        as="h3"
        className="pb-0"
        meta={
          failing === undefined
            ? undefined
            : failing.length === 0
              ? "All pass"
              : `${String(failing.length)} to fix`
        }
      />
      {query.error ? (
        <p role="alert" className="m-0 text-small text-danger">
          {`The checks didn't load: ${query.error.message} Reload the page to look again.`}
        </p>
      ) : failing === undefined ? (
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
        <>
          {failing.length === 0 ? null : <CheckLines label="To fix" checks={failing} />}
          {passing.length === 0 ? null : (
            <Fold summary="What passes" state={String(passing.length)}>
              <CheckLines label="What passes" checks={passing} />
            </Fold>
          )}
        </>
      )}
    </section>
  );
}

function CheckLines({
  label,
  checks,
}: {
  readonly label: string;
  readonly checks: readonly StudioChecks["checks"][number][];
}): ReactElement {
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-col gap-3 p-0">
      {checks.map((check, index) => (
        // A check may say several things (one per missing service), so its id repeats.
        <li key={`${check.id}:${String(index)}`} className="flex flex-col gap-1">
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
  );
}
