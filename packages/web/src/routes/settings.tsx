import type { Appearance, AppSettings } from "@app/slices/settings/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { saveAppSettings } from "@/api";
import { useApp } from "@/app-context";
import { ProviderKeys } from "@/components/provider-keys";
import { Rail, RailGroup } from "@/components/rail";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Voices } from "@/components/voices";
import { keys, settingsQuery } from "@/queries";

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

// Keys, voices, and the two playback values, without ceremony.
export function SettingsRoute() {
  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <h1 className="text-title font-bold tracking-[-0.01em]">Settings</h1>
      <ProviderKeys />
      <Voices />
      <Playback />
    </div>
  );
}

function Playback() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const settings = useQuery(settingsQuery(api));
  const gapId = useId();
  const gapErrorId = useId();
  const appearanceLabelId = useId();

  const [typed, setTyped] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (next: AppSettings) => saveAppSettings(api, next),
    // Switching theme is immediate, and the
    // cache is what components/theme.tsx paints from, so the write happens before the
    // request and is rolled back if the request refuses it.
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

  useEffect(() => {
    if (!saved) {
      return;
    }
    const timer = setTimeout(() => {
      setSaved(false);
    }, savedTickMs);
    return () => {
      clearTimeout(timer);
    };
  }, [saved]);

  if (settings.error !== null) {
    return (
      <RailGroup>
        <Rail>
          <p className="text-body text-red">{settings.error.message}</p>
        </Rail>
      </RailGroup>
    );
  }
  if (settings.data === undefined) {
    return (
      <RailGroup>
        <h2 className="engraved border-b border-line px-4 py-3 text-ink3">Playback</h2>
        <Rail>
          <span className="h-4 w-48 rounded-control bg-panel2" />
          <span className="h-8 w-[72px] rounded-control bg-panel2" />
        </Rail>
      </RailGroup>
    );
  }

  const current = settings.data;
  const gap = typed ?? String(current.silenceGapSeconds);
  const problem = gapProblem(gap);

  return (
    <RailGroup>
      <h2 className="engraved border-b border-line px-4 py-3 text-ink3">Playback</h2>

      <div className="grid grid-cols-[240px_1fr] items-center gap-[14px] border-b border-line px-4 py-[14px]">
        <label htmlFor={gapId} className="font-semibold">
          Silence between segments
        </label>
        <div className="flex flex-wrap items-center gap-[10px]">
          <Input
            id={gapId}
            type="number"
            inputMode="numeric"
            min={0}
            max={silenceGapSecondsMax}
            step={1}
            className="w-[72px] tabular-nums"
            value={gap}
            aria-invalid={problem !== undefined}
            aria-describedby={problem === undefined ? undefined : gapErrorId}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
          />
          <span className="text-small text-ink2">seconds</span>
          <Button
            className="ml-[6px]"
            disabled={problem !== undefined || save.isPending}
            onClick={() => {
              setSaved(false);
              save.mutate(
                { silenceGapSeconds: Number(gap.trim()), appearance: current.appearance },
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
          {saved ? <SavedTick /> : null}
          {problem === undefined ? null : (
            <p id={gapErrorId} className="basis-full text-label text-red">
              {problem}
            </p>
          )}
          {save.error === null ? null : (
            <p className="basis-full text-label text-red">{save.error.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[240px_1fr] items-center gap-[14px] px-4 py-[14px]">
        <span id={appearanceLabelId} className="font-semibold">
          Appearance
        </span>
        <ToggleGroup
          type="single"
          value={current.appearance}
          aria-labelledby={appearanceLabelId}
          className="justify-self-start"
          onValueChange={(next) => {
            const picked = appearances.find((option) => option.value === next);
            if (picked !== undefined) {
              save.mutate({
                silenceGapSeconds: current.silenceGapSeconds,
                appearance: picked.value,
              });
            }
          }}
        >
          {appearances.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </RailGroup>
  );
}
