import { type ReactElement, useId } from "react";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// One or three thumbnails. Three draws the same thumbnail prompt twice more with other
// compositions, for YouTube's Test & compare; each is regenerated on its own on the project
// page. Used on Play's Thumbnail rail and in Edit project → Thumbnail.
export function ThumbnailCountPicker({
  value,
  onPick,
  disabled = false,
}: {
  readonly value: 1 | 3;
  readonly onPick: (count: 1 | 3) => void;
  readonly disabled?: boolean;
}): ReactElement {
  const id = useId();
  return (
    <div className="flex min-w-0 items-center gap-3" {...helpScope}>
      <Label id={id} className="shrink-0">
        Thumbnails
      </Label>
      <ToggleGroup
        type="single"
        value={String(value)}
        aria-labelledby={id}
        disabled={disabled}
        data-play-field="thumbnailCount"
        onValueChange={(next) => {
          if (next === "1" || next === "3") onPick(next === "3" ? 3 : 1);
        }}
      >
        <ToggleGroupItem value="1">1</ToggleGroupItem>
        <ToggleGroupItem value="3">3</ToggleGroupItem>
      </ToggleGroup>
      <InfoTip id="play.thumbnail-count" />
    </div>
  );
}
