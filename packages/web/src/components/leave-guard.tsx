import { useBlocker, useRouter } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { ConfirmDialog } from "@/components/kit/dialog";

// The one question before leaving an editor with unsaved changes: a navigation inside the app
// opens this dialog, and closing or reloading the tab gets the browser's own "Leave site?".
// Outside a router (a unit test of an editor alone) there is nothing to guard.
export interface LeaveGuardProps {
  readonly dirty: boolean;
  // Whether going to `pathname` leaves the editor; every navigation does unless this says not.
  readonly leaves?: ((pathname: string) => boolean) | undefined;
  // Whether a tab close or reload asks too; by default whenever there are changes.
  readonly askOnUnload?: (() => boolean) | undefined;
  readonly title: string;
  readonly consequence: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  // Destructive when leaving loses the changes, primary when they are kept for later.
  readonly tone?: "destructive" | "primary";
}

export function LeaveGuard(props: LeaveGuardProps): ReactElement | null {
  // `useRouter` is typed as always present; without a provider it returns nothing.
  const router: unknown = useRouter({ warn: false });
  if (router === undefined || router === null) return null;
  return <Guard {...props} />;
}

function Guard({
  dirty,
  leaves,
  askOnUnload,
  title,
  consequence,
  confirmLabel,
  cancelLabel,
  tone = "destructive",
}: LeaveGuardProps): ReactElement {
  const blocker = useBlocker({
    shouldBlockFn: ({ next }) => dirty && (leaves?.(next.pathname) ?? true),
    enableBeforeUnload: () => dirty && (askOnUnload?.() ?? true),
    withResolver: true,
  });
  return (
    <ConfirmDialog
      open={blocker.status === "blocked"}
      tone={tone}
      title={title}
      consequence={consequence}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    />
  );
}
