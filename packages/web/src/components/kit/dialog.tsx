import type { ReactElement, ReactNode } from "react";
import {
  DialogContent,
  DialogDescription,
  Dialog as DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "./button.js";

// A dialog on the scrim: a title, what it is about, the body, and a foot of buttons named for
// their result. Radix keeps focus inside while it is open, closes it on Esc and on the scrim,
// and hands focus back to whatever opened it.
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  className,
  dismissible = true,
}: {
  readonly open: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  // false for a dialog whose one action is the only way on (the first-run notice, a stale
  // tab): Esc and the scrim leave it open.
  readonly dismissible?: boolean;
  readonly title: string;
  readonly description?: ReactNode;
  // The buttons, primary last: [Cancel] [Delete 3 images].
  readonly footer?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <DialogRoot open={open} {...(onOpenChange === undefined ? {} : { onOpenChange })}>
      <DialogContent
        className={className}
        {...(dismissible
          ? {}
          : {
              onEscapeKeyDown: (event: Event) => event.preventDefault(),
              onInteractOutside: (event: Event) => event.preventDefault(),
            })}
        {...(description === undefined ? { "aria-describedby": undefined } : {})}
      >
        <DialogTitle>{title}</DialogTitle>
        {description === undefined ? null : <DialogDescription>{description}</DialogDescription>}
        {children}
        {footer === undefined ? null : <div className="sl-dialog__foot">{footer}</div>}
      </DialogContent>
    </DialogRoot>
  );
}

// The confirm pattern: one sentence of consequence and two named buttons, never OK/Cancel.
// "Delete 'Cleopatra'?" / "The project and its 9 images are removed from disk." /
// [Keep it] [Delete project]. Focus starts on the way out, so Enter never destroys by
// accident.
export function ConfirmDialog({
  open,
  title,
  consequence,
  confirmLabel,
  cancelLabel,
  tone = "destructive",
  pending = false,
  onConfirm,
  onCancel,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly consequence: ReactNode;
  // Named for its result: "Delete project", "Discard 3 changes".
  readonly confirmLabel: string;
  // What the way out is called: "Keep it", "Keep running". A destructive dialog's way out
  // keeps the thing ("Keep it" unless named); a neutral one is "Cancel".
  readonly cancelLabel?: string;
  readonly tone?: "destructive" | "primary";
  readonly pending?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={title}
      description={consequence}
      footer={
        <>
          <Button variant="secondary" autoFocus onClick={onCancel}>
            {cancelLabel ?? (tone === "destructive" ? "Keep it" : "Cancel")}
          </Button>
          <Button
            variant={tone}
            disabled={pending}
            disabledReason="Working on it"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
