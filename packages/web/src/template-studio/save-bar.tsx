import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import type { SampleQuoteView, StudioView } from "@app/slices/template-studio/schema.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { ActionBar, StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { TextLink } from "@/components/kit/link";
import { Switch } from "@/components/kit/switch";
import { templatesKey } from "@/templates/api";
import { about, quoteSample, saveInStudio, templateStudioKey } from "./api";
import { budgetLead, budgetReason } from "./budget-words";

// The studio's one action bar: Save, priced. The primary Save makes the paid sample of what
// changed at the price on the button; Save without a sample keeps the change and makes only the
// free samples. Nothing is spent above the price shown: a higher one comes back on the button.

// How long the studio waits after the last edit before pricing it again.
const pricingDelayMs = 400;

export function priceLabel(quote: SampleQuoteView): string {
  if (quote.onPlan) return "Save · plan usage";
  if (quote.high === 0)
    return quote.first || quote.sections.length > 0 ? "Save · free" : "Save · no paid change";
  return `Save · ${about(quote.high)}`;
}

export function SaveBar({
  view,
  document,
  dirty,
  note,
}: {
  readonly view: StudioView;
  readonly document: PlayDraftDocument;
  readonly dirty: boolean;
  // A word from the page (where files are added, a sample request that failed).
  readonly note?: { readonly tone: StatusTone; readonly text: string } | undefined;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const id = view.template.id;
  const [priced, setPriced] = useState(document);
  useEffect(() => {
    const timer = setTimeout(() => setPriced(document), pricingDelayMs);
    return () => clearTimeout(timer);
  }, [document]);
  const quoteKey = [
    ...templateStudioKey(id),
    "quote",
    view.template.version,
    JSON.stringify(priced),
  ];
  const quote = useQuery({
    queryKey: quoteKey,
    queryFn: () => quoteSample(api, id, { document: priced }),
    enabled: dirty,
  });
  const [acceptUnknown, setAcceptUnknown] = useState(false);
  const [status, setStatus] = useState<{ tone: StatusTone; text: string } | undefined>();
  const [saving, setSaving] = useState(false);
  const mutation = useRef(crypto.randomUUID());
  const pending = priced !== document || quote.isFetching;
  const shown = dirty ? quote.data : undefined;

  async function save(sample: "make" | "skip"): Promise<void> {
    if (sample === "make" && shown === undefined) return;
    setSaving(true);
    setStatus({ tone: "info", text: "Saving…" });
    try {
      const reply = await saveInStudio(api, id, {
        mutationId: mutation.current,
        baseVersion: view.template.version,
        name: view.template.name,
        document,
        sample,
        acknowledgedHigh: sample === "make" ? (shown?.high ?? 0) : 0,
        acknowledgedUnknown: sample === "make" && acceptUnknown,
      });
      if (!reply.ok) {
        // A new price comes back on the button, ready to accept with one more press.
        if (reply.quote !== null) client.setQueryData(quoteKey, reply.quote);
        setStatus({ tone: "error", text: `The template wasn't saved: ${reply.message}` });
        return;
      }
      mutation.current = crypto.randomUUID();
      setStatus(undefined);
      await client.invalidateQueries({ queryKey: templatesKey });
      await client.invalidateQueries({ queryKey: templateStudioKey(id) });
    } catch (error) {
      setStatus({
        tone: "error",
        text: `The template wasn't saved: ${error instanceof Error ? error.message : String(error)} Press Save again.`,
      });
    } finally {
      setSaving(false);
    }
  }

  const unknown = shown?.unknown ?? 0;
  const blocked =
    pending && dirty
      ? "Pricing the sample"
      : shown === undefined
        ? quote.error
          ? "The sample couldn't be priced"
          : "Nothing changed since the last save"
        : shown.problem !== null
          ? "No sample can be made of this setup"
          : !shown.fits
            ? budgetReason(shown)
            : unknown > 0 && !acceptUnknown
              ? "Accept the steps with no known price first"
              : undefined;
  const message =
    status ??
    note ??
    (shown?.problem != null
      ? {
          tone: "warning" as const,
          text: `${shown.problem} Save without a sample keeps the change.`,
        }
      : quote.error
        ? {
            tone: "error" as const,
            text: `The sample couldn't be priced: ${quote.error.message} Save without a sample keeps the change.`,
          }
        : dirty
          ? { tone: "info" as const, text: "Unsaved changes." }
          : undefined);
  return (
    <ActionBar
      status={
        shown !== undefined && !shown.fits && status === undefined ? (
          <StatusSlot tone="warning" wrap>
            <span className="min-w-0">
              {budgetLead(shown, "This sample")}
              <TextLink to="/settings" search={{ section: "template-studio" }}>
                Settings → Template studio
              </TextLink>
              , or press Save without a sample.
            </span>
          </StatusSlot>
        ) : (
          <StatusSlot tone={message?.tone ?? "info"} wrap>
            {message?.text}
          </StatusSlot>
        )
      }
    >
      {unknown > 0 && shown?.problem === null ? (
        <Switch
          checked={acceptUnknown}
          onChange={setAcceptUnknown}
          label={`Accept ${String(unknown)} ${unknown === 1 ? "step" : "steps"} with no known price`}
        />
      ) : null}
      <Button
        disabled={!dirty || saving}
        disabledReason={saving ? "Saving" : "Nothing changed since the last save"}
        onClick={() => void save("skip")}
      >
        Save without a sample
      </Button>
      <Button
        variant="primary"
        disabled={!dirty || saving || blocked !== undefined}
        disabledReason={saving ? "Saving" : (blocked ?? "")}
        onClick={() => void save("make")}
      >
        {shown === undefined ? (dirty && pending ? "Save · pricing…" : "Save") : priceLabel(shown)}
      </Button>
    </ActionBar>
  );
}
