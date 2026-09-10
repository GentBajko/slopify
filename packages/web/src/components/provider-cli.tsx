import type { ProviderStatus } from "@app/slices/settings/model.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useId, useState } from "react";
import { type ProviderListBody, saveProviderPath } from "@/api";
import { useApp } from "@/app-context";
import { Lamp } from "@/components/lamp";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { keys } from "@/queries";

export function CliProviderRow({
  provider,
  readiness,
}: {
  readonly provider: ProviderStatus;
  readonly readiness: Extract<ProviderStatus["readiness"], { readonly kind: "cli" }>;
}): ReactElement {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const nameId = useId();
  const fieldId = useId();
  const labelId = useId();
  const helpId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const configured = provider.cliPath?.configured ?? null;
  const defaultCommand = provider.id === "claude-code" ? "claude" : provider.id;
  const command = provider.cliPath?.command ?? defaultCommand;
  const value = draft ?? configured ?? "";
  const save = useMutation({
    mutationFn: (path: string) => saveProviderPath(api, provider.id, path),
    onMutate: () => setSaved(false),
    onSuccess: async (updated) => {
      queryClient.setQueryData<ProviderListBody>(keys.providers, (previous) =>
        previous
          ? {
              ...previous,
              providers: previous.providers.map((entry) =>
                entry.id === updated.id ? updated : entry,
              ),
            }
          : undefined,
      );
      setDraft(undefined);
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: keys.providers });
    },
  });

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), savedTickMs);
    return () => clearTimeout(timer);
  }, [saved]);

  return (
    <div
      data-ready={readiness.installed}
      className="grid gap-[14px] border-t border-line px-4 py-[14px] first:border-t-0 sm:grid-cols-[140px_1fr]"
    >
      <span
        id={nameId}
        className={cn("font-semibold", readiness.installed ? "text-ink" : "text-ink3")}
      >
        {provider.displayName}
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-small text-ink2" aria-live="polite">
          <Lamp state={readiness.installed ? "done" : "pending"} />
          <span>{statusOf(readiness, configured)}</span>
        </p>
        <p className="mt-1 break-all text-label text-ink3">
          Command: <code>{command}</code>
        </p>
        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!save.isPending) save.mutate(value);
          }}
        >
          <Label htmlFor={fieldId} id={labelId} className="mb-[5px]">
            Executable path
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id={fieldId}
              autoComplete="off"
              spellCheck={false}
              maxLength={4096}
              aria-labelledby={`${nameId} ${labelId}`}
              aria-invalid={save.error !== null}
              aria-describedby={`${helpId}${save.error ? ` ${errorId}` : ""}`}
              placeholder={defaultCommand}
              value={value}
              disabled={save.isPending}
              onChange={(event) => {
                setDraft(event.target.value);
                setSaved(false);
                save.reset();
              }}
            />
            <Button
              type="submit"
              aria-label={`Save ${provider.displayName} path`}
              disabled={save.isPending}
            >
              {save.isPending ? "Checking…" : "Save path"}
            </Button>
            {saved ? <SavedTick /> : null}
          </div>
          <p id={helpId} className="mt-1 text-label text-ink3">
            Leave blank to find <code>{defaultCommand}</code> on PATH. Use an absolute path without
            quotes or arguments.
          </p>
          {save.error ? (
            <p id={errorId} role="alert" className="mt-1 text-label text-red">
              {save.error.message}
            </p>
          ) : null}
        </form>
        <p className="mt-2 text-label text-ink3">
          Sign in through {provider.displayName} itself before generating; Slopify uses that login.
        </p>
      </div>
    </div>
  );
}

function statusOf(
  readiness: { readonly installed: boolean; readonly version?: string },
  configured: string | null,
): string {
  if (!readiness.installed) {
    return configured === null ? "Not found on PATH" : "Not found at saved path";
  }
  return readiness.version === undefined ? "Installed" : `Installed, version ${readiness.version}`;
}
