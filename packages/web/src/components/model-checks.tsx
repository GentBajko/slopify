import type { AutoMode, ModelKey } from "@app/slices/model-checks/model.js";
import { ago } from "@app/slices/model-checks/rules.js";
import type { ProviderCheckState } from "@app/slices/model-checks/service.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button, ButtonRow } from "@/components/kit/button";
import { Field, Select } from "@/components/kit/field";
import { TextLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { LinkedText } from "@/components/linked-text";
import {
  dismissNotices,
  modelChecksKey,
  modelChecksQuery,
  setAutoChecks,
} from "@/lib/model-checks";
import { useCheckModels } from "@/lib/use-check-models";
import { providersQuery } from "@/queries";
import { CompareOnSample } from "@/template-studio/compare-on-sample";

const autoOptions: readonly { readonly value: AutoMode; readonly label: string }[] = [
  { value: "free", label: "Free and near-free checks only" },
  { value: "off", label: "Off: only when I choose Check models" },
];

const familyWords = { llm: "text", tts: "voice", image: "images" } as const;

const spentText = (dollars: number): string =>
  dollars <= 0
    ? "Checks cost nothing so far"
    : `Checks cost $${dollars.toFixed(dollars < 0.01 ? 4 : 2)} so far`;

function summaryOf(state: ProviderCheckState, now: Date): string {
  const parts = [
    `${String(state.works)} working`,
    state.noAccess > 0 ? `${String(state.noAccess)} not on your plan` : null,
    state.listed > 0 ? `${String(state.listed)} listed for you` : null,
  ].filter((part) => part !== null);
  const checked =
    state.lastCheckedAt === null
      ? "not checked yet"
      : `last checked ${ago(state.lastCheckedAt, now)}`;
  return `${parts.join(" · ")} · ${checked}`;
}

function ProviderChecks({
  state,
  name,
}: {
  readonly state: ProviderCheckState;
  readonly name: string;
}): ReactElement {
  const checks = useCheckModels(state.provider, name);
  const now = new Date();
  return (
    <li className="sl-row max-sm:grid-cols-1">
      <div className="min-w-0">
        <p className="m-0 font-semibold">{name}</p>
        <p className="m-0 text-small text-ink-2">{summaryOf(state, now)}</p>
        <p className="m-0 text-label text-ink-3">{spentText(state.spent)}</p>
        <StatusSlot tone="info">
          {state.running ? "Checking in the background…" : (checks.message ?? null)}
        </StatusSlot>
      </div>
      <ButtonRow>
        <Button
          size="small"
          disabled={checks.pending || state.running}
          aria-label={`Check ${name} models`}
          onClick={() => checks.check()}
        >
          {state.running ? "Checking…" : "Check models"}
        </Button>
      </ButtonRow>
      {checks.dialog}
    </li>
  );
}

// Settings → Models, below the catalogue: which models work for each saved key or CLI, the
// ones that started working since last time, and whether checks run by themselves.
export function ModelChecksSettings(): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const overview = useQuery(modelChecksQuery(api));
  const providers = useQuery(providersQuery(api));
  const auto = useMutation({
    mutationFn: (mode: AutoMode) => setAutoChecks(api, mode),
    onSuccess: () => client.invalidateQueries({ queryKey: modelChecksKey }),
  });
  const dismiss = useMutation({
    // Only the model's key: the route takes nothing else.
    mutationFn: (keys: readonly ModelKey[]) =>
      dismissNotices(
        api,
        keys.map(({ provider, family, model }) => ({ provider, family, model })),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: modelChecksKey }),
  });
  const statuses = providers.data?.providers ?? [];
  // Two providers can share a name (Codex CLI writes and draws), so a shared one says which.
  const nameOf = (id: string): string => {
    const found = statuses.find((status) => status.id === id);
    if (found === undefined) return id;
    const shared = statuses.some(
      (status) => status.id !== id && status.displayName === found.displayName,
    );
    return shared ? `${found.displayName} (${familyWords[found.family]})` : found.displayName;
  };
  const setUp = new Set(
    statuses
      .filter((status) =>
        status.readiness.kind === "keyed"
          ? status.readiness.hasKey
          : status.readiness.kind === "cli"
            ? status.readiness.installed
            : status.readiness.available,
      )
      .map((status) => status.id),
  );
  const rows = (overview.data?.providers ?? []).filter((state) => setUp.has(state.provider));
  const fresh = overview.data?.newForYou ?? [];
  const problem = overview.error?.message ?? auto.error?.message ?? dismiss.error?.message ?? null;
  return (
    <>
      <section aria-label="Models that work for you" className="flex flex-col gap-4">
        <div>
          <SectionHead
            title="Models that work for you"
            meta="Checked with each saved key and sign-in. Pickers show working models first."
          />
          {problem === null ? null : (
            <p role="alert" className="m-0 mb-2 text-body text-danger">
              {problem}
            </p>
          )}
          {rows.length === 0 ? (
            <p className="m-0 text-small text-ink-2">
              {overview.isPending || providers.isPending ? (
                "Looking…"
              ) : (
                <LinkedText text="No service is set up yet. Add a key or sign in on Settings → Keys & services." />
              )}
            </p>
          ) : (
            <ul aria-label="Model checks by service" className="sl-list m-0 list-none p-0">
              {rows.map((state) => (
                <ProviderChecks key={state.provider} state={state} name={nameOf(state.provider)} />
              ))}
            </ul>
          )}
        </div>
        <Field
          label="Automatic checks"
          help="Checks that cost nothing or well under a tenth of a cent run when a key is added and once a week. Images are never checked by themselves."
        >
          <Select
            className="max-w-[420px] self-start"
            value={overview.data?.auto ?? "free"}
            disabled={overview.data === undefined || auto.isPending}
            options={autoOptions}
            onChange={(event) => auto.mutate(event.target.value === "off" ? "off" : "free")}
          />
        </Field>
      </section>
      {fresh.length === 0 ? null : (
        <section aria-label="New for you">
          <SectionHead
            title="New for you"
            meta="Models that started working for your keys since you last looked."
          >
            <Button
              variant="quiet"
              disabled={dismiss.isPending}
              onClick={() => dismiss.mutate(fresh)}
            >
              Dismiss all
            </Button>
          </SectionHead>
          <ul aria-label="New models that work for you" className="sl-list m-0 list-none p-0">
            {fresh.map((model) => (
              <li
                key={`${model.family}:${model.provider}:${model.model}`}
                className="sl-row max-sm:grid-cols-1"
              >
                <div className="min-w-0">
                  <p className="m-0 font-semibold">{model.name}</p>
                  <p className="m-0 text-small text-ink-2">
                    {nameOf(model.provider)} · found to work {ago(model.firstWorksAt, new Date())}
                  </p>
                </div>
                <ButtonRow>
                  <CompareOnSample model={model} />
                  <Button
                    size="small"
                    variant="quiet"
                    disabled={dismiss.isPending}
                    aria-label={`Dismiss ${model.name}`}
                    onClick={() => dismiss.mutate([model])}
                  >
                    Dismiss
                  </Button>
                </ButtonRow>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// Home's side column: a reserved line that says when new models started working for you.
export function NewModelsSlot(): ReactElement {
  const { api } = useApp();
  const overview = useQuery(modelChecksQuery(api));
  const count = overview.data?.newForYou.length ?? 0;
  return (
    <StatusSlot tone="info">
      {count === 0 ? null : (
        <TextLink to="/settings" search={{ section: "models" }}>
          {`${String(count)} new AI model${count === 1 ? "" : "s"} work${count === 1 ? "s" : ""} for you`}
        </TextLink>
      )}
    </StatusSlot>
  );
}
