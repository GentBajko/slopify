import type { ReactElement } from "react";
import { LeaveGuard } from "@/components/leave-guard";
import { reloadPrepared } from "@/lib/draft-store";

// Leaving a project with an unsaved edit asks first. The edit is kept in this browser either
// way, so leaving loses nothing; the question only stops a stray click from hiding it. Moving
// between the project's own sections never asks.
export function DraftLeaveGuard({
  projectId,
  dirty,
}: {
  readonly projectId: string;
  readonly dirty: boolean;
}): ReactElement | null {
  const own = `/projects/${projectId}`;
  return (
    <LeaveGuard
      dirty={dirty}
      leaves={(pathname) => pathname !== own && !pathname.startsWith(`${own}/`)}
      askOnUnload={() => !reloadPrepared()}
      tone="primary"
      title="Leave with unsaved changes?"
      consequence="Your edit stays in this browser and comes back when you open this project again. It is not saved to the project until you press Save changes."
      confirmLabel="Leave, keep my edit for later"
      cancelLabel="Stay and keep editing"
    />
  );
}
