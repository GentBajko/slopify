import type { StudioView } from "@app/slices/template-studio/schema.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { Field, Input } from "@/components/kit/field";
import { Segmented, Switch } from "@/components/kit/switch";
import { about, changeTopic, quoteSample, templateStudioKey } from "./api";

type Choice = "typed" | "next-queued" | "fixed";

// The sample's topic, in the header: every section's sample is about it. Changing it remakes
// every paid sample, so the drawer prices it before anything is spent.
export function SampleTopic({ view }: { readonly view: StudioView }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="small" variant="quiet" onClick={() => setOpen(true)}>
        {`Sample topic: ${view.sample.topic}`}
      </Button>
      <TopicDrawer view={view} open={open} onClose={() => setOpen(false)} />
    </>
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
            ? "Today's sample budget can't cover it"
            : unknown > 0 && !acceptUnknown
              ? "Accept the steps with no known price first"
              : undefined;
  async function use(): Promise<void> {
    if (quote.data === undefined) return;
    setSaving(true);
    setProblem(null);
    try {
      const reply = await changeTopic(api, view.template.id, {
        topic,
        acknowledgedHigh: quote.data.high,
        acknowledgedUnknown: acceptUnknown,
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
      await client.invalidateQueries({ queryKey: templateStudioKey(view.template.id) });
      onClose();
    } catch (error) {
      setProblem(
        `The topic wasn't changed: ${error instanceof Error ? error.message : String(error)} Press Use topic again.`,
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
            {quote.data === undefined ? "Use topic" : `Use topic · ${about(quote.data.high)}`}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-small text-ink-2">
          Every section's sample is made about this topic. A new one remakes all of them.
        </p>
        <Segmented
          label="Topic"
          value={choice}
          onChange={setChoice}
          options={[
            { value: "typed", label: "Type one" },
            { value: "next-queued", label: "Next queued topic" },
            { value: "fixed", label: "The fixed topic" },
          ]}
        />
        {choice === "typed" ? (
          <Field label="Topic">
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
