import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import type { TemplateSection } from "@app/slices/template-studio/model.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { AudioPlayer } from "@/components/kit/audio-player";
import { Button, ButtonRow } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { TextLink } from "@/components/kit/link";
import { MediaFrame, MediaGrid } from "@/components/kit/media";
import { SectionHead } from "@/components/kit/section-head";
import { Lamp, type Tone } from "@/components/kit/status";
import { Switch } from "@/components/kit/switch";
import { usd } from "@/lib/format";
import { ModelPicker, ProviderPicker } from "@/play/pickers";
import { providersQuery } from "@/queries";
import {
  about,
  type BakeoffEntryView,
  type BakeoffPick,
  type BakeoffSection,
  type BakeoffView,
  bakeoffQuery,
  discardBakeoff,
  quoteBakeoff,
  startBakeoff,
  templateStudioKey,
} from "./api";
import { budgetLead, budgetReason } from "./budget-words";

// Compare models: one section's sample made again on one or two other models, side by side
// with the one in use, by what each made, cost and took. "Use this model" puts the model into
// the settings; Save then makes the template's own sample with it, at the price on its button.

const familyOf = { script: "llm", voice: "tts", pictures: "image" } as const;
const pickLabel = {
  script: "text model",
  voice: "voice model",
  pictures: "picture model",
} as const;

export function bakeoffSectionOf(section: TemplateSection): BakeoffSection | undefined {
  return section === "script" || section === "voice" || section === "pictures"
    ? section
    : undefined;
}

// The model a section uses now, as the studio's settings hold it.
export function modelIn(
  document: PlayDraftDocument,
  section: BakeoffSection,
): BakeoffPick | undefined {
  const { form } = document;
  const choice =
    section === "script"
      ? form.sources.article === "generate"
        ? form.llm
        : undefined
      : section === "voice"
        ? form.sources.audio === "generate"
          ? form.audio
          : undefined
        : form.sources.images === "generate"
          ? form.images
          : undefined;
  return choice === undefined || choice.provider === "" || choice.model === ""
    ? undefined
    : { provider: choice.provider, model: choice.model };
}

// The settings with the section made with `pick`. A thinking level stays only on the same
// provider: another may not offer it.
export function usingModel(
  document: PlayDraftDocument,
  section: BakeoffSection,
  pick: BakeoffPick,
): PlayDraftDocument {
  const { form } = document;
  switch (section) {
    case "script": {
      const { thinking, ...rest } = form.llm;
      return {
        ...document,
        form: {
          ...form,
          llm: {
            ...rest,
            provider: pick.provider,
            model: pick.model,
            ...(thinking !== undefined && pick.provider === form.llm.provider ? { thinking } : {}),
          },
        },
      };
    }
    case "voice":
      return { ...document, form: { ...form, audio: { ...form.audio, model: pick.model } } };
    case "pictures":
      return {
        ...document,
        form: { ...form, images: { ...form.images, provider: pick.provider, model: pick.model } },
      };
  }
}

const stateWords: Readonly<Record<BakeoffEntryView["state"], readonly [Tone, string]>> = {
  current: ["done", "In use now"],
  queued: ["waiting", "Waiting"],
  making: ["running", "Making"],
  done: ["done", "Made"],
  failed: ["failed", "Failed"],
};

const secondsText = (seconds: number | null): string =>
  seconds === null
    ? "time not known"
    : seconds < 60
      ? `${Math.round(seconds)} s`
      : `${Math.round(seconds / 60)} min`;

function Made({ entry, origin }: { readonly entry: BakeoffEntryView; readonly origin: string }) {
  const audio = entry.outputs.find((one) => one.role.startsWith("audio"));
  const pictures = entry.outputs.filter((one) => one.role === "image");
  if (entry.article !== null)
    return (
      <p className="m-0 line-clamp-6 whitespace-pre-line text-small text-ink-2">{entry.article}</p>
    );
  if (audio !== undefined)
    return (
      <AudioPlayer src={`${origin}${audio.url}`} label={`Narration by ${entry.model}`} compact />
    );
  if (pictures.length > 0)
    return (
      <MediaGrid density="compact" list label={`Pictures by ${entry.model}`}>
        {pictures.slice(0, 4).map((picture) => (
          <li key={picture.url}>
            <MediaFrame src={`${origin}${picture.url}`} alt={`A picture by ${entry.model}`} />
          </li>
        ))}
      </MediaGrid>
    );
  return null;
}

// The bake-off of this section, when there is one: each model with what it made.
export function BakeoffResults({
  templateId,
  section,
  onUse,
}: {
  readonly templateId: string;
  readonly section: BakeoffSection;
  readonly onUse: (pick: BakeoffPick, sentence: string) => void;
}): ReactElement | null {
  const { api } = useApp();
  const client = useQueryClient();
  const query = useQuery(bakeoffQuery(api, templateId));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const bakeoff: BakeoffView | null | undefined = query.data?.bakeoff;
  if (bakeoff === null || bakeoff === undefined || bakeoff.section !== section) return null;
  const going = bakeoff.state === "queued" || bakeoff.state === "making";
  async function discard(): Promise<boolean> {
    setBusy(true);
    setProblem(null);
    try {
      const reply = await discardBakeoff(api, templateId);
      if (!reply.ok) {
        setProblem(reply.message);
        return false;
      }
      await client.invalidateQueries({ queryKey: templateStudioKey(templateId) });
      return true;
    } catch (error) {
      setProblem(
        `The bake-off wasn't discarded: ${error instanceof Error ? error.message : String(error)} Press Discard again.`,
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Compared models" className="flex flex-col gap-3">
      <SectionHead
        title="Compared models"
        as="h3"
        size="small"
        info="template-studio.bakeoff-results"
        meta={
          bakeoff.stale
            ? `Made for version ${String(bakeoff.version)}; the template was saved since.`
            : going
              ? "Being made on copies of the sample. Your template doesn't change."
              : "Made on copies of the sample. Your template doesn't change until you use a model and Save."
        }
      >
        <Button
          variant="quiet"
          size="small"
          disabled={busy || going}
          disabledReason={
            going
              ? "Work already going is never stopped: discard it once it finishes"
              : "Discarding"
          }
          focusableWhenDisabled
          onClick={() => void discard()}
        >
          Discard
        </Button>
      </SectionHead>
      {bakeoff.sentence === null ? null : (
        <p
          className={
            bakeoff.state === "failed" || bakeoff.state === "held"
              ? "m-0 text-body text-waiting"
              : "m-0 text-small text-ink-2"
          }
        >
          {bakeoff.sentence}
        </p>
      )}
      {problem === null ? null : (
        <p role="alert" className="m-0 text-body text-danger">
          {problem}
        </p>
      )}
      <ul aria-label="Models compared" className="sl-list m-0 list-none p-0">
        {bakeoff.entries.map((entry) => {
          const [tone, word] = stateWords[entry.state];
          const cost =
            entry.cost !== null
              ? `${usd(entry.cost)} charged`
              : entry.quotedHigh !== null
                ? `${about(entry.quotedHigh)}`
                : "cost not known";
          return (
            <li key={`${entry.provider}:${entry.model}`} className="sl-row max-sm:grid-cols-1">
              <div className="flex min-w-0 flex-col gap-2">
                <p className="m-0 flex flex-wrap items-center gap-2 font-semibold">
                  <Lamp tone={tone} />
                  {entry.model}
                </p>
                <p className="m-0 text-small text-ink-2">
                  {`${word} · ${cost} · ${secondsText(entry.seconds)}`}
                </p>
                {entry.failure === null ? null : (
                  <p className="m-0 text-small text-danger">{entry.failure}</p>
                )}
                <Made entry={entry} origin={api.origin} />
              </div>
              {entry.state === "done" && !bakeoff.stale ? (
                <ButtonRow>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={busy}
                    onClick={async () => {
                      if (await discard())
                        onUse(
                          { provider: entry.provider, model: entry.model },
                          `Switched to ${entry.model}. Press Save to make the template's sample with it; the compared copies were discarded.`,
                        );
                    }}
                  >
                    Use this model
                  </Button>
                </ButtonRow>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Compare models: the button beside a section's model, and the drawer that prices and starts
// the bake-off. `preset` is a model to compare, from Settings → Models → Compare on a sample.
export function CompareModels({
  templateId,
  section,
  document,
  dirty,
  preset,
}: {
  readonly templateId: string;
  readonly section: BakeoffSection;
  readonly document: PlayDraftDocument;
  readonly dirty: boolean;
  readonly preset?: BakeoffPick | undefined;
}): ReactElement | null {
  const [open, setOpen] = useState(preset !== undefined);
  const current = modelIn(document, section);
  if (current === undefined) return null;
  return (
    <span className="inline-flex items-center gap-1 self-start" {...helpScope}>
      <Button
        size="small"
        variant="quiet"
        disabled={dirty}
        disabledReason="Save first: models are compared on the saved version's sample"
        focusableWhenDisabled
        onClick={() => setOpen(true)}
      >
        Compare models
      </Button>
      <InfoTip id="template-studio.compare-models" label="Compare models" />
      {open ? (
        <CompareDrawer
          templateId={templateId}
          section={section}
          current={current}
          preset={preset}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </span>
  );
}

function CompareDrawer({
  templateId,
  section,
  current,
  preset,
  onClose,
}: {
  readonly templateId: string;
  readonly section: BakeoffSection;
  readonly current: BakeoffPick;
  readonly preset: BakeoffPick | undefined;
  readonly onClose: () => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const providers = useQuery(providersQuery(api));
  const family = familyOf[section];
  const blank: BakeoffPick = { provider: current.provider, model: "" };
  const [picks, setPicks] = useState<readonly BakeoffPick[]>([preset ?? blank]);
  const [acceptUnknown, setAcceptUnknown] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const chosen = picks.filter((pick) => pick.provider !== "" && pick.model !== "");
  const complete = chosen.length === picks.length;
  const quote = useQuery({
    queryKey: [...templateStudioKey(templateId), "bakeoff-quote", section, JSON.stringify(chosen)],
    queryFn: async () => {
      const reply = await quoteBakeoff(api, templateId, { section, models: chosen });
      if (!reply.ok) throw new Error(reply.message);
      return reply.value;
    },
    enabled: complete && chosen.length > 0,
    retry: false,
  });
  const unknown = quote.data?.unknown ?? 0;
  const blocked = !complete
    ? `Pick the ${pickLabel[section]} to compare first`
    : quote.isPending
      ? "Working out the price"
      : quote.error !== null
        ? "This can't be compared as picked"
        : quote.data?.problem !== null && quote.data?.problem !== undefined
          ? "No sample can be made with this model"
          : quote.data?.fits === false
            ? budgetReason(quote.data)
            : unknown > 0 && !acceptUnknown
              ? "Accept the steps with no known price first"
              : undefined;
  async function compare(): Promise<void> {
    if (quote.data === undefined) return;
    setSending(true);
    setProblem(null);
    try {
      const reply = await startBakeoff(api, templateId, {
        section,
        models: chosen,
        acknowledgedHigh: quote.data.high,
        acknowledgedUnknown: acceptUnknown,
      });
      if (!reply.ok) {
        setProblem(`Nothing was started: ${reply.message}`);
        if (reply.quote !== null)
          client.setQueryData(
            [...templateStudioKey(templateId), "bakeoff-quote", section, JSON.stringify(chosen)],
            reply.quote,
          );
        return;
      }
      await client.invalidateQueries({ queryKey: templateStudioKey(templateId) });
      onClose();
    } catch (error) {
      setProblem(
        `Nothing was started: ${error instanceof Error ? error.message : String(error)} Press Compare again.`,
      );
    } finally {
      setSending(false);
    }
  }
  const set = (index: number, next: BakeoffPick) =>
    setPicks(picks.map((pick, at) => (at === index ? next : pick)));
  const failed = quote.error?.message ?? quote.data?.problem ?? null;
  return (
    <Drawer
      open
      onClose={onClose}
      title="Compare models"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={sending || blocked !== undefined}
            disabledReason={sending ? "Starting the comparison" : (blocked ?? "")}
            focusableWhenDisabled
            onClick={() => void compare()}
          >
            {quote.data === undefined ? "Compare" : `Compare · ${about(quote.data.high)}`}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-small text-ink-2">
          {`Makes this section's sample again with each model, on copies of the sample, so you can compare what each makes, costs and takes. In use now: ${current.model}. Your template doesn't change until you press Use this model and Save.`}
        </p>
        {picks.map((pick, index) => (
          <div key={String(index)} className="flex flex-col gap-2">
            {section === "voice" ? null : (
              <ProviderPicker
                label={`Provider ${String(index + 1)}`}
                family={family}
                providers={providers.data?.providers ?? []}
                value={pick.provider}
                problem={undefined}
                tip="template-studio.compare-provider"
                onPick={(provider) => set(index, { provider, model: "" })}
              />
            )}
            <ModelPicker
              label={`Model ${String(index + 1)}`}
              provider={pick.provider}
              value={pick.model}
              problem={undefined}
              tip="template-studio.compare-model"
              onPick={(model) => set(index, { ...pick, model })}
            />
            {picks.length > 1 ? (
              <Button
                size="small"
                variant="quiet"
                className="self-start"
                onClick={() => setPicks(picks.filter((_, at) => at !== index))}
              >
                {`Remove model ${String(index + 1)}`}
              </Button>
            ) : null}
          </div>
        ))}
        {picks.length < 2 ? (
          <Button size="small" className="self-start" onClick={() => setPicks([...picks, blank])}>
            Add another model
          </Button>
        ) : null}
        {unknown > 0 ? (
          <Switch
            label={`Accept ${String(unknown)} ${unknown === 1 ? "step" : "steps"} with no known price`}
            tip="template-studio.accept-unknown"
            tipLabel="Steps with no known price"
            checked={acceptUnknown}
            onChange={setAcceptUnknown}
          />
        ) : null}
        <p className="m-0 text-small text-ink-2" role="status">
          {quote.data === undefined
            ? complete
              ? "Working out the price…"
              : ""
            : `${quote.data.models.map((one) => `${one.model}: ${about(one.high)}`).join(" · ")} · ${usd(quote.data.budget.left)} of today's ${usd(quote.data.budget.budget)} sample budget left`}
        </p>
        {quote.data?.fits === false ? (
          <p className="m-0 text-body text-waiting">
            {budgetLead(quote.data, "Comparing")}
            <TextLink to="/settings" search={{ section: "template-studio" }}>
              Settings → Template studio
            </TextLink>
            .
          </p>
        ) : null}
        {failed === null ? null : (
          <p role="alert" className="m-0 text-body text-danger">
            {failed}
          </p>
        )}
        {problem === null ? null : (
          <p role="alert" className="m-0 text-body text-danger">
            {problem}
          </p>
        )}
      </div>
    </Drawer>
  );
}
