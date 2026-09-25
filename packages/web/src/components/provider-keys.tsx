import type { ProviderFamily, ProviderStatus } from "@app/slices/settings/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { removeProviderKey, saveProviderKey } from "@/api";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { InfoTip } from "@/components/kit/info-tip";
import { Lamp } from "@/components/lamp";
import { CliProviderRow, providerRow } from "@/components/provider-cli";
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
  llm: "Text",
  tts: "Speech",
  image: "Images",
};

// The same constant slices/settings/keys.ts answers a save with: a fixed mask carrying
// no character of the key and not even its length. It is spelled here too because
// `GET /api/providers` reports only whether a key is stored, never the mask.
const keyMask = "••••••••••••";

const header = "engraved px-1 pb-2 text-ink3";

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
    <div className="flex flex-col gap-6">
      {fresh ? (
        <p className="text-small text-ink2">Paste a key to make its provider selectable on Play.</p>
      ) : null}
      {familyOrder.map((family) => (
        <section key={family} data-tour={`keys-${family}`} aria-labelledby={`keys-${family}-title`}>
          <h2 id={`keys-${family}-title`} className={header}>
            {familyTitles[family]}
          </h2>
          <RailGroup>
            {listed
              .filter((provider) => provider.family === family)
              .map((provider) =>
                provider.readiness.kind === "cli" ? (
                  <CliProviderRow
                    key={provider.id}
                    provider={provider}
                    readiness={provider.readiness}
                  />
                ) : (
                  <KeyRow
                    key={provider.id}
                    provider={provider}
                    hasKey={provider.readiness.hasKey}
                  />
                ),
              )}
          </RailGroup>
        </section>
      ))}
    </div>
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
    <div data-ready={hasKey} className={providerRow}>
      <span className="flex min-w-0 items-center gap-1">
        <span id={nameId} className="font-semibold">
          {provider.displayName}
        </span>
        {provider.id === "inworld" ? (
          <InfoTip label="Inworld keys">
            <p>Paste the Base64 credentials from Inworld Settings → API Keys.</p>
          </InfoTip>
        ) : null}
      </span>
      <span className="flex items-center gap-2">
        <Lamp state={hasKey ? "done" : "pending"} />
        <span className={cn("engraved", hasKey ? "text-done" : "text-ink3")}>
          {hasKey ? "Key saved" : "No key"}
        </span>
      </span>

      <div className="min-w-0">
        <Label htmlFor={fieldId} id={labelId} className="sr-only">
          API key
        </Label>
        <Input
          id={fieldId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          // The label is visually hidden on every row, so the accessible name carries the
          // provider's name with it.
          aria-labelledby={`${nameId} ${labelId}`}
          aria-invalid={failure !== undefined}
          aria-describedby={described === "" ? undefined : described}
          placeholder={hasKey ? keyMask : "Paste API key"}
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
        <span className="inline-flex w-[52px]">{saved ? <SavedTick /> : null}</span>
        <Button
          variant="ghost"
          aria-label={`Remove ${provider.displayName} key`}
          disabled={!hasKey}
          onClick={() => {
            setAsking(true);
          }}
        >
          Remove
        </Button>
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

function SkeletonKeys() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading providers">
      {(
        [
          ["llm", 4],
          ["tts", 5],
          ["image", 5],
        ] as const
      ).map(([family, count]) => (
        <div key={family}>
          <span className="mb-2 block h-3 w-16 rounded-control bg-panel2" />
          <RailGroup>
            {Array.from({ length: count }, (_, line) => `${family}-${line}`).map((row) => (
              <Rail key={row} className="py-[10px]">
                <span className="h-4 w-28 rounded-control bg-panel2" />
                <span className="h-8 flex-1 rounded-control bg-panel2" />
              </Rail>
            ))}
          </RailGroup>
        </div>
      ))}
    </div>
  );
}
