import { castHosts } from "@app/slices/voices/cast.js";
import { type ReactElement, useId } from "react";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
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

// Play's first question: what the person is making. Each answer turns on the stages it needs
// and folds the rest of the setup away; the stages stay editable under their rows.
export function OutputPicker({
  form,
  update,
  onPicked,
}: {
  readonly form: PlayFormState;
  readonly update: (patch: Partial<PlayFormState>) => void;
  readonly onPicked?: (kind: OutputKind) => void;
}): ReactElement {
  const id = useId();
  const cast = useDraftCast();
  const current = outputKindOf(form);
  return (
    <div className="min-w-0" {...helpScope}>
      <span className="mb-2 flex items-center gap-1">
        <h2 id={id} className="m-0 text-small font-semibold">
          What are you making?
        </h2>
        <InfoTip id="play.output" className="-my-1" />
      </span>
      <ToggleGroup
        type="single"
        value={current}
        aria-labelledby={id}
        className="grid w-full grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2 overflow-visible border-0"
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
            className="flex min-h-16 min-w-0 flex-col items-start justify-center gap-0.5 rounded-control border border-line-strong bg-surface px-3 py-2 text-left last:border-r data-[state=on]:border-focus"
          >
            <span className="text-body font-semibold text-ink">{outputKindInfo[kind].label}</span>
            <span className="text-label text-ink-3">{outputKindInfo[kind].line}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
