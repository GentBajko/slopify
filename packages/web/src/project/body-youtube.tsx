import { CopyIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { useOutputText } from "./parts.js";

// The Video stage's YouTube part: the description and the tags as written, each with Copy
// beside its heading; the files download from the stage's one Download menu. It is a part of the stage body, set off by a rule and a heading
// rather than a box of its own, and the text is read-only text rather than a field. Everything
// stays mounted while the step runs or waits, so nothing moves when the text lands; a copy says
// how it went in the reserved status line.
export function YoutubeBlock({ stage, project, outputs }: Omit<BodyProps, "actions" | "busy">) {
  const id = useId();
  const own = outputsOf(outputs, stage);
  const description = roleOf(own, "youtube_description");
  const tags = roleOf(own, "youtube_tags");
  const descriptionText = useOutputText(description).data;
  const tagsText = useOutputText(tags).data;
  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | undefined>();
  if (project.config.youtubeDescription !== true && description === undefined) return null;
  const copy = (text: string | undefined, what: string) => {
    if (text === undefined) return;
    if (!navigator.clipboard) {
      setStatus({ text: `Couldn't copy the ${what}. Select the text and copy it.`, tone: "error" });
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => setStatus({ text: `Copied the ${what}.`, tone: "success" }),
      () =>
        setStatus({
          text: `Couldn't copy the ${what}. Select the text and copy it.`,
          tone: "error",
        }),
    );
  };
  const waiting =
    stage.state === "running"
      ? "Written after the subtitle timing."
      : "Not written yet. It is made with the video.";
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex min-w-0 flex-col gap-3 border-t border-line pt-4"
    >
      <h3 id={`${id}-title`} className="engraved text-ink3">
        YouTube
      </h3>
      {/* The description reads best at a paragraph's width; the tags take the room beside
          it, as chips, and drop below it on a narrow screen. */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,75ch)_minmax(0,1fr)]">
        <ReadOnlyText
          id={`${id}-description`}
          label="Description"
          placeholder={waiting}
          empty={descriptionText === undefined}
          copy={
            descriptionText === undefined ? undefined : () => copy(descriptionText, "description")
          }
        >
          {descriptionText}
        </ReadOnlyText>
        <ReadOnlyText
          id={`${id}-tags`}
          label="Tags"
          placeholder={waiting}
          empty={tagsText === undefined}
          copy={tagsText === undefined ? undefined : () => copy(tagsText, "tags")}
        >
          {tagsText === undefined ? undefined : <TagChips text={tagsText} />}
        </ReadOnlyText>
      </div>
      <StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>
    </section>
  );
}

function ReadOnlyText({
  id,
  label,
  placeholder,
  empty,
  copy,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly empty: boolean;
  // Undefined until there is text to copy.
  readonly copy: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h4 id={`${id}-label`} className="text-small font-semibold text-ink2">
          {label}
        </h4>
        <Button
          type="button"
          variant="ghost"
          disabled={copy === undefined}
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={copy}
        >
          <CopyIcon aria-hidden="true" className="size-[14px] shrink-0" />
          Copy
        </Button>
      </div>
      <section
        aria-labelledby={`${id}-label`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll a long description.
        tabIndex={0}
        className={cn(
          "max-h-64 overflow-auto whitespace-pre-wrap break-words text-small",
          empty ? "text-ink3" : "text-ink",
        )}
      >
        {empty ? placeholder : children}
      </section>
    </div>
  );
}

// The tags as the chips they become on YouTube. Copy still copies them exactly as written,
// commas and all, for YouTube's Tags field.
function TagChips({ text }: { readonly text: string }) {
  const tags = text
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
  return (
    <ul className="flex flex-wrap gap-[6px] whitespace-normal">
      {tags.map((tag, index) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: a tag can repeat, and the list never reorders
          key={index}
          className="rounded-full border border-line bg-panel2 px-[9px] py-[2px] text-small text-ink"
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}
