import {
  defaultExpectedWords,
  everyMinutesMax,
  everyMinutesMin,
  expectedWordsMax,
  imageCountsOf,
  imagesPerHourMax,
  imagesPerHourMin,
  narrationMinutes,
  perHourFromMinutes,
  scaledImagesMax,
  scaledTarget,
  wordCount,
} from "@app/slices/images/scale.js";
import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { type ReactElement, useId } from "react";
import { InfoTip } from "@/components/kit/info-tip";
import { Segmented, Switch } from "@/components/kit/switch";
import { Input } from "@/components/ui/input";

type Every = "minutes" | "hour";

// Where it starts when switched on: an image every two minutes of narration.
const firstScale = { every: "minutes" as const, value: "2" };

const help =
  "Adds images as the narration gets longer, planned from the expected length when the run starts. Each ticked prompt keeps its own Number; the extra images are shared among them in order. A long video pans and zooms by turns so it stays watchable.";

// Images → More images for long videos, on Play. It edits the draft document itself, so what
// was typed survives a reload; the run gets it as images per hour (`images/scale.ts`).
export function ImageScaleControl({
  document,
  problem,
  onEdit,
}: {
  readonly document: PlayDraftDocument;
  readonly problem: (field: string) => string | undefined;
  readonly onEdit: (next: PlayDraftDocument) => void;
}): ReactElement {
  const id = useId();
  const { form } = document;
  const scale = form.imageScale;
  const issue = problem("imageScale.value") ?? problem("imageScale");
  const line =
    scale === undefined
      ? undefined
      : issue === undefined
        ? imageScaleLine(document)
        : { text: issue, problem: true };
  const edit = (next: PlayDraftDocument["form"]["imageScale"]) => {
    const { imageScale: _dropped, ...rest } = form;
    onEdit({
      ...document,
      form: {
        ...rest,
        ...(next === undefined ? {} : { imageScale: next }),
        // A long video pans and zooms by turns. Only the starting style is switched, so a
        // Pan or Still the user picked stays; they can pick Zoom again under Export → Motion.
        ...(next !== undefined && scale === undefined && form.motionStyle === "zoom"
          ? { motionStyle: "mixed" as const }
          : {}),
      },
    });
  };
  return (
    <div className="flex basis-full flex-col items-start gap-2">
      <span className="flex items-center gap-2">
        <Switch
          checked={scale !== undefined}
          label="More images for long videos"
          describedBy={`${id}-line`}
          onChange={(on) => edit(on ? firstScale : undefined)}
        />
        <InfoTip label="more images for long videos">
          <p>{help}</p>
        </InfoTip>
      </span>
      {scale === undefined ? null : (
        <span className="flex flex-wrap items-center gap-2 text-small">
          <Segmented<Every>
            label="How the rate is given"
            value={scale.every}
            options={[
              { value: "minutes", label: "Every N minutes" },
              { value: "hour", label: "N per hour" },
            ]}
            onChange={(every) => edit({ every, value: convert(scale.value, scale.every, every) })}
          />
          {scale.every === "minutes" ? <span>One image every</span> : null}
          <Input
            id={`${id}-value`}
            data-play-field="imageScale.value"
            aria-label={scale.every === "minutes" ? "Minutes per image" : "Images per hour"}
            inputMode="decimal"
            className="w-[72px] tabular-nums"
            aria-invalid={line?.problem === true}
            aria-describedby={`${id}-line`}
            value={scale.value}
            onChange={(event) => edit({ every: scale.every, value: event.target.value })}
          />
          <span>{scale.every === "minutes" ? "minutes" : "images per hour"}</span>
        </span>
      )}
      {line === undefined ? null : (
        <p
          id={`${id}-line`}
          className={line.problem ? "m-0 text-label text-red" : "m-0 text-label text-ink3"}
        >
          {line.text}
        </p>
      )}
    </div>
  );
}

// Switching how the rate is given keeps the rate: every 5 minutes is 12 per hour.
function convert(value: string, from: Every, to: Every): string {
  if (from === to) return value;
  const typed = Number(value.trim());
  if (value.trim() === "" || !Number.isFinite(typed) || typed <= 0) return value;
  return String(Math.round((60 / typed) * 100) / 100);
}

// What the setting makes for the length the run expects, in one line.
export function imageScaleLine(document: PlayDraftDocument): {
  readonly text: string;
  readonly problem: boolean;
} {
  const { form } = document;
  const scale = form.imageScale;
  if (scale === undefined) return { text: "", problem: false };
  const typed = Number(scale.value.trim());
  const minutes = scale.every === "minutes";
  const valid =
    scale.value.trim() !== "" &&
    (minutes
      ? typed >= everyMinutesMin && typed <= everyMinutesMax
      : typed >= imagesPerHourMin && typed <= imagesPerHourMax);
  if (!valid)
    return {
      text: minutes
        ? `Enter a number of minutes between ${String(everyMinutesMin)} and ${String(everyMinutesMax)}.`
        : `Enter a number of images per hour between ${String(imagesPerHourMin)} and ${String(imagesPerHourMax)}.`,
      problem: true,
    };
  const perHour = minutes ? perHourFromMinutes(typed) : typed;
  const provided = form.sources.article === "provide";
  const expected = Number(document.expectedWords.trim());
  const words = provided
    ? Math.max(1, wordCount(form.provided.article))
    : Number.isInteger(expected) && expected >= 1 && expected <= expectedWordsMax
      ? expected
      : defaultExpectedWords;
  const imagePrompts = form.imagePrompts.map((prompt) => ({
    name: prompt.name,
    number: Math.max(0, Number.parseInt(prompt.number, 10) || 0),
  }));
  const floor = imagePrompts.reduce((sum, prompt) => sum + prompt.number, 0);
  const scaled = { perHour, words };
  const total = imageCountsOf({ imagePrompts, imageScale: scaled, sources: form.sources }).reduce(
    (sum, count) => sum + count,
    0,
  );
  const length = `about ${String(Math.max(1, Math.round(narrationMinutes(words))))} minutes (${words.toLocaleString("en-US")} words ${provided ? "in the article" : "expected, set on Review"})`;
  if (imagePrompts.length === 0)
    return { text: `For ${length}: tick an image prompt to see the count.`, problem: false };
  const capped =
    scaledTarget(scaled) >= scaledImagesMax
      ? ` That is the most a run makes (${String(scaledImagesMax)}); the images repeat after that.`
      : "";
  return {
    text:
      total > floor
        ? `For ${length}: ${String(total)} images, ${String(total - floor)} more than the prompts' ${String(floor)}.${capped}`
        : `For ${length}: the prompts' ${String(floor)} images already cover it.`,
    problem: false,
  };
}
