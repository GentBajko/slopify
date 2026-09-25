import { readinessIsUsable } from "@app/kernel/ports/model.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useId, useState } from "react";
import { type ProviderListBody, saveProviderPath } from "@/api";
import { useApp } from "@/app-context";
import { InfoTip } from "@/components/kit/info-tip";
import { Lamp } from "@/components/lamp";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { keys } from "@/queries";

// One line per provider: name, lamp and state word, the key field, then the actions. The columns
// line up across every family, so the eye runs down a single list.
export const providerRow =
  "grid grid-cols-1 items-center gap-x-4 gap-y-2 border-t border-line px-4 py-[10px] first:border-t-0 md:grid-cols-[170px_150px_minmax(0,1fr)_auto]";

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
  const onHost = provider.cliPath?.managedOnHost === true;
  const defaultCommand =
    provider.id === "claude-code"
      ? "claude"
      : provider.id === "codex-image"
        ? "codex"
        : provider.id;
  const command = provider.cliPath?.command ?? defaultCommand;
  const value = draft ?? configured ?? "";
  const usable = readinessIsUsable(readiness);
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

  const [editing, setEditing] = useState(false);
  const formId = useId();

  return (
    <div data-ready={usable} className="border-t border-line first:border-t-0">
      <div className={cn(providerRow, "border-t-0")}>
        <span className="flex min-w-0 items-center gap-1">
          <span id={nameId} className={cn("font-semibold", usable ? "text-ink" : "text-ink3")}>
            {provider.displayName}
          </span>
          <InfoTip label={`${provider.displayName} sign-in`}>
            {onHost ? (
              <p>
                Runs on your host using its existing CLI login. Rerun the Docker launcher after
                changing CLI installations.
              </p>
            ) : null}
            <p>
              Sign in through {provider.displayName} itself before generating; Slopify uses that
              login.
              {provider.id === "codex-image"
                ? " Executable path and login are shared with Codex text generation."
                : null}
            </p>
          </InfoTip>
        </span>
        <p className="flex min-w-0 items-center gap-2 text-small text-ink2" aria-live="polite">
          <Lamp state={usable ? "done" : "pending"} />
          <span className="min-w-0 break-words">{statusOf(readiness, configured)}</span>
        </p>
        <p className="min-w-0 truncate text-label text-ink3" title={command}>
          <span className="sr-only">Command: </span>
          <code>{command}</code>
        </p>
        <div className="flex min-h-8 items-center gap-2">
          {onHost ? (
            <span className="engraved text-ink3">Managed on host</span>
          ) : (
            <Button
              variant="ghost"
              aria-expanded={editing}
              aria-controls={formId}
              onClick={() => setEditing((open) => !open)}
            >
              {editing ? "Close path" : "Change path"}
            </Button>
          )}
          <span className="inline-flex w-[52px]">{saved ? <SavedTick /> : null}</span>
        </div>
      </div>
      {onHost || !editing ? null : (
        <form
          id={formId}
          className="border-t border-line bg-bg/40 px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!save.isPending) save.mutate(value);
          }}
        >
          <Label htmlFor={fieldId} id={labelId} className="mb-[5px]">
            Executable path
          </Label>
          <div className="flex max-w-[640px] items-center gap-2">
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
      )}
    </div>
  );
}

function statusOf(
  readiness: { readonly installed: boolean; readonly version?: string; readonly issue?: string },
  configured: string | null,
): string {
  if (readiness.issue !== undefined) return readiness.issue;
  if (!readiness.installed) {
    return configured === null ? "Not found on PATH" : "Not found at saved path";
  }
  return readiness.version === undefined ? "Installed" : `Installed, version ${readiness.version}`;
}
