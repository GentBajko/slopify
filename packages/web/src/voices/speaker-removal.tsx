import { type Speaker, speakersMax, type VoicesSettings } from "@app/slices/voices/model.js";
import { type ReactElement, useMemo, useRef } from "react";
import { Button } from "@/components/kit/button";
import { useToast } from "@/components/kit/toast";
import { type Selection, SelectionBar, useSelection } from "@/components/selection";

// Removing speakers, one by its Remove button or the ticked ones together, with Undo in the
// message that follows: Undo puts each back where it was. A format with several voices keeps
// at least one speaker; Narration under Format removes them all.

// Ticks show from this many speakers: with two, only one can go, and its Remove does that.
export const selectFrom = 3;

export interface SpeakerRemoval {
  readonly selection: Selection<string> | undefined;
  readonly remove: (ids: readonly string[]) => void;
}

export function useSpeakerRemoval(
  value: VoicesSettings | undefined,
  onChange: (next: VoicesSettings | undefined) => void,
): SpeakerRemoval {
  const notify = useToast();
  const speakers = value?.speakers;
  const keys = useMemo(() => (speakers ?? []).map((speaker) => speaker.id), [speakers]);
  const selection = useSelection(keys);
  // Undo runs after later edits, so it works on the settings as they are then.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  const remove = (ids: readonly string[]): void => {
    const current = latest.current.value;
    if (current === undefined) return;
    const gone = new Set(ids);
    const removed = current.speakers.flatMap((speaker, index) =>
      gone.has(speaker.id) ? [{ index, speaker }] : [],
    );
    if (removed.length === 0 || removed.length >= current.speakers.length) return;
    latest.current.onChange({
      ...current,
      speakers: current.speakers.filter((speaker) => !gone.has(speaker.id)),
    });
    for (const id of ids) if (selection.has(id)) selection.toggle(id);
    const first = removed[0]?.speaker;
    notify(
      removed.length === 1 && first !== undefined
        ? `Removed ${first.name.trim() || "the speaker"}.`
        : `Removed ${String(removed.length)} speakers.`,
      "success",
      { label: "Undo", run: () => restore(removed) },
    );
  };

  const restore = (removed: readonly { index: number; speaker: Speaker }[]): void => {
    const current = latest.current.value;
    if (current === undefined) {
      notify(
        "Couldn't put the speakers back: the format is Narration now. Pick the format again under Format, then add them with Add speaker.",
        "error",
      );
      return;
    }
    const missing = removed.filter(
      (one) => !current.speakers.some((speaker) => speaker.id === one.speaker.id),
    );
    if (current.speakers.length + missing.length > speakersMax) {
      notify(
        `Couldn't put the speakers back: a format holds at most ${String(speakersMax)} speakers. Remove ${String(current.speakers.length + missing.length - speakersMax)} with their Remove buttons, then press Undo again.`,
        "error",
      );
      return;
    }
    const next = [...current.speakers];
    for (const one of missing) next.splice(Math.min(one.index, next.length), 0, one.speaker);
    latest.current.onChange({ ...current, speakers: next });
  };

  return {
    selection: (speakers?.length ?? 0) >= selectFrom ? selection : undefined,
    remove,
  };
}

// The bar above the speakers: Select all, the count, and Remove selected.
export function SpeakerSelectionBar({
  removal,
  total,
}: {
  readonly removal: SpeakerRemoval;
  readonly total: number;
}): ReactElement | null {
  const selection = removal.selection;
  if (selection === undefined) return null;
  const all = selection.count >= total;
  return (
    <SelectionBar
      selection={selection}
      total={total}
      noun={["speaker", "speakers"]}
      actions={
        <Button
          size="small"
          variant="secondary"
          disabled={selection.count === 0 || all}
          disabledReason={
            all
              ? "Keep at least one speaker. To remove them all, pick Narration under Format."
              : "Nothing is selected"
          }
          onClick={() => removal.remove(selection.selected)}
        >
          Remove selected
        </Button>
      }
    />
  );
}
