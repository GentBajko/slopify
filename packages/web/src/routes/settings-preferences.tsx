import { defaultLoudness } from "@app/slices/loudness/model.js";
import type { Appearance, AppSettings } from "@app/slices/settings/model.js";
import type { ClipEncodeSpeed, RenderPriority, VideoEncoder } from "@app/slices/video/encoding.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useState } from "react";
import { saveAppSettings } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Field, Input, Select } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
import { helpScope } from "@/components/kit/info-tip";
import { SectionHead } from "@/components/kit/section-head";
import { Segmented } from "@/components/kit/switch";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import { keys, settingsQuery, videoEncodersQuery } from "@/queries";
import { englishModelChoices } from "@/subtitles/model-facts";
import { LoudnessControls } from "@/video/loudness-controls";

// The bound slices/admission/rules.ts validates a run's gap against, so the field refuses
// what a run would refuse rather than letting the server say it first.
const silenceGapSecondsMax = 30;

const appearances: readonly { readonly value: Appearance; readonly label: string }[] = [
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

const videoEncoderChoices: readonly { readonly value: VideoEncoder; readonly label: string }[] = [
  { value: "cpu", label: "Processor (x264)" },
  { value: "nvidia", label: "NVIDIA graphics card (NVENC)" },
];
const clipEncodeChoices: readonly { readonly value: ClipEncodeSpeed; readonly label: string }[] = [
  { value: "thorough", label: "Thorough" },
  { value: "fast", label: "Fast" },
];
const priorityChoices: readonly { readonly value: RenderPriority; readonly label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "background", label: "Background (your other programs come first)" },
];

// Empty, negative, fractional or past the bound: one sentence, the server's own
// (slices/settings/playback.ts).
export function gapProblem(value: string): string | undefined {
  const trimmed = value.trim();
  const bounded =
    /^\d+$/.test(trimmed) && Number(trimmed) >= 0 && Number(trimmed) <= silenceGapSecondsMax;
  return bounded
    ? undefined
    : `The silence gap is a whole number of seconds between 0 and ${String(silenceGapSecondsMax)}.`;
}

// One save of the app settings. Switching theme is immediate, and the cache is what
// components/theme.tsx paints from, so the write happens before the request and is rolled back
// if the request refuses it.
function useSaveSettings() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (next: AppSettings) => saveAppSettings(api, next),
    onMutate: (next: AppSettings) => {
      const previous = queryClient.getQueryData<AppSettings>(keys.settings);
      queryClient.setQueryData(keys.settings, next);
      return { previous };
    },
    onError: (_error: Error, _next: AppSettings, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(keys.settings, context.previous);
      }
    },
    onSuccess: (body) => {
      queryClient.setQueryData(keys.settings, body);
    },
  });
}

function useSettingsData(): { readonly data?: AppSettings; readonly view?: ReactElement } {
  const { api } = useApp();
  const settings = useQuery(settingsQuery(api));
  if (settings.error !== null)
    return {
      view: (
        <p role="alert" className="m-0 text-body text-danger">
          {settings.error.message}
        </p>
      ),
    };
  if (settings.data === undefined)
    return {
      view: (
        <div className="grid gap-6 md:grid-cols-2" role="status" aria-label="Loading settings">
          <span className="h-16 rounded-control bg-raised" />
          <span className="h-16 rounded-control bg-raised" />
        </div>
      ),
    };
  return { data: settings.data };
}

// Settings → Production defaults: how new runs are paced and levelled.
export function ProductionDefaults(): ReactElement {
  const { data, view } = useSettingsData();
  const save = useSaveSettings();
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), savedTickMs);
    return () => clearTimeout(timer);
  }, [saved]);

  if (data === undefined) return view ?? <span />;
  const current = data;
  const gap = typed ?? String(current.silenceGapSeconds);
  const problem = gapProblem(gap);

  return (
    <div className="grid items-start gap-6 md:grid-cols-2">
      <Field
        label="Silence between segments"
        tip="settings.playback.silence-gap"
        help="Seconds of quiet between narrated segments."
        error={problem ?? save.error?.message}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={silenceGapSecondsMax}
            step={1}
            className="w-[88px] tabular-nums"
            value={gap}
            aria-invalid={problem !== undefined}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
          />
          <span className="text-small text-ink-2">seconds</span>
          <Button
            variant="primary"
            disabled={problem !== undefined || save.isPending}
            onClick={() => {
              setSaved(false);
              save.mutate(
                { ...current, silenceGapSeconds: Number(gap.trim()) },
                {
                  onSuccess: () => {
                    setTyped(undefined);
                    setSaved(true);
                  },
                },
              );
            }}
          >
            Save
          </Button>
          <span className="inline-flex w-[52px]">{saved ? <SavedTick /> : null}</span>
        </div>
      </Field>

      <Field
        label="Subtitle timing model"
        tip="settings.subtitle-model"
        help="Bigger hears the narration more accurately and, on most computers, is also faster. It downloads once, the first time captions are timed."
        error={
          save.error && save.variables?.subtitleModel !== current.subtitleModel
            ? `The subtitle timing model wasn't saved. ${save.error.message}`
            : undefined
        }
      >
        <Select
          className="self-start"
          // A settings answer from before the setting reads as its default.
          value={current.subtitleModel ?? "fp32"}
          options={englishModelChoices}
          onChange={(event) => {
            const picked = englishModelChoices.find(
              (choice) => choice.value === event.target.value,
            );
            if (picked !== undefined) save.mutate({ ...current, subtitleModel: picked.value });
          }}
        />
      </Field>

      <div className="md:col-span-2">
        <LoudnessControls
          // A settings answer from before the setting reads as its default.
          value={current.loudness ?? defaultLoudness}
          switchLabel="Level the volume for new runs"
          switchTip="settings.loudness"
          onChange={(loudness) => {
            save.mutate({ ...current, loudness });
          }}
        />
      </div>

      <RenderSettings current={current} save={save} />
    </div>
  );
}

// Settings → Production defaults → Rendering: how this computer encodes videos. Machine-wide,
// never copied into a project, and changing them never marks anything outdated.
function RenderSettings({
  current,
  save,
}: {
  readonly current: AppSettings;
  readonly save: ReturnType<typeof useSaveSettings>;
}): ReactElement {
  const { api } = useApp();
  const encoders = useQuery(videoEncodersQuery(api));
  // A settings answer from before the settings reads as their defaults.
  const encoder = current.videoEncoder ?? "cpu";
  const nvidia = encoders.data?.nvidia;
  // The card is offered where its encoder works, and kept in the list while it is the saved
  // choice so the control never shows what is not saved.
  const offered = videoEncoderChoices.filter(
    (choice) => choice.value === "cpu" || nvidia?.available === true || encoder === "nvidia",
  );
  const encoderHelp =
    nvidia === undefined
      ? "Checking for an NVIDIA graphics card…"
      : nvidia.available
        ? "The graphics card takes most of the work off the processor, for a slightly softer picture than x264."
        : encoder === "nvidia"
          ? `Videos are encoded on the processor until this is fixed. ${nvidia.reason}`
          : `${nvidia.reason} Videos are encoded on the processor.`;
  // What the card's test printed, folded under the field: for a bug report, not for reading.
  const encoderDetail = nvidia?.available === false ? nvidia.detail : undefined;
  const failed = (field: keyof AppSettings, label: string): string | undefined =>
    save.error && save.variables?.[field] !== current[field]
      ? `The ${label} wasn't saved. ${save.error.message}`
      : undefined;
  return (
    <div className="grid gap-4 md:col-span-2" {...helpScope}>
      <SectionHead
        as="h3"
        title="Rendering"
        meta="How this computer encodes videos and shorts. Changing these never marks anything outdated."
      />
      <div className="grid items-start gap-6 md:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Field
            label="Video encoder"
            tip="settings.video-encoder"
            help={encoderHelp}
            error={failed("videoEncoder", "video encoder")}
          >
            <Select
              className="self-start"
              value={encoder}
              options={offered}
              onChange={(event) => {
                const picked = videoEncoderChoices.find((one) => one.value === event.target.value);
                if (picked !== undefined) save.mutate({ ...current, videoEncoder: picked.value });
              }}
            />
          </Field>
          {encoderDetail === undefined ? null : (
            <Fold summary="Details">
              <p className="m-0 pt-1 font-mono text-small break-words text-ink-2">
                {encoderDetail}
              </p>
            </Fold>
          )}
        </div>
        <Field
          label="Clip encoding"
          tip="settings.clip-encoding"
          help={clipEncodingHelp}
          error={failed("clipEncodeSpeed", "clip encoding")}
        >
          <Select
            className="self-start"
            value={current.clipEncodeSpeed ?? "thorough"}
            options={clipEncodeChoices}
            onChange={(event) => {
              const picked = clipEncodeChoices.find((one) => one.value === event.target.value);
              if (picked !== undefined) save.mutate({ ...current, clipEncodeSpeed: picked.value });
            }}
          />
        </Field>
        <Field
          label="Render priority"
          tip="settings.render-priority"
          help="Background lets your other programs run first; a render takes longer while they are busy."
          error={failed("renderPriority", "render priority")}
        >
          <Select
            className="self-start"
            value={current.renderPriority ?? "background"}
            options={priorityChoices}
            onChange={(event) => {
              const picked = priorityChoices.find((one) => one.value === event.target.value);
              if (picked !== undefined) save.mutate({ ...current, renderPriority: picked.value });
            }}
          />
        </Field>
      </div>
    </div>
  );
}

// measured on a real project (docs/capstone/changelog.d/2026-10-13-render-settings.md).
const clipEncodingHelp =
  "Fast uses about half the processor time for the clips under burned-in captions, for a slightly softer picture.";

// Settings → General: how Slopify looks, beside how it starts.
export function AppearanceSetting(): ReactElement {
  const { data, view } = useSettingsData();
  const save = useSaveSettings();
  if (data === undefined) return view ?? <span />;
  const current = data;
  return (
    <div className="sl-field">
      <span className="sl-field__label">Appearance</span>
      <Segmented
        label="Appearance"
        help="System follows your computer's light or dark setting. Your videos are not affected."
        value={current.appearance}
        options={appearances}
        className="self-start"
        onChange={(next) => {
          save.mutate({ ...current, appearance: next });
        }}
      />
      {save.error ? (
        <p role="alert" className="m-0 text-small text-danger">
          The appearance wasn't saved. {save.error.message}
        </p>
      ) : null}
    </div>
  );
}
