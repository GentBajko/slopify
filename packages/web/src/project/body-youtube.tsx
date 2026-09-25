import { useId, useState } from "react";
import { StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { ActionRow, OutputDownload, useOutputText } from "./parts.js";

// The Video stage's YouTube block: the description and the tags as written, each with Copy,
// and both files to download. Everything stays mounted while the step runs or waits, so
// nothing moves when the text lands; a copy says how it went in the reserved status line.
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
      className="flex min-w-0 flex-col gap-3 rounded-control border border-line p-4"
    >
      <h3 id={`${id}-title`} className="text-small font-semibold">
        YouTube
      </h3>
      <label htmlFor={`${id}-description`} className="flex min-w-0 flex-col gap-1 text-small">
        Description
        <Textarea
          id={`${id}-description`}
          readOnly
          rows={8}
          placeholder={waiting}
          value={descriptionText ?? ""}
        />
      </label>
      <label htmlFor={`${id}-tags`} className="flex min-w-0 flex-col gap-1 text-small">
        Tags
        <Textarea
          id={`${id}-tags`}
          readOnly
          rows={2}
          placeholder={waiting}
          value={tagsText ?? ""}
        />
      </label>
      <ActionRow>
        <Button
          type="button"
          disabled={descriptionText === undefined}
          onClick={() => copy(descriptionText, "description")}
        >
          Copy description
        </Button>
        <Button
          type="button"
          disabled={tagsText === undefined}
          onClick={() => copy(tagsText, "tags")}
        >
          Copy tags
        </Button>
        {description === undefined ? null : (
          <OutputDownload output={description} label="Download description.txt" />
        )}
        {tags === undefined ? null : <OutputDownload output={tags} label="Download tags.txt" />}
      </ActionRow>
      <StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>
    </section>
  );
}
