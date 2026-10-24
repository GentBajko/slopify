import type { StudioView } from "@app/slices/template-studio/schema.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { Field, Input } from "@/components/kit/field";
import { Segmented, Switch } from "@/components/kit/switch";
import { about, changeTopic, quoteSample, templateStudioKey } from "./api";
import { budgetReason } from "./budget-words";

type Choice = "typed" | "next-queued" | "fixed";

// The sample's topic, over every section's sample: each is made about it. Changing it makes
// every paid sample again, so the drawer prices it before anything is spent.
export function SampleTopic({ view }: { readonly view: StudioView }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="sl-kicker">Sample topic</div>
        <p className="m-0 text-body text-ink">{view.sample.topic}</p>
      </div>
      <Button size="small" aria-label="Change the sample topic" onClick={() => setOpen(true)}>
        Change
      </Button>
      <TopicDrawer view={view} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function TopicDrawer({
  view,
  open,
  onClose,
}: {
  readonly view: StudioView;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const [choice, setChoice] = useState<Choice>("typed");
  const [typed, setTyped] = useState(view.sample.topic);
  const [asked, setAsked] = useState(view.sample.topic);
  const [acceptUnknown, setAcceptUnknown] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const attempt = useRef<{ readonly key: string; readonly id: string } | undefined>(undefined);
  useEffect(() => {
    const timer = setTimeout(() => setAsked(typed.trim()), 400);
    return () => clearTimeout(timer);
  }, [typed]);
  const topic = choice === "typed" ? asked : choice;
  const quote = useQuery({
    queryKey: [...templateStudioKey(view.template.id), "quote", "topic", topic],
    queryFn: () => quoteSample(api, view.template.id, { topic }),
    enabled: open && topic !== "",
    retry: false,
  });
  const unknown = quote.data?.unknown ?? 0;
  const blocked =
    topic === ""
      ? "Type a topic first"
      : quote.data === undefined
        ? "Pricing the new topic"
        : quote.data.problem !== null
          ? "No sample can be made of this setup"
          : !quote.data.fits
            ? budgetReason(quote.data)
            : unknown > 0 && !acceptUnknown
              ? "Accept the steps with no known price first"
              : undefined;
  async function use(): Promise<void> {
    if (quote.data === undefined) return;
    setSaving(true);
    setProblem(null);
    try {
      const ask = { topic, acknowledgedHigh: quote.data.high, acknowledgedUnknown: acceptUnknown };
      const key = JSON.stringify(ask);
      // Press Use this topic again after a lost answer: the same change, answered once.
      if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
      const reply = await changeTopic(api, view.template.id, {
        ...ask,
        mutationId: attempt.current.id,
      });
      if (!reply.ok) {
        setProblem(`The topic wasn't changed: ${reply.message}`);
        if (reply.quote !== null)
          client.setQueryData(
            [...templateStudioKey(view.template.id), "quote", "topic", topic],
            reply.quote,
          );
        return;
      }
      attempt.current = undefined;
      await client.invalidateQueries({ queryKey: templateStudioKey(view.template.id) });
      onClose();
    } catch (error) {
      setProblem(
        `The topic wasn't changed: ${error instanceof Error ? error.message : String(error)} Press Use this topic again.`,
      );
    } finally {
      setSaving(false);
    }
  }
  const failed = quote.error?.message ?? quote.data?.problem ?? null;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Sample topic"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={saving || blocked !== undefined}
            disabledReason={saving ? "Changing the topic" : (blocked ?? "")}
            onClick={() => void use()}
          >
            {quote.data === undefined
              ? "Use this topic"
              : `Use this topic · ${quote.data.high === 0 ? "free" : about(quote.data.high)}`}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-small text-ink-2">
          Every section's sample is made about this topic. A new topic makes every sample again, at
          the price on the button; going back to the fixed topic is free.
        </p>
        <Segmented
          label="Topic"
          help="The next queued topic is the one a schedule makes its next video about."
          value={choice}
          onChange={setChoice}
          options={[
            { value: "typed", label: "Type one" },
            { value: "next-queued", label: "Next queued topic" },
            { value: "fixed", label: "The fixed topic" },
          ]}
        />
        {choice === "typed" ? (
          <Field label="Your topic">
            <Input
              value={typed}
              maxLength={300}
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field>
        ) : null}
        {unknown > 0 ? (
          <Switch
            checked={acceptUnknown}
            onChange={setAcceptUnknown}
            label={`Accept ${String(unknown)} ${unknown === 1 ? "step" : "steps"} with no known price`}
            tip="template-studio.accept-unknown"
            tipLabel="Steps with no known price"
          />
        ) : null}
        {failed === null ? null : (
          <p role="alert" className="m-0 text-small text-danger">
            {failed}
          </p>
        )}
        {problem === null ? null : (
          <p role="alert" className="m-0 text-small text-danger">
            {problem}
          </p>
        )}
      </div>
    </Drawer>
  );
}
