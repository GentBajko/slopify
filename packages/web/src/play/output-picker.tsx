import { castHosts } from "@app/slices/voices/cast.js";
import type { ReactElement } from "react";
import { helpScope } from "@/components/kit/info-tip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDraftCast } from "./channel-picker";
import {
  type OutputKind,
  outputKindInfo,
  outputKindOf,
  outputKindPatch,
  outputKinds,
} from "./output-kind";
import type { PlayFormState } from "./state";

// Create's first question, as the first row of the page: what the person is making. Each answer
// turns on the stages it needs and folds the rest of the setup away; the stages stay editable
// under their rows, and nothing above the topic moves when one is picked.
export function OutputPicker({
  form,
  update,
  onPicked,
}: {
  readonly form: PlayFormState;
  readonly update: (patch: Partial<PlayFormState>) => void;
  readonly onPicked?: (kind: OutputKind) => void;
}): ReactElement {
  const cast = useDraftCast();
  const current = outputKindOf(form);
  // Each tile's own line says what it makes: the choice's explanation, visible at rest. The
  // tiles count by the column's own width, not the window's, so a narrow column beside the
  // rail gets two or three to a row instead of five clipped ones.
  return (
    <div className="@container min-w-0" {...helpScope}>
      <ToggleGroup
        type="single"
        value={current}
        aria-label="What are you making?"
        className="grid w-full grid-cols-2 gap-2 overflow-visible border-0 @min-[440px]:grid-cols-3 @min-[640px]:grid-cols-5"
        onValueChange={(next) => {
          const picked = outputKinds.find((kind) => kind === next);
          if (picked === undefined || picked === current) return;
          update(outputKindPatch(form, picked, castHosts(cast)));
          onPicked?.(picked);
        }}
      >
        {outputKinds.map((kind: OutputKind) => (
          <ToggleGroupItem
            key={kind}
            value={kind}
            aria-label={outputKindInfo[kind].label}
            className="flex min-h-14 min-w-0 flex-col items-start justify-center gap-0 rounded-control border border-line-strong bg-surface px-3 py-1.5 text-left last:border-r data-[state=on]:border-focus data-[state=on]:bg-raised"
          >
            <span className="text-body font-semibold text-ink">{outputKindInfo[kind].label}</span>
            <span className="text-label text-ink-3" data-help-text="">
              {outputKindInfo[kind].line}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
