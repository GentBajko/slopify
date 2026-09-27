import {
  defaultExpectedWords,
  everyMinutesMax,
  everyMinutesMin,
  imageCountsOf,
  imageScaleForm,
  imagesPerHourMax,
  imagesPerHourMin,
  narrationMinutes,
  perHourFromMinutes,
  wordCount,
} from "@app/slices/images/scale.js";
import type { RevisionEdit } from "@app/slices/revisions/model.js";
import {
  type AmbientBedField,
  type AmbientBedForm,
  ambientBedFormOf,
  ambientBedOfForm,
  ambientBedProblems,
  builtInBeds,
} from "@app/slices/video/ambient-bed.js";
import { type ReactElement, useId, useState } from "react";
import { Input } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { Segmented, Switch } from "@/components/kit/switch";
import { AmbientBedControls } from "@/video/ambient-bed-controls";

// Edit project's ambient sound and More images for long videos: the channel essentials Play
// sets, changeable after the run. A setting left alone leaves the config exactly as it was, so
// nothing turns outdated; a change is saved like any other edit and the rebuild names what it
// makes again (the video for the bed, new images for a higher rate).

// The ambient bed. A project's own uploaded bed stays offered while it has one; a new file is
// chosen on Play. None removes it.
export function EditAmbientBed({
  edit,
  problem,
  onChange,
}: {
  readonly edit: RevisionEdit;
  readonly problem: (field: string) => string | undefined;
  readonly onChange: (next: RevisionEdit) => void;
}): ReactElement {
  const saved = edit.config.ambientBed;
  // The numbers stay as typed; the config gets what they parse to, checked on save.
  const [form, setForm] = useState<AmbientBedForm | undefined>(() =>
    saved === undefined ? undefined : ambientBedFormOf(saved),
  );
  const sources = saved?.source === "upload" ? [...builtInBeds, "upload" as const] : builtInBeds;
  const local = form === undefined ? [] : [...ambientBedProblemsOf(form)];
  return (
    <AmbientBedControls
      value={form}
      inherit="None"
      sources={sources}
      offerNone={false}
      problem={(field) =>
        problem(`ambientBed.${field}`) ?? local.find((one) => one.field === field)?.message
      }
      onChange={(next) => {
        setForm(next);
        const bed = ambientBedOfForm(next);
        const { ambientBed: _old, ...config } = edit.config;
        onChange({ ...edit, config: bed === undefined ? config : { ...config, ambientBed: bed } });
      }}
    />
  );
}

function ambientBedProblemsOf(
  form: AmbientBedForm,
): readonly { readonly field: AmbientBedField; readonly message: string }[] {
  const bed = ambientBedOfForm(form);
  return bed === undefined ? [] : ambientBedProblems(bed);
}

type Every = "minutes" | "hour";

// More images for long videos. The rate is typed as on Play; the length it is planned for is
// the one the project was planned with, or the article's own when it had none.
export function EditImageScale({
  edit,
  problem,
  onChange,
}: {
  readonly edit: RevisionEdit;
  readonly problem: (field: string) => string | undefined;
  readonly onChange: (next: RevisionEdit) => void;
}): ReactElement | null {
  const id = useId();
  const { config } = edit;
  const scale = config.imageScale;
  const [form, setForm] = useState<{ every: Every; value: string } | undefined>(() =>
    scale === undefined ? undefined : imageScaleForm(scale),
  );
  if (config.sources.images !== "generate") return null;
  const words =
    scale?.words ?? (wordCount(edit.content.articleMarkdown ?? "") || defaultExpectedWords);
  const set = (next: { every: Every; value: string } | undefined): void => {
    setForm(next);
    const { imageScale: _old, ...rest } = config;
    if (next === undefined) {
      onChange({ ...edit, config: rest });
      return;
    }
    const perHour = perHourOf(next);
    // A rate still being typed keeps the last good one in the draft; the line says what to fix.
    if (perHour === undefined) return;
    onChange({
      ...edit,
      config: {
        ...rest,
        imageScale: { perHour, words },
        // A long video pans and zooms by turns, as Play switches it.
        ...(scale === undefined && config.motionStyle === "zoom"
          ? { motionStyle: "mixed" as const }
          : {}),
      },
    });
  };
  const floor = config.imagePrompts.reduce((sum, prompt) => sum + prompt.number, 0);
  const total =
    scale === undefined ? floor : imageCountsOf(config).reduce((sum, count) => sum + count, 0);
  const typed = form === undefined ? undefined : perHourOf(form);
  const line =
    form === undefined
      ? undefined
      : typed === undefined
        ? {
            problem: true,
            text:
              form.every === "minutes"
                ? `Enter a number of minutes between ${String(everyMinutesMin)} and ${String(everyMinutesMax)}.`
                : `Enter a number of images per hour between ${String(imagesPerHourMin)} and ${String(imagesPerHourMax)}.`,
          }
        : {
            problem: false,
            text: `For about ${String(Math.max(1, Math.round(narrationMinutes(words))))} minutes of narration: ${String(total)} images${total > floor ? `, ${String(total - floor)} more than the prompts' ${String(floor)}` : ", which the prompts' Numbers already cover"}.`,
          };
  const shown = problem("imageScale") ?? undefined;
  return (
    <div className="flex flex-col items-start gap-2" {...helpScope}>
      <Switch
        checked={form !== undefined}
        label="More images for long videos"
        describedBy={`${id}-line`}
        tip="play.image-scale"
        onChange={(on) => set(on ? { every: "minutes", value: "2" } : undefined)}
      />
      {form === undefined ? null : (
        <span className="flex flex-wrap items-center gap-2 text-small">
          <Segmented<Every>
            label="How the rate is given"
            value={form.every}
            options={[
              { value: "minutes", label: "Every N minutes" },
              { value: "hour", label: "N per hour" },
            ]}
            onChange={(every) => set({ every, value: convert(form.value, form.every, every) })}
          />
          {form.every === "minutes" ? <span>One image every</span> : null}
          <Input
            aria-label={form.every === "minutes" ? "Minutes per image" : "Images per hour"}
            inputMode="decimal"
            className="w-[72px] tabular-nums"
            aria-invalid={line?.problem === true}
            aria-describedby={`${id}-line`}
            value={form.value}
            onChange={(event) => set({ every: form.every, value: event.target.value })}
          />
          <span>{form.every === "minutes" ? "minutes" : "images per hour"}</span>
        </span>
      )}
      {shown === undefined && line === undefined ? null : (
        <p
          id={`${id}-line`}
          className={
            shown !== undefined || line?.problem
              ? "m-0 text-label text-danger"
              : "m-0 text-label text-ink-3"
          }
        >
          {shown ?? line?.text}
        </p>
      )}
    </div>
  );
}

function perHourOf(form: { readonly every: Every; readonly value: string }): number | undefined {
  const typed = Number(form.value.trim());
  if (form.value.trim() === "" || !Number.isFinite(typed)) return undefined;
  if (form.every === "minutes")
    return typed >= everyMinutesMin && typed <= everyMinutesMax
      ? perHourFromMinutes(typed)
      : undefined;
  return typed >= imagesPerHourMin && typed <= imagesPerHourMax ? typed : undefined;
}

// Switching how the rate is given keeps the rate: every 5 minutes is 12 per hour.
function convert(value: string, from: Every, to: Every): string {
  if (from === to) return value;
  const typed = Number(value.trim());
  if (value.trim() === "" || !Number.isFinite(typed) || typed <= 0) return value;
  return String(Math.round((60 / typed) * 100) / 100);
}
