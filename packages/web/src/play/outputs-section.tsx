import type { Entry } from "@app/slices/library/model.js";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
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
        advanced={
          <>
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
            <div className="col-span-full flex flex-wrap gap-2">
              {form.narrationPrompt ? (
                <Button variant="ghost" onClick={() => props.onKeyword("llm")}>
                  Choose Text Generation in Content
                </Button>
              ) : null}
              <Button variant="ghost" onClick={props.onSettings}>
                Settings
              </Button>
            </div>
          </>
        }
      />
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
      <VideoRail
        {...props}
        rawTiming={{
          imageSeconds: document.form.imageSeconds,
          zoomPercent: document.form.zoomPercent,
          edgeSilenceSeconds: document.form.edgeSilenceSeconds,
          onChange: (field, value) =>
            session.edit({ ...document, form: { ...document.form, [field]: value } }),
        }}
      />
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
