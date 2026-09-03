import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

// The posture for every destructive action is stop and confirm: a dialog naming the
// consequence in one sentence, offering the action verb and Cancel, and carrying no
// secondary options (uiux/03-experience.md). Esc and the overlay close it, which is what
// Cancel does, so Radix's own handling is left alone.
export function ConfirmDialog({
  open,
  title,
  consequence,
  verb,
  pending = false,
  onConfirm,
  onCancel,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly consequence: string;
  readonly verb: string;
  readonly pending?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
        }
      }}
    >
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{consequence}</DialogDescription>
        <div className="flex justify-end gap-[10px]">
          <Button autoFocus onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" disabled={pending} onClick={onConfirm}>
            {verb}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
