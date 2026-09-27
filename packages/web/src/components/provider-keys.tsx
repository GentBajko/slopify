import { readinessIsUsable } from "@app/kernel/ports/model.js";
import { type KeyGuide, keyGuides } from "@app/slices/settings/key-guides.js";
import type { KeyTestOutcome } from "@app/slices/settings/key-test.js";
import type { ProviderFamily, ProviderId, ProviderStatus } from "@app/slices/settings/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { removeProviderKey, saveProviderKey } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Field, Input } from "@/components/kit/field";
import { InfoTip } from "@/components/kit/info-tip";
import { List, ListRow } from "@/components/kit/list-row";
import { Status } from "@/components/kit/status";
import { CliProviderDetail, cliState, providerTips } from "@/components/provider-cli";
import { testKey } from "@/components/provider-upkeep-api";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import { localState, SystemVoiceDetail } from "@/components/system-voices";
import { cn } from "@/lib/utils";
import { keys, providersQuery } from "@/queries";

// The three families, in the order Settings draws them.
const familyOrder: readonly ProviderFamily[] = ["llm", "tts", "image"];
const familyTitles: Readonly<Record<ProviderFamily, string>> = {
  llm: "Text",
  tts: "Speech",
  image: "Images",
};

// The same constant slices/settings/keys.ts answers a save with: a fixed mask carrying
// no character of the key and not even its length. It is spelled here too because
// `GET /api/providers` reports only whether a key is stored, never the mask.
const keyMask = "••••••••••••";

function ready(provider: ProviderStatus): boolean {
  return readinessIsUsable(provider.readiness);
}

function stateOf(provider: ProviderStatus): {
  readonly tone: "done" | "waiting" | "off";
  readonly word: string;
} {
  if (provider.readiness.kind === "cli") return cliState(provider.readiness);
  if (provider.readiness.kind === "local") return localState(provider.readiness);
  return provider.readiness.hasKey
    ? { tone: "done", word: "Key saved" }
    : { tone: "off", word: "No key" };
}

// Every supported provider, keyed or not, found or not, so the user can see that a
// provider exists and why it is unavailable. The list sits beside the picked provider's
// setup: its steps, its key or its command, and the actions on it.
export function ProviderKeys() {
  const { api } = useApp();
  const providers = useQuery(providersQuery(api));
  const [picked, setPicked] = useState<ProviderId | undefined>(undefined);
  const detail = useRef<HTMLDivElement>(null);
  const scrollToDetail = useRef(false);

  // On one column the setup sits under its family's list, so a picked row brings it into view.
  useEffect(() => {
    if (picked === undefined || !scrollToDetail.current) return;
    scrollToDetail.current = false;
    if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1023px)").matches)
      detail.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [picked]);

  const listed = familyOrder.flatMap((family) =>
    (providers.data?.providers ?? []).filter((provider) => provider.family === family),
  );
  // The first provider still to set up is open when the page arrives, and stays open after
  // it is set up rather than jumping to the next one.
  const opening = listed.find((provider) => !ready(provider)) ?? listed[0];
  if (picked === undefined && opening !== undefined) setPicked(opening.id);

  if (providers.error !== null) {
    return (
      <p role="alert" className="m-0 text-body text-danger">
        {providers.error.message}
      </p>
    );
  }
  if (providers.data === undefined) {
    return <SkeletonKeys />;
  }

  const selected = listed.find((provider) => provider.id === picked) ?? opening;
  // On a fresh install nothing is selectable on Play yet, and the hint
  // above the lists is what says so.
  const fresh = listed.every(
    (provider) => provider.readiness.kind !== "keyed" || !provider.readiness.hasKey,
  );

  const pick = (id: ProviderId): void => {
    scrollToDetail.current = true;
    setPicked(id);
  };

  return (
    <div className="flex min-w-0 flex-col gap-8">
      {fresh ? (
        <p className="m-0 text-small text-ink-2">
          Paste a key to make its provider selectable on Play.
        </p>
      ) : null}
      {familyOrder.map((family) => (
        // The picked provider's setup sits beside its own family's list, inside the same
        // section, so the tutorial's spotlight on a family holds both the list and the setup.
        <section
          key={family}
          data-tour={`keys-${family}`}
          aria-labelledby={`keys-${family}-title`}
          className="grid items-start gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
        >
          <div className="min-w-0">
            <h2 id={`keys-${family}-title`} className="sl-kicker m-0 mb-2">
              {familyTitles[family]}
            </h2>
            <List label={`${familyTitles[family]} providers`}>
              {listed
                .filter((provider) => provider.family === family)
                .map((provider) => {
                  const state = stateOf(provider);
                  return (
                    <ListRow
                      key={provider.id}
                      title={provider.displayName}
                      meta={
                        provider.readiness.kind === "cli"
                          ? "Command line"
                          : provider.readiness.kind === "local"
                            ? "Built in, no key"
                            : "API key"
                      }
                      selected={provider.id === selected?.id}
                      onSelect={() => pick(provider.id)}
                      actions={<Status tone={state.tone}>{state.word}</Status>}
                    />
                  );
                })}
            </List>
          </div>
          {selected === undefined || selected.family !== family ? null : (
            <div ref={detail} className="min-w-0 scroll-mt-4">
              {selected.readiness.kind === "cli" ? (
                <CliProviderDetail
                  key={selected.id}
                  provider={selected}
                  readiness={selected.readiness}
                  kind={familyTitles[selected.family]}
                />
              ) : selected.readiness.kind === "local" ? (
                <SystemVoiceDetail
                  key={selected.id}
                  provider={selected}
                  readiness={selected.readiness}
                />
              ) : (
                <KeyDetail
                  key={selected.id}
                  provider={selected}
                  hasKey={selected.readiness.hasKey}
                />
              )}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function KeyDetail({
  provider,
  hasKey,
}: {
  readonly provider: ProviderStatus;
  readonly hasKey: boolean;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const headingId = useId();
  const storedId = useId();

  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [asking, setAsking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<KeyTestOutcome | undefined>(undefined);
  const testId = useId();
  const guide = keyGuides[provider.id];

  // A key pasted and not saved yet is tried as it stands, so it can be checked before Save; with
  // the field empty the stored key is. Either way the key only goes to its own provider.
  const pasted = draft.trim();
  const test = async (): Promise<void> => {
    setTesting(true);
    setTested(undefined);
    try {
      setTested(await testKey(api, provider.id, pasted === "" ? undefined : pasted));
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTesting(false);
    }
  };

  // The one control in the app that handles a key, and the one that does its own request rather
  // than going through `useMutation`: a mutation keeps what it was called with in
  // `state.variables` for its whole life, and nothing here may hold a key past the save. The
  // draft is cleared in the same tick the answer lands, so the value exists only between the
  // keystroke and the response.
  const save = async (): Promise<void> => {
    setSaving(true);
    setFailure(undefined);
    try {
      await saveProviderKey(api, provider.id, draft);
      setDraft("");
      setSaved(true);
      setTested(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.providers });
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const remove = useMutation({
    mutationFn: () => removeProviderKey(api, provider.id),
    onSuccess: async () => {
      setAsking(false);
      setFailure(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.providers });
    },
    onError: (cause: Error) => {
      setAsking(false);
      setFailure(cause.message);
    },
  });

  // The tick sits beside Save for 2 s.
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

  const described = [hasKey ? storedId : undefined, tested === undefined ? undefined : testId]
    .filter((id) => id !== undefined)
    .join(" ");

  return (
    <section
      aria-labelledby={headingId}
      data-ready={hasKey}
      className="flex min-w-0 flex-col gap-5"
    >
      <div>
        <div className="flex items-center gap-2">
          <h3 id={headingId} className="sl-section-head__title">
            {hasKey ? provider.displayName : `Set up ${provider.displayName}`}
          </h3>
          <InfoTip id={providerTips[provider.id]} label={provider.displayName} />
        </div>
        <p className="sl-section-head__meta">
          {familyTitles[provider.family]} · {hasKey ? "a key is saved" : "needs an API key"}
        </p>
      </div>

      {guide === undefined ? null : hasKey ? (
        <details className="text-small text-ink-2">
          <summary className="cursor-pointer">Where to get a key</summary>
          <div className="mt-2 flex flex-col gap-2">
            <GuideSteps guide={guide} />
          </div>
        </details>
      ) : (
        <div className="flex flex-col gap-2 text-small text-ink-2">
          <GuideSteps guide={guide} />
        </div>
      )}

      <Field
        label={`${provider.displayName} API key`}
        tip="settings.providers.api-key"
        help="Stored on this computer only. Never in backups or exports."
        error={failure}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 basis-[200px]"
            aria-describedby={described === "" ? undefined : described}
            placeholder={hasKey ? keyMask : "Paste API key"}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
          <Button
            variant="primary"
            aria-label={`Save ${provider.displayName} key`}
            disabled={draft.trim() === "" || saving}
            onClick={() => {
              void save();
            }}
          >
            Save
          </Button>
        </div>
      </Field>
      {hasKey ? (
        <span id={storedId} className="sr-only">
          A key is stored for this provider.
        </span>
      ) : null}
      {tested === undefined ? null : (
        <p
          id={testId}
          role={tested.ok ? "status" : "alert"}
          className={cn("m-0 text-small", tested.ok ? "text-accent-ink" : "text-danger")}
        >
          {tested.message}
        </p>
      )}

      <div className="sl-btn-row">
        <Button
          aria-label={`Test ${provider.displayName} key`}
          disabled={(!hasKey && pasted === "") || testing}
          disabledReason="Paste a key first."
          onClick={() => {
            void test();
          }}
        >
          {testing ? "Testing…" : "Test"}
        </Button>
        <InfoTip id="settings.providers.test-key" label="Test" />
        <Button
          variant="quiet"
          aria-label={`Remove ${provider.displayName} key`}
          disabled={!hasKey}
          onClick={() => {
            setAsking(true);
          }}
        >
          Remove
        </Button>
        <span className="inline-flex w-[52px]">{saved ? <SavedTick /> : null}</span>
      </div>

      <ConfirmDialog
        open={asking}
        title={`Remove the ${provider.displayName} key?`}
        consequence="Projects that used this provider cannot retry until a key is saved."
        confirmLabel="Remove key"
        pending={remove.isPending}
        onConfirm={() => {
          remove.mutate();
        }}
        onCancel={() => {
          setAsking(false);
        }}
      />
    </section>
  );
}

// Where to sign up, which page makes the key, what it needs: the provider's own pages only.
function GuideSteps({ guide }: { readonly guide: KeyGuide }) {
  const link = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline">
      {label}
    </a>
  );
  return (
    <>
      <ol className="m-0 list-decimal space-y-1 pl-5">
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="m-0">
        Sign up: {link(guide.signUp.url, guide.signUp.label)}. Make the key:{" "}
        {link(guide.keyPage.url, guide.keyPage.label)}.
        {guide.billing === undefined ? null : (
          <> Credit: {link(guide.billing.url, guide.billing.label)}.</>
        )}
      </p>
      <p className="m-0">{guide.permissions}</p>
      <p className="m-0">
        More in the provider's {link(guide.docs.url, guide.docs.label)}. After saving, choose Test.
      </p>
    </>
  );
}

function SkeletonKeys() {
  return (
    <div
      className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      role="status"
      aria-label="Loading providers"
    >
      <div className="flex flex-col gap-6">
        {(
          [
            ["llm", 4],
            ["tts", 5],
            ["image", 5],
          ] as const
        ).map(([family, count]) => (
          <div key={family}>
            <span className="mb-2 block h-3 w-16 rounded-control bg-raised" />
            <div className="sl-list">
              {Array.from({ length: count }, (_, line) => `${family}-${line}`).map((row) => (
                <div key={row} className="sl-row">
                  <span className="h-4 w-32 rounded-control bg-raised" />
                  <span className="h-4 w-20 rounded-control bg-raised" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <span className="h-6 w-48 rounded-control bg-raised" />
        <span className="h-10 rounded-control bg-raised" />
      </div>
    </div>
  );
}
