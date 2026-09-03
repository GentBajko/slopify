import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dismissNotice } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { keys, noticeQuery } from "@/queries";

// logic/16 step 3, in the counters' own names.
const tracked = [
  "tokens in and out, per stage, with the provider and model names",
  "audio seconds, per segment",
  "images and thumbnails made",
  "videos rendered",
  "projects created",
];

// logic/16 step 4.
const never = [
  "API keys",
  "prompt bodies",
  "keyword values",
  "titles",
  "article and research text",
  "files and filenames",
  "OS, locale, hardware",
];

// Shown once per machine, before any telemetry exists. Pressing "Got it" is what creates
// the machine ID (logic/16 step 1), so the notice is the disclosure and the consent in
// one control: there is no close icon, no secondary action, and Esc does not dismiss it
// (uiux/screens/02-first-run-notice.md).
export function FirstRunNotice() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notice = useQuery(noticeQuery(api));
  const dismiss = useMutation({
    mutationFn: () => dismissNotice(api),
    onSuccess: (body) => {
      queryClient.setQueryData(keys.notice, body);
    },
  });

  // Nothing is shown while the answer is still coming: a notice that flashed and
  // vanished would be worse than one that arrives a moment late.
  const open = notice.data?.seen === false;

  return (
    <Dialog open={open}>
      <DialogContent
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
      >
        <DialogTitle>Anonymous usage stats</DialogTitle>
        <DialogDescription>
          These numbers power the live counters on slopify.stream.
        </DialogDescription>
        <div className="grid grid-cols-2 gap-x-4 gap-y-[10px]">
          <div>
            <p className="engraved mb-[10px] text-ink3">Tracked</p>
            <ul className="flex flex-col gap-1 text-small text-ink2">
              {tracked.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="engraved mb-[10px] text-ink3">Never tracked</p>
            <ul className="flex flex-col gap-1 text-small text-ink2">
              {never.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-small text-ink2">
          Every event carries a random ID for this machine and the app version. Nothing you write,
          upload, or paste ever leaves your machine.
        </p>
        <Button
          // uiux/screens/02: focus starts on the one action.
          autoFocus
          variant="play"
          size="play"
          disabled={dismiss.isPending}
          onClick={() => {
            dismiss.mutate();
          }}
        >
          Got it
        </Button>
        {dismiss.error === null ? null : (
          <p className="text-small text-red">{dismiss.error.message}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
