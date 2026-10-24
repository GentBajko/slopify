import { readinessIsUsable } from "@app/kernel/ports/model.js";
import type { ProviderId, ProviderStatus } from "@app/slices/settings/model.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useId, useState } from "react";
import { type ProviderListBody, saveProviderPath } from "@/api";
import { useApp } from "@/app-context";
import { Button, ButtonRow } from "@/components/kit/button";
import { Code, Field, Input } from "@/components/kit/field";
import { Status } from "@/components/kit/status";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import { type HelpId, helpEntry } from "@/help/catalog";
import { keys } from "@/queries";

// What each service does and costs, in words under its name in its setup (ServiceAbout).
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

// What the service does and what it costs, from the help catalogue, in words under its name.
export function ServiceAbout({ provider }: { readonly provider: ProviderStatus }): ReactElement {
  return (
    <p className="m-0 max-w-[var(--measure)] text-small text-ink-2">
      {helpEntry(providerTips[provider.id]).body}
    </p>
  );
}

type CliReadiness = Extract<ProviderStatus["readiness"], { readonly kind: "cli" }>;

// The list's word for a command-line tool: ready, found but signed out, found but not usable
// (too old, or its bridge to Docker's host is down), or not found.
export function cliState(readiness: CliReadiness): {
  readonly tone: "done" | "waiting" | "failed" | "off";
  readonly word: string;
} {
  if (readinessIsUsable(readiness)) return { tone: "done", word: "Ready" };
  if (!readiness.installed) return { tone: "off", word: "Not found" };
  if (readiness.issueKind === "login") return { tone: "waiting", word: "Signed out" };
  return { tone: "failed", word: "Needs fixing" };
}

// The setup of a command-line tool: what it does, what was found, the command Slopify runs,
// and the executable path behind Change path.
export function CliProviderDetail({
  provider,
  readiness,
  kind,
}: {
  readonly provider: ProviderStatus;
  readonly readiness: CliReadiness;
  // "Writing service" or "Image service": which list the tool sits in.
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
        : provider.id === "gemini"
          ? "agy"
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
        <h3 id={headingId} className="sl-section-head__title">
          {provider.displayName}
        </h3>
        <p className="sl-section-head__meta">{kind} · runs on this computer with your sign-in</p>
      </div>
      <ServiceAbout provider={provider} />

      <div className="flex flex-col gap-2">
        <p className="m-0 flex min-w-0 flex-wrap items-center gap-x-2" aria-live="polite">
          <Status tone={cliState(readiness).tone}>{cliState(readiness).word}</Status>
          <span className="min-w-0 break-words text-ink-2">{statusOf(readiness, configured)}</span>
        </p>
        <p className="m-0 flex min-w-0 items-center gap-2 text-small text-ink-2">
          <span>Command</span>
          <Code className="min-w-0 truncate" title={command}>
            {command}
          </Code>
        </p>
      </div>

      <ButtonRow>
        {onHost ? (
          <span className="text-small text-ink-2">
            Slopify runs in Docker, so this tool runs on your computer with the sign-in it has
            there. After installing or updating it, run the Docker launcher again.
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
      </ButtonRow>

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
    return configured === null
      ? "Not found in the folders your terminal searches (PATH)"
      : "Not found at the saved path";
  }
  return readiness.version === undefined ? "Installed" : `Installed, version ${readiness.version}`;
}
