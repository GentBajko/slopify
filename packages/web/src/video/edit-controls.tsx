import { wordTimingUnavailable } from "@app/kernel/ports/languages.js";
import {
  type AnimateMode,
  type Atmosphere,
  animateEveryMax,
  animateEveryMin,
  animateModeLabels,
  animateModes,
  atmosphereLabels,
  atmospheres,
  type ColorGrade,
  type CutMode,
  colorGradeLabels,
  colorGrades,
  cutModeLabels,
  cutModes,
  type LookLevel,
  legacyVideoEdit,
  lookLevelLabels,
  lookLevels,
  type TransitionKind,
  transitionKinds,
  transitionLabels,
  transitionSecondsSteps,
  type VideoEditSettings,
} from "@app/slices/video/edit-settings.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, type ReactNode, useId } from "react";
import { useApp } from "@/app-context";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Picker } from "@/components/ui/picker";
import type { HelpId } from "@/help/catalog";
import { videoModelsQuery } from "@/lib/models";
import { cn } from "@/lib/utils";

// The Video stage's edit settings, as Play's Export rail and Edit project draw them: a Cuts
// picker beside Motion, and one "Look" row that opens to the rest. A project without the
// settings shows today's slideshow (`legacyVideoEdit`) and only gets settings once one is
// changed, so an untouched old project saves exactly what it had.

export function useVideoEditControls({
  value,
  narrated,
  imageProvider,
  problem,
  onChange,
  fieldPrefix = "videoEdit",
  language,
}: {
  // The project language: one without word timing cuts every N seconds, whatever is picked.
  readonly language?: string | undefined;
  readonly value: VideoEditSettings | undefined;
  readonly narrated: boolean;
  readonly imageProvider: string;
  readonly problem?: ((field: string) => string | undefined) | undefined;
  readonly onChange: (next: VideoEditSettings) => void;
  readonly fieldPrefix?: string;
}): { readonly cuts: ReactElement; readonly look: ReactElement } {
  const id = useId();
  const edit = value ?? legacyVideoEdit;
  const set = (next: Partial<VideoEditSettings>): void => onChange({ ...edit, ...next });
  const { api } = useApp();
  const models = useQuery(videoModelsQuery(api, imageProvider, edit.animate !== "off"));
  const issue = (field: string) => problem?.(`${fieldPrefix}.${field}`);
  const summary = [
    edit.transition === "cut"
      ? undefined
      : `${transitionLabels[edit.transition]} ${String(edit.transitionSeconds)} s`,
    edit.grade === "none" ? undefined : colorGradeLabels[edit.grade],
    edit.atmosphere === "none" ? undefined : atmosphereLabels[edit.atmosphere],
    edit.vignette === "off" ? undefined : "Vignette",
    edit.grain === "off" ? undefined : "Grain",
    edit.chapterCards ? "Chapter cards" : undefined,
    edit.animate === "off" ? undefined : "Animated images",
  ].filter((part) => part !== undefined);
  const problems = [
    "transition",
    "transitionSeconds",
    "chapterCards",
    "animate",
    "animateEvery",
    "animateModel",
  ]
    .map(issue)
    .filter((message) => message !== undefined);
  const offered = models.data?.models ?? [];
  const savedModel =
    edit.animateModel !== "" && !offered.some((one) => one.id === edit.animateModel);

  const noWordTiming = wordTimingUnavailable(language);
  const cuts = (
    <Row id={`${id}-cuts`} label="Cuts" tip="project.video.cuts">
      <Picker
        id={`${id}-cuts`}
        data-play-field={`${fieldPrefix}.cuts`}
        className="w-auto min-w-[160px]"
        value={noWordTiming === undefined ? edit.cuts : "interval"}
        disabled={noWordTiming !== undefined}
        aria-describedby={noWordTiming === undefined ? undefined : `${id}-cuts-note`}
        onChange={(event) => set({ cuts: event.target.value as CutMode })}
      >
        {cutModes.map((mode) => (
          <option key={mode} value={mode}>
            {cutModeLabels[mode]}
          </option>
        ))}
      </Picker>
      {noWordTiming === undefined ? null : (
        <p id={`${id}-cuts-note`} className="m-0 basis-full text-small text-ink-3">
          {noWordTiming}
        </p>
      )}
    </Row>
  );

  const look = (
    <details className="group min-w-0 rounded-control border border-line-strong">
      <summary className="flex min-h-10 cursor-pointer items-center gap-3 px-3 text-small max-[1099px]:min-h-11">
        <span className="font-semibold">Look</span>
        <span className="min-w-0 truncate text-ink-3">
          {summary.length === 0 ? "Plain cuts, no effects" : summary.join(" · ")}
        </span>
      </summary>
      <div className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-3 border-line-strong border-t p-3 min-[700px]:grid-cols-2">
        <Row id={`${id}-transition`} label="Transition" tip="project.video.transition">
          <Picker
            id={`${id}-transition`}
            data-play-field={`${fieldPrefix}.transition`}
            className="w-auto min-w-[150px]"
            value={edit.transition}
            onChange={(event) => set({ transition: event.target.value as TransitionKind })}
          >
            {transitionKinds.map((kind) => (
              <option key={kind} value={kind}>
                {transitionLabels[kind]}
              </option>
            ))}
          </Picker>
          <Picker
            aria-label="Transition length"
            data-play-field={`${fieldPrefix}.transitionSeconds`}
            aria-invalid={issue("transitionSeconds") !== undefined}
            className="w-auto min-w-[80px]"
            disabled={edit.transition === "cut"}
            value={String(edit.transitionSeconds)}
            onChange={(event) => set({ transitionSeconds: Number(event.target.value) })}
          >
            {transitionSecondsSteps.map((seconds) => (
              <option key={seconds} value={String(seconds)}>
                {seconds} s
              </option>
            ))}
          </Picker>
        </Row>
        <Row id={`${id}-grade`} label="Colour grade" tip="project.video.grade">
          <Choice
            id={`${id}-grade`}
            field={`${fieldPrefix}.grade`}
            value={edit.grade}
            options={colorGrades}
            labels={colorGradeLabels}
            onChange={(grade: ColorGrade) => set({ grade })}
          />
        </Row>
        <Row id={`${id}-vignette`} label="Vignette" tip="project.video.vignette">
          <Choice
            id={`${id}-vignette`}
            field={`${fieldPrefix}.vignette`}
            value={edit.vignette}
            options={lookLevels}
            labels={lookLevelLabels}
            onChange={(vignette: LookLevel) => set({ vignette })}
          />
        </Row>
        <Row id={`${id}-grain`} label="Film grain" tip="project.video.grain">
          <Choice
            id={`${id}-grain`}
            field={`${fieldPrefix}.grain`}
            value={edit.grain}
            options={lookLevels}
            labels={lookLevelLabels}
            onChange={(grain: LookLevel) => set({ grain })}
          />
        </Row>
        <Row id={`${id}-atmosphere`} label="Atmosphere" tip="project.video.atmosphere">
          <Choice
            id={`${id}-atmosphere`}
            field={`${fieldPrefix}.atmosphere`}
            value={edit.atmosphere}
            options={atmospheres}
            labels={atmosphereLabels}
            onChange={(atmosphere: Atmosphere) => set({ atmosphere })}
          />
        </Row>
        <Row id={`${id}-cards`} label="Chapter cards" tip="project.video.chapter-cards">
          <input
            id={`${id}-cards`}
            type="checkbox"
            data-play-field={`${fieldPrefix}.chapterCards`}
            className="size-4 accent-accent"
            checked={edit.chapterCards}
            disabled={!narrated && !edit.chapterCards}
            onChange={(event) => set({ chapterCards: event.currentTarget.checked })}
          />
        </Row>
        <Row id={`${id}-animate`} label="Animate images" tip="project.video.animate" wide>
          <Picker
            id={`${id}-animate`}
            data-play-field={`${fieldPrefix}.animate`}
            aria-invalid={issue("animate") !== undefined}
            className="w-auto min-w-[150px]"
            value={edit.animate}
            onChange={(event) => set({ animate: event.target.value as AnimateMode })}
          >
            {animateModes.map((mode) => (
              <option key={mode} value={mode} disabled={mode === "chapters" && !narrated}>
                {animateModeLabels[mode]}
              </option>
            ))}
          </Picker>
          <Picker
            aria-label="Animate every how many images"
            data-play-field={`${fieldPrefix}.animateEvery`}
            aria-invalid={issue("animateEvery") !== undefined}
            className="w-auto min-w-[80px]"
            disabled={edit.animate !== "every"}
            value={String(edit.animateEvery)}
            onChange={(event) => set({ animateEvery: Number(event.target.value) })}
          >
            {Array.from(
              { length: animateEveryMax - animateEveryMin + 1 },
              (_value, at) => at + animateEveryMin,
            ).map((every) => (
              <option key={every} value={String(every)}>
                every {every}
              </option>
            ))}
          </Picker>
          <Picker
            aria-label="Image-to-video model"
            data-play-field={`${fieldPrefix}.animateModel`}
            aria-invalid={issue("animateModel") !== undefined}
            className="w-auto min-w-[180px]"
            disabled={edit.animate === "off"}
            value={edit.animateModel}
            onChange={(event) => set({ animateModel: event.target.value })}
          >
            <option value="">Choose a model</option>
            {savedModel ? (
              <option value={edit.animateModel}>{edit.animateModel} (saved choice)</option>
            ) : null}
            {offered.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </Picker>
        </Row>
        {problems.length > 0 ? (
          <p className="col-span-full text-small text-danger">{problems[0]}</p>
        ) : edit.animate !== "off" && models.isSuccess && offered.length === 0 ? (
          <p className="col-span-full text-label text-ink-3">
            This image provider has no image-to-video models. Choose fal.ai or Replicate for images
            to animate them.
          </p>
        ) : null}
      </div>
    </details>
  );
  return { cuts, look };
}

function Row({
  id,
  label,
  tip,
  wide = false,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly tip: HelpId;
  readonly wide?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-2 text-small",
        wide && "min-[700px]:col-span-2",
      )}
      {...helpScope}
    >
      <label htmlFor={id} className="min-w-[96px]">
        {label}
      </label>
      {children}
      <InfoTip id={tip} label={label.toLowerCase()} />
    </div>
  );
}

function Choice<T extends string>({
  id,
  field,
  value,
  options,
  labels,
  onChange,
}: {
  readonly id: string;
  readonly field: string;
  readonly value: T;
  readonly options: readonly T[];
  readonly labels: Readonly<Record<T, string>>;
  readonly onChange: (next: T) => void;
}): ReactElement {
  return (
    <Picker
      id={id}
      data-play-field={field}
      className="w-auto min-w-[130px]"
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels[option]}
        </option>
      ))}
    </Picker>
  );
}
