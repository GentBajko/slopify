import type { StudioView } from "@app/slices/template-studio/schema.js";
import type { ReactElement } from "react";
import { TextLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { Status } from "@/components/kit/status";

// The free checks a template passes before Mark ready: each failing one says what is wrong and
// links to where it is fixed.
export function ChecksList({ checks }: { readonly checks: StudioView["checks"] }): ReactElement {
  const failing = checks.filter((check) => !check.ok).length;
  return (
    <section aria-label="Checks" className="flex flex-col gap-2">
      <SectionHead
        title="Checks"
        as="h3"
        className="pb-0"
        meta={failing === 0 ? "All pass" : `${String(failing)} to fix`}
      />
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
    </section>
  );
}
