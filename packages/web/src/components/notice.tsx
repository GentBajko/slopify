import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dismissNotice } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Dialog } from "@/components/kit/dialog";
import { keys, noticeQuery } from "@/queries";

// The promise, checked against `slices/telemetry/model.ts` in notice.test.tsx: every key
// the payload schema allows is named here, and the schema is strict, so nothing can be
// added to a report without this list failing its test first.
//
// The counters in their own names, plus the two things every event carries beyond them:
// the event type and the time it happened.
const tracked = [
  "Tokens in and out per stage, with provider and model",
  "Audio seconds per segment",
  "Images made",
  "Thumbnails made",
  "Videos rendered",
  "PDF documents made",
  "YouTube descriptions written",
  "Shorts made",
  "Projects created",
  "That this machine installed Slopify",
  "The time each of those happened",
];

const never = [
  "API keys",
  "Prompt bodies",
  "Keyword values",
  "Titles",
  "Article or research text",
  "Files and filenames",
  "OS, locale, hardware",
];

// Shown once per machine, before any telemetry exists. Pressing "Got it" is what creates the
// machine ID, so the notice is the disclosure and the consent in one control: there is no close
// icon, no secondary action, and Esc does not dismiss it.
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
  const version = notice.data?.appVersion;

  return (
    <Dialog
      open={open}
      dismissible={false}
      title="Anonymous usage stats"
      description="These numbers power the live counters on slopify.stream."
      footer={
        <Button
          // Focus starts on the one action.
          autoFocus
          variant="primary"
          disabled={dismiss.isPending}
          onClick={() => {
            dismiss.mutate();
          }}
        >
          Got it
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Column heading="Tracked" items={tracked} />
        <Column heading="Never tracked" items={never} />
      </div>
      <p className="text-small text-ink-2">
        Every event carries a random ID of its own and this machine's random ID, and nothing else.
        Nothing you write, upload, or paste ever leaves your machine.
      </p>
      {version === undefined ? null : (
        <p className="engraved text-ink-3">
          {`Slopify ${version} · this version is included in each report`}
        </p>
      )}
      {dismiss.error === null ? null : (
        <p role="alert" className="text-small text-danger">
          {dismiss.error.message}
        </p>
      )}
    </Dialog>
  );
}

function Column({
  heading,
  items,
}: {
  readonly heading: string;
  readonly items: readonly string[];
}) {
  const id = `notice-${heading.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex flex-col gap-2">
      <p id={id} className="engraved border-b border-line pb-1 text-ink-3">
        {heading}
      </p>
      <ul aria-labelledby={id} className="m-0 flex list-none flex-col gap-2 p-0 text-small">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
