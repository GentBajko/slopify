import type { PostWarning } from "@app/slices/social/model.js";
import type { ReactElement } from "react";
import { Callout } from "@/components/kit/callout";

// What doesn't fit the site, each with its fix. A warning never blocks Fill in <site>.
export function PostWarnings({
  warnings,
}: {
  readonly warnings: readonly PostWarning[];
}): ReactElement | null {
  if (warnings.length === 0) return null;
  return (
    <Callout
      tone="waiting"
      title={
        warnings.length === 1 ? "One thing to check" : `${String(warnings.length)} things to check`
      }
    >
      <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
        {warnings.map((warning) => (
          <li key={`${warning.code}-${warning.sentence}`}>{warning.sentence}</li>
        ))}
      </ul>
    </Callout>
  );
}
