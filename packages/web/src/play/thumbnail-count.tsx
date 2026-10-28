import { type ReactElement, useId } from "react";
import { HelpLine } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// One or three thumbnails. Three draws the same thumbnail prompt twice more with other
// compositions, for YouTube's Test & compare; each is made again on its own on the project
// page. Used on Play's Thumbnail rail and in Edit project → Thumbnail. What three costs is said
// in the line under the choice, not behind an info button beside it.
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
    <div className="flex min-w-0 flex-col gap-1" {...helpScope}>
      <div className="flex min-w-0 items-center gap-3">
        <span id={id} className="sl-field__label block shrink-0">
          How many thumbnails
        </span>
        <ToggleGroup
          type="single"
          value={String(value)}
          aria-labelledby={id}
          aria-describedby={`${id}-help`}
          disabled={disabled}
          data-play-field="thumbnailCount"
          onValueChange={(next) => {
            if (next === "1" || next === "3") onPick(next === "3" ? 3 : 1);
          }}
        >
          <ToggleGroupItem value="1">1</ToggleGroupItem>
          <ToggleGroupItem value="3">3</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <HelpLine id={`${id}-help`}>
        3 makes two more versions for YouTube's Test & compare · one image call each.
      </HelpLine>
    </div>
  );
}
