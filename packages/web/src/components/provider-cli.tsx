import { readinessIsUsable } from "@app/kernel/ports/model.js";
import type { ProviderId, ProviderStatus } from "@app/slices/settings/model.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useId, useState } from "react";
import { type ProviderListBody, saveProviderPath } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Code, Field, Input } from "@/components/kit/field";
import { InfoTip } from "@/components/kit/info-tip";
import { Lamp } from "@/components/kit/status";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import type { HelpId } from "@/help/catalog";
import { keys } from "@/queries";

// What each provider does and costs, behind the info button beside its name.
export const providerTips = {
  openrouter: "settings.provider.openrouter",
  "claude-code": "settings.provider.claude-code",
  codex: "settings.provider.codex",
  gemini: "settings.provider.gemini",
  elevenlabs: "settings.provider.elevenlabs",
  "openai-tts": "settings.provider.openai-tts",
  cartesia: "settings.provider.cartesia",
  inworld: "settings.provider.inworld",
  "system-voice": "settings.provider.system-voice",
  "google-tts": "settings.provider.google-tts",
  fal: "settings.provider.fal",
  replicate: "settings.provider.replicate",
  "openai-image": "settings.provider.openai-image",
  "google-image": "settings.provider.google-image",
  "codex-image": "settings.provider.codex-image",
} as const satisfies Readonly<Record<ProviderId, HelpId>>;

type CliReadiness = Extract<ProviderStatus["readiness"], { readonly kind: "cli" }>;

// The list's word for a command-line provider: ready, found but not usable, or not found.
export function cliState(readiness: CliReadiness): {
  readonly tone: "done" | "waiting" | "off";
  readonly word: string;
} {
  if (readinessIsUsable(readiness)) return { tone: "done", word: "Ready" };
  if (readiness.installed) return { tone: "waiting", word: "Needs attention" };
  return { tone: "off", word: "Not found" };
}

// The detail column for a command-line provider: what was found, the command Slopify runs,
// and the executable path behind Change path.
export function CliProviderDetail({
  provider,
  readiness,
  kind,
}: {
  readonly provider: ProviderStatus;
  readonly readiness: CliReadiness;
  // "Text" or "Images": which list the provider sits in.
  readonly kind: string;
}): ReactElement {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const headingId = useId();
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
    <section
      aria-labelledby={headingId}
      data-ready={usable}
      className="flex min-w-0 flex-col gap-5"
    >
      <div>
        <div className="flex items-center gap-2">
          <h3 id={headingId} className="sl-section-head__title">
            {provider.displayName}
          </h3>
          <InfoTip id={providerTips[provider.id]} label={provider.displayName} />
        </div>
        <p className="sl-section-head__meta">{kind} · command line, no key needed</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="m-0 flex min-w-0 items-center gap-2" aria-live="polite">
          <Lamp tone={cliState(readiness).tone} />
          <span className="min-w-0 break-words">{statusOf(readiness, configured)}</span>
        </p>
        <p className="m-0 flex min-w-0 items-center gap-2 text-small text-ink-2">
          <span>Command</span>
          <Code className="min-w-0 truncate" title={command}>
            {command}
          </Code>
        </p>
      </div>

      <div className="sl-btn-row">
        {onHost ? (
          <span className="inline-flex items-center gap-1 text-small text-ink-2">
            Managed on host
            <InfoTip id="settings.cli.managed-on-host" />
          </span>
        ) : (
          <Button
            aria-expanded={editing}
            aria-controls={formId}
            onClick={() => setEditing((open) => !open)}
          >
            {editing ? "Close path" : "Change path"}
          </Button>
        )}
        <span className="inline-flex w-[52px]">{saved ? <SavedTick /> : null}</span>
      </div>

      {onHost || !editing ? null : (
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            if (!save.isPending) save.mutate(value);
          }}
        >
          <Field
            label="Executable path"
            tip="settings.cli.path"
            help={
              <>
                Leave blank to find <Code>{defaultCommand}</Code> on PATH. Use an absolute path
                without quotes or arguments.
              </>
            }
            error={save.error?.message}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input
                autoComplete="off"
                spellCheck={false}
                maxLength={4096}
                aria-label={`${provider.displayName} Executable path`}
                className="min-w-0 flex-1 basis-[220px]"
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
                variant="primary"
                aria-label={`Save ${provider.displayName} path`}
                disabled={save.isPending}
              >
                {save.isPending ? "Checking…" : "Save path"}
              </Button>
            </div>
          </Field>
        </form>
      )}
    </section>
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
