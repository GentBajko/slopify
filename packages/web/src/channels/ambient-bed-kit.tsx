import type { BrandKit } from "@app/slices/channels/model.js";
import {
  type AmbientBedForm,
  ambientBedFormOf,
  ambientBedOfForm,
  ambientBedProblems,
  builtInBeds,
} from "@app/slices/video/ambient-bed.js";
import type { ReactElement } from "react";
import { AmbientBedControls } from "@/video/ambient-bed-controls";

// The brand kit's ambient sound: one of the built-in beds, for every template that leaves its
// own unset. A channel has no file store of its own, so My own file is a template's choice.
export function ChannelAmbientBed({
  value,
  onChange,
}: {
  readonly value: AmbientBedForm | undefined;
  readonly onChange: (next: AmbientBedForm | undefined) => void;
}): ReactElement {
  const settings = ambientBedOfForm(value);
  const problems = settings === undefined ? [] : ambientBedProblems(settings);
  return (
    <AmbientBedControls
      value={value}
      inherit="Not set"
      sources={builtInBeds}
      offerNone={false}
      fieldPrefix="brand.ambientBed"
      problem={(field) => problems.find((problem) => problem.field === field)?.message}
      onChange={onChange}
    />
  );
}

// The form the kit's saved bed opens with.
export function channelBedForm(brand: BrandKit): AmbientBedForm | undefined {
  return brand.ambientBed === undefined ? undefined : ambientBedFormOf(brand.ambientBed);
}

// What the save sends: the bed when one is picked, nothing when it is Not set, and `blocked`
// while a number is out of range (the problem is said under it).
export function channelBedOf(value: AmbientBedForm | undefined): {
  readonly brand: Pick<BrandKit, "ambientBed">;
  readonly blocked: boolean;
} {
  const settings = ambientBedOfForm(value);
  if (settings === undefined || settings.source === "upload") return { brand: {}, blocked: false };
  return {
    brand: { ambientBed: { ...settings, source: settings.source } },
    blocked: ambientBedProblems(settings).length > 0,
  };
}
