import type { Entry } from "@app/slices/library/model.js";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { CheckpointControls } from "./checkpoints";
import { usePlaySession } from "./draft-context";
import { AudioRail, ImagesRail } from "./media-rails";
import { OptionPicker } from "./pickers";
import type { RailProps } from "./rail-frame";
import { ThumbnailRail, VideoRail } from "./stage-rails";
export function OutputsSection(
  props: RailProps & {
    readonly entries: readonly Entry[];
    readonly missingKeyword: string | undefined;
    readonly onKeyword: (field: string) => void;
    readonly onSettings: () => void;
  },
): ReactElement {
  const session = usePlaySession();
  const document = session.document;
  const { form, entries, problem, update } = props;
  return (
    <>
      <AudioRail
        {...props}
        rawCounts={{
          ...document.form.chunking,
          onChange: (mode, amount) =>
            session.edit({
              ...document,
              form: {
                ...document.form,
                chunking: {
                  ...document.form.chunking,
                  mode,
                  ...(mode === "words"
                    ? { words: amount }
                    : mode === "characters"
                      ? { characters: amount }
                      : {}),
                },
              },
            }),
        }}
      />
      {form.sources.audio === "generate" ? (
        <div className="grid grid-cols-1 gap-4 border-b border-line py-4 min-[700px]:grid-cols-2">
          {(["intro", "outro"] as const).map((kind) => (
            <OptionPicker
              key={kind}
              field={kind}
              label={kind === "intro" ? "Intro" : "Outro"}
              value={form[kind]}
              placeholder="Off"
              options={entries
                .filter((entry) => entry.category === kind)
                .map((entry) => ({ value: entry.name, label: entry.name }))}
              problem={problem(kind)}
              onPick={(value) => update({ [kind]: value })}
            />
          ))}
          <Button variant="ghost" onClick={props.onSettings}>
            Settings
          </Button>
        </div>
      ) : null}
      <ImagesRail
        {...props}
        rawNumbers={{
          values: document.form.imagePrompts,
          onChange: (name, number) =>
            session.edit({
              ...document,
              form: {
                ...document.form,
                imagePrompts: document.form.imagePrompts.map((entry) =>
                  entry.name === name ? { ...entry, number } : entry,
                ),
              },
            }),
        }}
      />
      <ThumbnailRail {...props} />
      <VideoRail {...props} />
      <CheckpointControls problem={problem} />
      {props.missingKeyword ? (
        <p className="py-4 text-small text-ink2">
          A selected template needs keywords.{" "}
          <Button variant="ghost" onClick={() => props.onKeyword(props.missingKeyword ?? "values")}>
            Complete keywords in Content
          </Button>
        </p>
      ) : null}
    </>
  );
}
