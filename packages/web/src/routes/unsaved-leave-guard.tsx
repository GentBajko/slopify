import type { ReactElement } from "react";
import { LeaveGuard } from "@/components/leave-guard";

// Asks before a navigation away from an editor with unsaved changes. `what` names the changes
// ("your alias changes") and `saveLabel` the button that keeps them.
export function UnsavedLeaveGuard({
  dirty,
  what,
  saveLabel,
}: {
  readonly dirty: boolean;
  readonly what: string;
  readonly saveLabel: string;
}): ReactElement | null {
  return (
    <LeaveGuard
      dirty={dirty}
      title="Leave without saving?"
      consequence={`${what[0]?.toUpperCase() ?? ""}${what.slice(1)} are not saved and are lost if you leave. Stay here and press ${saveLabel} to keep them.`}
      cancelLabel="Stay here"
      confirmLabel="Leave and discard"
    />
  );
}
