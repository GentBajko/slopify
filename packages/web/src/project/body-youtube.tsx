import { CopyIcon } from "lucide-react";
import { useId, useState } from "react";
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
      <ReadOnlyText
        id={`${id}-description`}
        label="Description"
        placeholder={waiting}
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
        copy={tagsText === undefined ? undefined : () => copy(tagsText, "tags")}
      >
        {tagsText}
      </ReadOnlyText>
      <StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>
    </section>
  );
}

function ReadOnlyText({
  id,
  label,
  placeholder,
  copy,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  // Undefined until there is text to copy.
  readonly copy: (() => void) | undefined;
  readonly children: string | undefined;
}) {
  return (
    <div className="flex min-w-0 max-w-[75ch] flex-col gap-1">
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
          children === undefined ? "text-ink3" : "text-ink",
        )}
      >
        {children ?? placeholder}
      </section>
    </div>
  );
}
