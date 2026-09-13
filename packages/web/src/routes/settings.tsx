import type { Appearance, AppSettings } from "@app/slices/settings/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { readStorageUsage, saveAppSettings } from "@/api";
import { useApp } from "@/app-context";
import { CatalogueSettings } from "@/components/catalogue";
import { ProviderKeys } from "@/components/provider-keys";
import { Rail, RailGroup } from "@/components/rail";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Voices } from "@/components/voices";
import { keys, settingsQuery } from "@/queries";

const storageQueryKey = ["storage-usage"] as const;

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
  const { api } = useApp();
  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-title font-bold tracking-[-0.01em]">Settings</h1>
          <p className="mt-1 text-small text-ink2">
            Provider readiness is checked again before each run.
          </p>
        </div>
        <Button asChild variant="ghost">
          <a href={`${api.origin}/api/diagnostics`} download="slopify-diagnostics.json">
            Download diagnostics
          </a>
        </Button>
      </div>
      <ProviderKeys />
      <Voices />
      <CatalogueSettings />
      <Playback />
      <StorageTools />
    </div>
  );
}

function StorageTools() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const usage = useQuery({
    queryKey: storageQueryKey,
    queryFn: () => readStorageUsage(api),
    staleTime: 30_000,
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function importBackup(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.fetch(`${api.origin}/api/storage/import`, {
        method: "PUT",
        headers: { "content-type": "application/zip" },
        body: await file.arrayBuffer(),
      });
      const body = (await response.json()) as {
        detail?: string;
        templates?: number;
        stagedFiles?: number;
      };
      if (!response.ok) throw new Error(body.detail ?? "The backup could not be imported.");
      setNotice(
        `Imported ${body.templates ?? 0} template(s) and ${body.stagedFiles ?? 0} staged file(s).`,
      );
      await queryClient.invalidateQueries({ queryKey: storageQueryKey });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The backup could not be imported.");
    } finally {
      setBusy(false);
    }
  }

  async function cleanup(): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.fetch(`${api.origin}/api/storage/cleanup`, { method: "POST" });
      const body = (await response.json()) as { orphanFiles?: number; stagedFiles?: number };
      if (!response.ok) throw new Error("Storage cleanup could not finish.");
      setNotice(
        `Removed ${body.orphanFiles ?? 0} orphan project file(s) and ${body.stagedFiles ?? 0} stale staged file(s).`,
      );
      await queryClient.invalidateQueries({ queryKey: storageQueryKey });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Storage cleanup could not finish.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="storage-tools-heading"
      className="rounded-panel border border-line bg-panel p-4"
    >
      <h2 id="storage-tools-heading" className="font-semibold">
        Backup and storage
      </h2>
      <p className="mt-1 max-w-[70ch] text-small text-ink2">
        Backups include templates, prompts, voices, settings and staged assets. Provider keys and
        telemetry are never included. Existing projects and their retained revisions stay untouched
        when a backup is imported.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild disabled={busy}>
          <a href={`${api.origin}/api/storage/export`} download="slopify-backup.zip">
            Export backup
          </a>
        </Button>
        <label className="inline-flex h-8 cursor-pointer items-center rounded-control border border-line2 bg-panel2 px-3 text-body hover:border-ink3">
          Import backup
          <input
            className="sr-only"
            type="file"
            accept="application/zip,.zip"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBackup(file);
              event.target.value = "";
            }}
          />
        </label>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void cleanup()}>
          Clean orphan files
        </Button>
      </div>
      {usage.data ? (
        <div className="mt-4 border-t border-line pt-3 text-small text-ink2">
          <p>
            {formatBytes(usage.data.data)} stored · {formatBytes(usage.data.projects)} project files
            · {formatBytes(usage.data.staging)} staged files
          </p>
          {usage.data.byProject.length > 0 ? (
            <ul className="mt-2 space-y-1" aria-label="Storage by project">
              {usage.data.byProject.slice(0, 5).map((project) => (
                <li key={project.id} className="flex justify-between gap-4">
                  <span className="truncate">{project.title}</span>
                  <span className="shrink-0 tabular-nums">{formatBytes(project.bytes)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : usage.error ? (
        <p className="mt-3 text-small text-ink2">Storage usage is unavailable.</p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-2 text-small text-lamp-run">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-small text-red">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = units[0] ?? "KB";
  for (const candidate of units) {
    value /= 1024;
    unit = candidate;
    if (value < 1024 || candidate === units.at(-1)) break;
  }
  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "");
  return `${rounded} ${unit}`;
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
