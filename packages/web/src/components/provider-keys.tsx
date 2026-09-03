import type { ProviderFamily, ProviderStatus } from "@app/slices/settings/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useId, useState } from "react";
import { removeProviderKey, saveProviderKey } from "@/api";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { Lamp } from "@/components/lamp";
import { Rail, RailGroup } from "@/components/rail";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { keys, providersQuery } from "@/queries";

// The three families, in the order Settings draws them.
const familyOrder: readonly ProviderFamily[] = ["llm", "tts", "image"];
const familyTitles: Readonly<Record<ProviderFamily, string>> = {
  llm: "API keys · LLM",
  tts: "API keys · Text to speech",
  image: "API keys · Image generation",
};

// The same constant slices/settings/keys.ts answers a save with: a fixed mask carrying
// no character of the key and not even its length. It is spelled here too because
// `GET /api/providers` reports only whether a key is stored, never the mask.
const keyMask = "••••••••••••";

const row =
  "grid grid-cols-[140px_1fr_auto] items-end gap-[14px] border-t border-line px-4 py-[14px] first:border-t-0";
const header = "engraved border-t border-line px-4 py-3 text-ink3 first:border-t-0";

// Every supported provider, keyed or not, found or not, so the user can see that a
// provider exists and why it is unavailable.
export function ProviderKeys() {
  const { api } = useApp();
  const providers = useQuery(providersQuery(api));

  if (providers.error !== null) {
    return (
      <RailGroup>
        <Rail>
          <p className="text-body text-red">{providers.error.message}</p>
        </Rail>
      </RailGroup>
    );
  }
  if (providers.data === undefined) {
    return <SkeletonKeys />;
  }

  const listed = providers.data.providers;
  // On a fresh install nothing is selectable on Play yet, and the hint
  // under the LLM group is what says so.
  const fresh = listed.every(
    (provider) => provider.readiness.kind !== "keyed" || !provider.readiness.hasKey,
  );

  return (
    <RailGroup>
      {familyOrder.map((family) => (
        <Fragment key={family}>
          <h2 className={header}>{familyTitles[family]}</h2>
          {listed
            .filter((provider) => provider.family === family)
            .map((provider) =>
              provider.readiness.kind === "cli" ? (
                <CliRow key={provider.id} provider={provider} readiness={provider.readiness} />
              ) : (
                <KeyRow key={provider.id} provider={provider} hasKey={provider.readiness.hasKey} />
              ),
            )}
          {family === "llm" && fresh ? (
            <p className="border-t border-line px-4 pt-[10px] pb-[14px] text-small text-ink2">
              Paste a key to make its provider selectable on Play.
            </p>
          ) : null}
        </Fragment>
      ))}
    </RailGroup>
  );
}

function KeyRow({
  provider,
  hasKey,
}: {
  readonly provider: ProviderStatus;
  readonly hasKey: boolean;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const fieldId = useId();
  const labelId = useId();
  const nameId = useId();
  const storedId = useId();
  const errorId = useId();

  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [asking, setAsking] = useState(false);

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

  const described = [hasKey ? storedId : undefined, failure === undefined ? undefined : errorId]
    .filter((id) => id !== undefined)
    .join(" ");

  return (
    <div data-ready={hasKey} className={row}>
      <span id={nameId} className="pb-[7px] font-semibold">
        {provider.displayName}
      </span>

      <div>
        <Label htmlFor={fieldId} id={labelId} className="mb-[5px]">
          API key
        </Label>
        <Input
          id={fieldId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          // The visible label is "API key" on every row, so the accessible name carries
          // the provider's name with it.
          aria-labelledby={`${nameId} ${labelId}`}
          aria-invalid={failure !== undefined}
          aria-describedby={described === "" ? undefined : described}
          placeholder={hasKey ? keyMask : undefined}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        {hasKey ? (
          <span id={storedId} className="sr-only">
            A key is stored for this provider.
          </span>
        ) : null}
        {failure === undefined ? null : (
          <p id={errorId} className="mt-1 text-label text-red">
            {failure}
          </p>
        )}
      </div>

      <div className="flex min-h-8 items-center gap-2">
        <Button
          aria-label={`Save ${provider.displayName} key`}
          disabled={draft.trim() === "" || saving}
          onClick={() => {
            void save();
          }}
        >
          Save
        </Button>
        {saved ? <SavedTick /> : null}
        {hasKey ? (
          <Button
            className="bg-transparent"
            aria-label={`Remove ${provider.displayName} key`}
            onClick={() => {
              setAsking(true);
            }}
          >
            Remove
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={asking}
        title={`Remove the ${provider.displayName} key?`}
        consequence="Projects that used this provider cannot retry until a key is saved."
        verb="Remove"
        pending={remove.isPending}
        onConfirm={() => {
          remove.mutate();
        }}
        onCancel={() => {
          setAsking(false);
        }}
      />
    </div>
  );
}

// A local agent CLI has no key: the CLI's own login is used, so the row is a status line and no
// controls. The name greys to --ink3 when the binary did not answer, which is the contrast
// floor rather than an opacity that would drop the status text below it.
function CliRow({
  provider,
  readiness,
}: {
  readonly provider: ProviderStatus;
  readonly readiness: {
    readonly kind: "cli";
    readonly installed: boolean;
    readonly version?: string;
  };
}) {
  return (
    <div
      data-ready={readiness.installed}
      className="grid grid-cols-[140px_1fr] items-center gap-[14px] border-t border-line px-4 py-[14px] first:border-t-0"
    >
      <span className={cn("font-semibold", readiness.installed ? "text-ink" : "text-ink3")}>
        {provider.displayName}
      </span>
      <p className="flex flex-wrap items-center gap-2 text-small text-ink2">
        <Lamp state={readiness.installed ? "done" : "pending"} />
        <span>{statusOf(readiness)}</span>
        {readiness.installed ? null : (
          <span className="text-ink3">{`Install the ${provider.displayName} and reload this page.`}</span>
        )}
      </p>
    </div>
  );
}

function statusOf(readiness: { readonly installed: boolean; readonly version?: string }): string {
  if (!readiness.installed) {
    return "Not found on PATH";
  }
  // A CLI that ran but printed nothing a version could be read out of is still installed.
  return readiness.version === undefined ? "Installed" : `Installed, version ${readiness.version}`;
}

function SkeletonKeys() {
  return (
    <RailGroup>
      {[0, 1, 2, 3].map((line) => (
        <Rail key={line}>
          <span className="h-4 w-28 rounded-control bg-panel2" />
          <span className="h-8 flex-1 rounded-control bg-panel2" />
        </Rail>
      ))}
    </RailGroup>
  );
}
