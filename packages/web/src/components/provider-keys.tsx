import { readinessIsUsable } from "@app/kernel/ports/model.js";
import { type KeyGuide, keyGuides } from "@app/slices/settings/key-guides.js";
import type { KeyTestOutcome } from "@app/slices/settings/key-test.js";
import type {
  ProviderFamily,
  ProviderId,
  ProviderStatus,
  Voice,
} from "@app/slices/settings/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { removeProviderKey, saveProviderKey } from "@/api";
import { useApp } from "@/app-context";
import { Button, ButtonRow } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Field } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
import { TextLink } from "@/components/kit/link";
import { hitArea, RowSelect } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { Status, type Tone } from "@/components/kit/status";
import { CliProviderDetail, cliState, ServiceAbout } from "@/components/provider-cli";
import { testKey } from "@/components/provider-upkeep-api";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import { SecretInput } from "@/components/secret-input";
import { localState, SystemVoiceDetail } from "@/components/system-voices";
import { cn } from "@/lib/utils";
import { keys, providersQuery, voicesQuery } from "@/queries";
import { BackLink, backPlace, backSearch, type SettingsBack } from "@/routes/settings-back";

// The three kinds of service, in the order Keys & services draws them, by what they do for a
// video: one writes, one reads aloud, one draws.
const familyOrder: readonly ProviderFamily[] = ["llm", "tts", "image"];
const familyTitles: Readonly<Record<ProviderFamily, string>> = {
  llm: "Writing services",
  tts: "Voice services",
  image: "Image services",
};
const familyWords: Readonly<Record<ProviderFamily, string>> = {
  llm: "Writing service",
  tts: "Voice service",
  image: "Image service",
};

// The same constant slices/settings/keys.ts answers a save with: a fixed mask carrying
// no character of the key and not even its length. It is spelled here too because
// `GET /api/providers` reports only whether a key is stored, never the mask.
const keyMask = "••••••••••••";

// "an OpenAI", "a Cartesia": the article a service's name takes in a button.
export function articleOf(name: string): "a" | "an" {
  return /^[aeiou]/i.test(name) ? "an" : "a";
}

function ready(provider: ProviderStatus): boolean {
  return readinessIsUsable(provider.readiness);
}

// One list of states for every service, here, on Voices and in the check of every service:
// Ready, No key, Not found, Signed out, Needs fixing, and Not installed for the computer's own
// voice without its speech program.
function stateOf(provider: ProviderStatus): {
  readonly tone: Tone;
  readonly word: string;
} {
  if (provider.readiness.kind === "cli") return cliState(provider.readiness);
  if (provider.readiness.kind === "local") return localState(provider.readiness);
  return provider.readiness.hasKey
    ? { tone: "done", word: "Ready" }
    : { tone: "off", word: "No key" };
}

function kindWord(provider: ProviderStatus): string {
  if (provider.readiness.kind === "cli") return "Sign-in";
  if (provider.readiness.kind === "local") return "Built in";
  return "API key";
}

// Which kind, and which service in it, to open and scroll to: from the address (a fix on the
// welcome or Create) or from a readiness line's button on this page.
export interface KeysFocus {
  readonly family: ProviderFamily | undefined;
  readonly provider: string | undefined;
  // Arriving from a link scrolls at once; a press on this page scrolls smoothly.
  readonly arrival: boolean;
}

// The service a kind opens on: the one named, else the one the saved voices need (they are
// what narration will use), else the first still to set up, else the first ready one.
function targetOf(
  listed: readonly ProviderStatus[],
  focus: KeysFocus,
  voices: readonly Voice[],
): ProviderStatus | undefined {
  const named = listed.find((provider) => provider.id === focus.provider);
  if (named !== undefined) return named;
  if (focus.family === undefined) return undefined;
  const kind = listed.filter((provider) => provider.family === focus.family);
  if (kind.some(ready)) return kind.find(ready);
  const needed = voices
    .map((voice) => kind.find((provider) => provider.id === voice.provider))
    .find((provider) => provider !== undefined);
  return needed ?? kind[0];
}

// The page opens on the first kind with nothing usable: the service to set up first. With
// every kind usable nothing opens, and the lists are the page.
function openingOf(
  listed: readonly ProviderStatus[],
  voices: readonly Voice[],
): ProviderStatus | undefined {
  const family = familyOrder.find((one) => {
    const kind = listed.filter((provider) => provider.family === one);
    return kind.length > 0 && !kind.some(ready);
  });
  return family === undefined
    ? undefined
    : targetOf(listed, { family, provider: undefined, arrival: false }, voices);
}

// How much of a kind (its heading, a few services and the top of the setup beside them) must
// already show for a link to it to leave the page where it is.
const inViewPx = 240;

// Two columns from 1024px: a kind's list with the picked service's setup beside it. On one
// column the setup opens under its own row, so the three lists stay together.
function useWide(): boolean {
  const query = "(min-width: 1024px)";
  const [wide, setWide] = useState(
    () => typeof window.matchMedia !== "function" || window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const change = () => setWide(list.matches);
    list.addEventListener?.("change", change);
    return () => list.removeEventListener?.("change", change);
  }, []);
  return wide;
}

// Every supported service, keyed or not, found or not, so the person can see that a service
// exists and why it is unavailable: one line each, by kind, with the picked one's setup (its
// key, or its sign-in, or the computer's voice) beside its kind's list.
export function ProviderKeys({
  focus,
  back,
}: {
  readonly focus?: KeysFocus | undefined;
  readonly back?: SettingsBack | undefined;
} = {}) {
  const { api } = useApp();
  const providers = useQuery(providersQuery(api));
  const voices = useQuery(voicesQuery(api));
  const wide = useWide();
  // undefined until the first answer decides it; null for none open.
  const [picked, setPicked] = useState<ProviderId | null | undefined>(undefined);
  const sections = useRef(new Map<ProviderFamily, HTMLElement>());

  const listed = familyOrder.flatMap((family) =>
    (providers.data?.providers ?? []).filter((provider) => provider.family === family),
  );
  const saved = voices.data?.voices ?? [];
  // What opens when the page arrives, once: the service asked for, or on two columns the
  // first one still to set up. It stays open after it is set up rather than jumping on.
  if (picked === undefined && providers.data !== undefined) {
    const first =
      focus === undefined
        ? wide
          ? openingOf(listed, saved)
          : undefined
        : targetOf(listed, focus, saved);
    setPicked(first?.id ?? null);
  }

  // A readiness line's button, or the address, asks for a kind: open it and bring it into view.
  const loaded = providers.data !== undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new focus, or the first answer, moves the page.
  useEffect(() => {
    if (focus === undefined || !loaded) return;
    const target = targetOf(listed, focus, saved);
    if (target !== undefined) setPicked(target.id);
    const family = target?.family ?? focus.family;
    if (family === undefined) return;
    const section = sections.current.get(family);
    // A kind whose heading and first lines are already in the window stays where it is, so the
    // page header (and its way back to the welcome or Create) stays in view on a wide screen.
    const top = section?.getBoundingClientRect().top;
    if (top !== undefined && top >= 0 && top + inViewPx <= window.innerHeight) return;
    section?.scrollIntoView?.({ block: "start", behavior: focus.arrival ? "auto" : "smooth" });
  }, [focus, loaded]);

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

  const selected = listed.find((provider) => provider.id === picked);
  const detailOf = (provider: ProviderStatus): ReactElement =>
    provider.readiness.kind === "cli" ? (
      <CliProviderDetail
        key={provider.id}
        provider={provider}
        readiness={provider.readiness}
        kind={familyWords[provider.family]}
      />
    ) : provider.readiness.kind === "local" ? (
      <SystemVoiceDetail key={provider.id} provider={provider} readiness={provider.readiness} />
    ) : (
      <KeyDetail
        key={provider.id}
        provider={provider}
        hasKey={provider.readiness.hasKey}
        voiceless={
          provider.family === "tts" &&
          voices.data !== undefined &&
          !saved.some((voice) => voice.provider === provider.id)
        }
        back={back}
      />
    );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {familyOrder.map((family) => (
        // The picked service's setup sits beside its own kind's list, inside the same section,
        // so the tutorial's spotlight on a kind holds both the list and the setup.
        <section
          key={family}
          ref={(element) => {
            if (element === null) sections.current.delete(family);
            else sections.current.set(family, element);
          }}
          data-tour={`keys-${family}`}
          aria-labelledby={`keys-${family}-title`}
          className="grid scroll-mt-4 items-start gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]"
        >
          <div className="min-w-0">
            <SectionHead
              id={`keys-${family}-title`}
              title={familyTitles[family]}
              size="small"
              className="pb-2"
            />
            <ul aria-label={familyTitles[family]} className="sl-list m-0 list-none p-0">
              {listed
                .filter((provider) => provider.family === family)
                .map((provider) => (
                  <ServiceRow
                    key={provider.id}
                    provider={provider}
                    selected={provider.id === selected?.id}
                    expands={!wide}
                    onSelect={() =>
                      setPicked((now) => (!wide && now === provider.id ? null : provider.id))
                    }
                  >
                    {!wide && provider.id === selected?.id ? detailOf(provider) : null}
                  </ServiceRow>
                ))}
            </ul>
          </div>
          {wide && selected !== undefined && selected.family === family ? (
            <div className="min-w-0">{detailOf(selected)}</div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

// One line per service: its name, how it connects, and its state in a word. Pressing anywhere
// on the line opens its setup.
function ServiceRow({
  provider,
  selected,
  expands,
  onSelect,
  children,
}: {
  readonly provider: ProviderStatus;
  readonly selected: boolean;
  // On one column the setup opens under the row, so the row says whether it is open.
  readonly expands: boolean;
  readonly onSelect: () => void;
  readonly children: ReactNode;
}): ReactElement {
  const state = stateOf(provider);
  return (
    <li
      data-selected={selected ? "true" : undefined}
      aria-current={selected ? "true" : undefined}
      className="border-b border-line"
    >
      <div
        className={cn(
          hitArea,
          "grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 hover:bg-raised",
          selected && "bg-accent-tint hover:bg-accent-tint",
        )}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <RowSelect
            onSelect={onSelect}
            expanded={expands ? selected : undefined}
            className="min-w-0"
          >
            {provider.displayName}
          </RowSelect>
          <span className="shrink-0 text-small text-ink-2">{kindWord(provider)}</span>
        </span>
        <Status tone={state.tone}>{state.word}</Status>
      </div>
      {children === null ? null : <div className="px-3 pt-2 pb-5">{children}</div>}
    </li>
  );
}

function KeyDetail({
  provider,
  hasKey,
  voiceless,
  back,
}: {
  readonly provider: ProviderStatus;
  readonly hasKey: boolean;
  // A voice service no saved voice uses: with its key saved, a voice is the next thing to add.
  readonly voiceless: boolean;
  readonly back: SettingsBack | undefined;
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
      className="flex min-w-0 flex-col gap-4"
    >
      <div>
        <h3 id={headingId} className="sl-section-head__title">
          {provider.displayName}
        </h3>
        <p className="sl-section-head__meta">
          {`${familyWords[provider.family]} · ${hasKey ? "a key is saved" : "needs an API key"}`}
        </p>
      </div>
      <ServiceAbout provider={provider} />

      <Field
        label={`${provider.displayName} API key`}
        help="Stored on this computer only, sent only to this service, never in backups or exports."
        error={failure}
      >
        {/* A form so Enter in the box saves, as the Save button does. */}
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim() !== "" && !saving) void save();
          }}
        >
          <SecretInput
            autoComplete="off"
            spellCheck={false}
            className="flex-1 basis-[200px]"
            aria-describedby={described === "" ? undefined : described}
            placeholder={hasKey ? keyMask : "Paste API key"}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
          <Button
            type="submit"
            variant="primary"
            aria-label={`Save ${provider.displayName} key`}
            disabled={draft.trim() === "" || saving}
          >
            Save
          </Button>
          <span className="inline-flex w-[52px]">{saved ? <SavedTick /> : null}</span>
        </form>
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

      {/* Nothing to test or remove until a key is pasted or saved, so neither shows before. */}
      {!hasKey && pasted === "" ? null : (
        <ButtonRow>
          {back !== undefined && hasKey ? (
            <BackLink back={back} variant="primary">
              {`Done · back to ${backPlace(back)}`}
            </BackLink>
          ) : null}
          <Button
            disabled={testing}
            onClick={() => {
              void test();
            }}
          >
            {testing ? "Testing…" : "Test the key (free)"}
          </Button>
          {hasKey ? (
            <Button
              variant="quiet"
              onClick={() => {
                setAsking(true);
              }}
            >
              Remove the key
            </Button>
          ) : null}
        </ButtonRow>
      )}
      {hasKey && voiceless ? (
        <p className="m-0 text-small text-ink-2">
          {`No ${provider.displayName} voice is saved yet, so narration can't use it. `}
          <TextLink to="/settings" search={{ section: "voices", ...backSearch(back) }}>
            {`Add ${articleOf(provider.displayName)} ${provider.displayName} voice`}
          </TextLink>
        </p>
      ) : null}

      {guide === undefined ? null : (
        <Fold summary="Where to get a key" state={`${String(guide.steps.length)} steps`}>
          <div className="flex flex-col gap-2 pt-2 text-small text-ink-2">
            <GuideSteps guide={guide} />
          </div>
        </Fold>
      )}

      <ConfirmDialog
        open={asking}
        title={`Remove the ${provider.displayName} key?`}
        consequence="Projects that used this service cannot retry until a key is saved."
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
        More in the service's {link(guide.docs.url, guide.docs.label)}. After saving, press Test the
        key.
      </p>
    </>
  );
}

function SkeletonKeys() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading services">
      {(
        [
          ["llm", 4],
          ["tts", 6],
          ["image", 5],
        ] as const
      ).map(([family, count]) => (
        <div key={family} className="max-w-[400px]">
          <span className="mb-2 block h-3 w-24 rounded-control bg-raised" />
          <div className="sl-list">
            {Array.from({ length: count }, (_, line) => `${family}-${line}`).map((row) => (
              <div
                key={row}
                className="flex h-10 items-center justify-between border-b border-line px-3"
              >
                <span className="h-4 w-32 rounded-control bg-raised" />
                <span className="h-4 w-16 rounded-control bg-raised" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
