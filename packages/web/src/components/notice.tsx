import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useId, useState } from "react";
import { dismissNotice } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { keys, noticeQuery } from "@/queries";

// The promise, checked against `slices/telemetry/model.ts` in notice.test.tsx: every key the
// payload schema allows, and every kind of count, is said here in plain words, and the schema
// is strict, so nothing can be added to what is sent without this list failing its test first.
// No word here is the code's own (no token, stage, segment, event or ID): the list is read by
// people who never saw the code.
const counted = [
  "How many videos, shorts, images, thumbnails, PDFs and YouTube descriptions were made",
  "How much text each AI read and wrote, with the AI service and model, and for which part of the video",
  "How many seconds of narration were made, and whether for the main part, the intro or the outro",
  "How many projects were started",
  "That Slopify was installed",
];

const never = [
  "Your API keys",
  "What you type: prompts, topics, keywords and titles",
  "The scripts and research Slopify writes",
  "Your files and their names",
  "Your system, language or hardware",
];

// The window's bottom edge carries the notice, so the page keeps its last lines and its action
// bar above it (shell.css reads this height).
function useHeightOnPage(element: HTMLElement | null): void {
  useEffect(() => {
    if (element === null) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--usage-notice-height", `${element.offsetHeight}px`);
    set();
    if (typeof ResizeObserver === "undefined")
      return () => root.style.removeProperty("--usage-notice-height");
    const watch = new ResizeObserver(set);
    watch.observe(element);
    return () => {
      watch.disconnect();
      root.style.removeProperty("--usage-notice-height");
    };
  }, [element]);
}

// Shown on every page, until OK is pressed, on a machine that has not seen it. Nothing is
// counted before: OK is what creates this computer's random number, and every count needs one.
// It never blocks the page: the welcome under it can be read and used while it is there.
export function FirstRunNotice(): ReactElement | null {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notice = useQuery(noticeQuery(api));
  const dismiss = useMutation({
    mutationFn: () => dismissNotice(api),
    onSuccess: (body) => {
      queryClient.setQueryData(keys.notice, body);
    },
  });
  const [listed, setListed] = useState(false);
  const [element, setElement] = useState<HTMLElement | null>(null);
  const listId = useId();
  const titleId = useId();
  useHeightOnPage(element);
  const version = notice.data?.appVersion;

  // Nothing is shown while the answer is still coming: a notice that flashed and vanished
  // would be worse than one that arrives a moment late.
  if (notice.data?.seen !== false) return null;

  return (
    <section
      ref={setElement}
      aria-labelledby={titleId}
      data-slot="usage-notice"
      className="fixed right-0 bottom-0 left-[var(--rail-width)] z-30 border-line border-t bg-raised shadow-[0_-8px_24px_rgb(0_0_0/0.24)] max-md:bottom-[calc(48px+max(12px,env(safe-area-inset-bottom)))] max-md:left-0"
    >
      <h2 id={titleId} className="sr-only">
        Usage stats
      </h2>
      {listed ? (
        <div
          id={listId}
          className="max-h-[50dvh] overflow-y-auto border-line border-b px-6 py-3 max-md:px-4"
        >
          <div className="grid max-w-[60rem] grid-cols-2 gap-x-8 gap-y-3 max-sm:grid-cols-1">
            <Column heading="Counted" items={counted} />
            <Column heading="Never counted" items={never} />
          </div>
          <p className="m-0 mt-3 max-w-[60rem] text-small text-ink-2">
            {`Each count goes out with the Slopify version${version === undefined ? "" : ` (${version})`}, the time, a random number of its own and a random number for this computer: never your name, your files or where you are.`}
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 max-md:px-4">
        <p className="m-0 min-w-[16rem] flex-1 text-body text-ink">
          Slopify adds what it makes (videos, images, words) to the public totals on its website,
          slopify.stream, anonymously. Nothing you type leaves this computer.
        </p>
        <div className="flex items-center gap-3">
          <Button
            variant="quiet"
            size="small"
            aria-expanded={listed}
            aria-controls={listId}
            onClick={() => setListed((shown) => !shown)}
          >
            {listed ? "Hide the list" : "What's counted"}
          </Button>
          <Button disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
            OK
          </Button>
        </div>
        {dismiss.error === null ? null : (
          <p role="alert" className="m-0 w-full text-small text-danger">
            {dismiss.error.message}
          </p>
        )}
      </div>
    </section>
  );
}

function Column({
  heading,
  items,
}: {
  readonly heading: string;
  readonly items: readonly string[];
}): ReactElement {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <h3 id={id} className="m-0 font-semibold text-small text-ink">
        {heading}
      </h3>
      <ul
        aria-labelledby={id}
        className="m-0 flex list-disc flex-col gap-1 pl-5 text-small text-ink-2"
      >
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
