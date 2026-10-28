import { wordTimingUnavailable } from "@app/kernel/ports/languages.js";
import type { ModelStandingView } from "@app/slices/model-checks/model.js";
import { badgeOf } from "@app/slices/model-checks/rules.js";
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
import { Checkbox, HelpLine } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Picker } from "@/components/ui/picker";
import type { HelpId } from "@/help/catalog";
import { videoModelsQuery } from "@/lib/models";
import { cn } from "@/lib/utils";

// The Video stage's edit settings, as Create's Video and style row and Edit project draw them: a
// Cuts picker beside Motion, and one "Look" fold that opens to the rest. A project without the
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
    <Row
      id={`${id}-cuts`}
      label="Cuts"
      help={
        noWordTiming === undefined
          ? "Follow the narration starts each image at a sentence end, about Seconds per image apart. The images start again when they run out."
          : undefined
      }
    >
      <Picker
        id={`${id}-cuts`}
        data-play-field={`${fieldPrefix}.cuts`}
        className="min-w-0"
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
    <Fold
      summary="Look"
      state={summary.length === 0 ? "Plain cuts, no effects" : summary.join(" · ")}
    >
      <div className="sl-fields pt-2 pb-3" {...helpScope}>
        <HelpLine className="sl-fields__wide">
          Drawn on this computer at no cost; only animated images are charged, by the image service.
        </HelpLine>
        <Row id={`${id}-transition`} label="Transition">
          <Picker
            id={`${id}-transition`}
            data-play-field={`${fieldPrefix}.transition`}
            className="min-w-0"
            value={edit.transition}
            onChange={(event) => set({ transition: event.target.value as TransitionKind })}
          >
            {transitionKinds.map((kind) => (
              <option key={kind} value={kind}>
                {transitionLabels[kind]}
              </option>
            ))}
          </Picker>
          {edit.transition === "cut" && issue("transitionSeconds") === undefined ? null : (
            <Picker
              aria-label="Transition length"
              data-play-field={`${fieldPrefix}.transitionSeconds`}
              aria-invalid={issue("transitionSeconds") !== undefined}
              className="w-24 flex-none"
              value={String(edit.transitionSeconds)}
              onChange={(event) => set({ transitionSeconds: Number(event.target.value) })}
            >
              {transitionSecondsSteps.map((seconds) => (
                <option key={seconds} value={String(seconds)}>
                  {seconds} s
                </option>
              ))}
            </Picker>
          )}
        </Row>
        <Row id={`${id}-grade`} label="Color grade">
          <Choice
            id={`${id}-grade`}
            field={`${fieldPrefix}.grade`}
            value={edit.grade}
            options={colorGrades}
            labels={colorGradeLabels}
            onChange={(grade: ColorGrade) => set({ grade })}
          />
        </Row>
        <Row id={`${id}-vignette`} label="Vignette">
          <Choice
            id={`${id}-vignette`}
            field={`${fieldPrefix}.vignette`}
            value={edit.vignette}
            options={lookLevels}
            labels={lookLevelLabels}
            onChange={(vignette: LookLevel) => set({ vignette })}
          />
        </Row>
        <Row id={`${id}-grain`} label="Film grain">
          <Choice
            id={`${id}-grain`}
            field={`${fieldPrefix}.grain`}
            value={edit.grain}
            options={lookLevels}
            labels={lookLevelLabels}
            onChange={(grain: LookLevel) => set({ grain })}
          />
        </Row>
        <Row id={`${id}-atmosphere`} label="Atmosphere">
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
          <Checkbox
            id={`${id}-cards`}
            data-play-field={`${fieldPrefix}.chapterCards`}
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
            className="min-w-0"
            value={edit.animate}
            onChange={(event) => set({ animate: event.target.value as AnimateMode })}
          >
            {animateModes.map((mode) => (
              <option key={mode} value={mode} disabled={mode === "chapters" && !narrated}>
                {animateModeLabels[mode]}
              </option>
            ))}
          </Picker>
          {edit.animate === "every" || issue("animateEvery") !== undefined ? (
            <Picker
              aria-label="Animate every how many images"
              data-play-field={`${fieldPrefix}.animateEvery`}
              aria-invalid={issue("animateEvery") !== undefined}
              className="w-24 flex-none"
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
          ) : null}
          {edit.animate === "off" && issue("animateModel") === undefined ? null : (
            <Picker
              aria-label="Image-to-video model"
              data-play-field={`${fieldPrefix}.animateModel`}
              aria-invalid={issue("animateModel") !== undefined}
              className="min-w-0"
              value={edit.animateModel}
              onChange={(event) => set({ animateModel: event.target.value })}
            >
              <option value="">Choose a model</option>
              {savedModel ? (
                <option value={edit.animateModel}>{edit.animateModel} (saved choice)</option>
              ) : null}
              {offered.map((one) => (
                <option key={one.id} value={one.id}>
                  {videoBadge(one.name, models.data?.standings?.[one.id])}
                </option>
              ))}
            </Picker>
          )}
        </Row>
        {problems.length > 0 ? (
          <p className="col-span-full text-small text-danger">{problems[0]}</p>
        ) : edit.animate !== "off" && models.isSuccess && offered.length === 0 ? (
          <p className="col-span-full text-label text-ink-3">
            This image service has no image-to-video models. Pick fal.ai or Replicate under Images
            to animate them.
          </p>
        ) : null}
      </div>
    </Fold>
  );
  return { cuts, look };
}

function Row({
  id,
  label,
  tip,
  help,
  wide = false,
  children,
}: {
  readonly id: string;
  readonly label: string;
  // Only for a setting whose consequence needs a paragraph; the rest are explained by the
  // line their group opens with, or by their own `help` line.
  readonly tip?: HelpId;
  // One visible sentence under the control, in place of an info button.
  readonly help?: string | undefined;
  readonly wide?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  // Label above, as every field (`.sl-fields`); the control fills its column.
  return (
    <div
      className={cn("sl-field", wide && "sl-fields__wide")}
      {...(tip === undefined && help === undefined ? {} : helpScope)}
    >
      <span className="flex min-w-0 items-center gap-1">
        <label htmlFor={id} className="sl-field__label">
          {label}
        </label>
        {tip === undefined ? null : (
          <InfoTip id={tip} label={label.toLowerCase()} className="-my-1" />
        )}
      </span>
      {/* The main choice takes the room; a short one beside it (a length, a count) keeps its own. */}
      <div className="flex min-w-0 flex-wrap items-start gap-2 [&>select]:min-w-0 [&>select]:flex-1">
        {children}
      </div>
      {help === undefined ? null : <HelpLine>{help}</HelpLine>}
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
      className="min-w-0"
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

// Image-to-video models are listed, never checked, so every one stays offered; the badge says
// only what is known (listed for the key, not on the plan, retiring).
export function videoBadge(name: string, view: ModelStandingView | undefined): string {
  return view === undefined ? name : `${name} · ${badgeOf(view, new Date())}`;
}
