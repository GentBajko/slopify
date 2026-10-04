import { defaultLoudness } from "@app/slices/loudness/model.js";
import type { Appearance, AppSettings } from "@app/slices/settings/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useState } from "react";
import { saveAppSettings } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Field, Input } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Segmented } from "@/components/kit/switch";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import { keys, settingsQuery } from "@/queries";
import { LoudnessControls } from "@/video/loudness-controls";

// The bound slices/admission/rules.ts validates a run's gap against, so the field refuses
// what a run would refuse rather than letting the server say it first.
const silenceGapSecondsMax = 30;

const appearances: readonly { readonly value: Appearance; readonly label: string }[] = [
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
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
    </div>
  );
}

// Settings → General: how Slopify looks, beside how it starts.
export function AppearanceSetting(): ReactElement {
  const { data, view } = useSettingsData();
  const save = useSaveSettings();
  if (data === undefined) return view ?? <span />;
  const current = data;
  return (
    <div className="sl-field" {...helpScope}>
      <div className="flex min-w-0 items-center gap-1">
        <span className="sl-field__label">Appearance</span>
        <InfoTip id="settings.appearance" className="-my-1" />
      </div>
      <Segmented
        label="Appearance"
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
