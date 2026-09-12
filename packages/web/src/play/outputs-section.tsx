import type { Entry } from "@app/slices/library/model.js";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
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
  const { form, entries, problem, update } = props;
  return (
    <>
      <AudioRail {...props} />
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
      <ImagesRail {...props} />
      <ThumbnailRail {...props} />
      <VideoRail {...props} />
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
