import { type Cadence, validTimeZone } from "@app/slices/schedules/calendar.js";
import type {
  ScheduleCreate,
  ScheduleSummary,
  ScheduleUpdate,
} from "@app/slices/schedules/model.js";
import {
  briefMax,
  queueMax,
  type TopicGeneration,
  topicGenerationOff,
} from "@app/slices/schedules/schema.js";
import { templateKeywords } from "@app/slices/schedules/topic-list.js";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Field, Input, Select, Textarea } from "@/components/kit/field";
import { InfoTip } from "@/components/kit/info-tip";
import { ModelPicker, ProviderPicker } from "@/play/pickers";
import { providersQuery } from "@/queries";
import { readProjectTemplate } from "@/templates/api";
import { createSchedule, updateSchedule } from "./api";
import { localScheduleTime, scheduleInstant } from "./time";
import { initialQueue, type QueueContext, queueResult, TopicFields } from "./topic-queue";

const dayOptions = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
] as const;
export function ScheduleForm({
  templates,
  pending,
  onCreated,
  onError,
  editing,
  onCancel,
  error,
  onBusy,
}: {
  readonly templates: readonly {
    readonly id: string;
    readonly name: string;
    readonly version: number;
  }[];
  readonly pending: boolean;
  readonly onCreated: () => void;
  readonly onError: (message: string) => void;
  readonly editing: ScheduleSummary | null;
  readonly onCancel: () => void;
  // The last refusal, shown at the top of the form it belongs to.
  readonly error?: string | null;
  readonly onBusy: (busy: boolean) => void;
}): ReactElement {
  const { api } = useApp();
  const [name, setName] = useState(editing?.name ?? "");
  const [templateId, setTemplateId] = useState(editing?.templateId ?? "");
  const [kind, setKind] = useState<Cadence["kind"]>(editing?.cadence.kind ?? "daily");
  const [onceAt, setOnceAt] = useState(
    editing?.cadence.kind === "once" ? localScheduleTime(editing.cadence.at, editing.timezone) : "",
  );
  const [time, setTime] = useState(
    editing && editing.cadence.kind !== "once" ? editing.cadence.time : "09:00",
  );
  const [days, setDays] = useState<readonly number[]>(
    editing?.cadence.kind === "weekly" ? editing.cadence.days : [1, 3, 5],
  );
  const [timezone, setTimezone] = useState(
    () => editing?.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
  );
  const [missedPolicy, setMissedPolicy] = useState<"skip" | "run-once">(
    editing?.missedPolicy ?? "skip",
  );
  const [spendLimit, setSpendLimit] = useState(editing?.spendLimitCents?.toString() ?? "");
  const [queue, setQueue] = useState(() => initialQueue(editing?.items ?? []));
  const [topicKeyword, setTopicKeyword] = useState<string | null>(editing?.topicKeyword ?? null);
  const [fixed, setFixed] = useState<Readonly<Record<string, string>>>(editing?.values ?? {});
  const [brief, setBrief] = useState(editing?.brief ?? "");
  const [generation, setGeneration] = useState<TopicGeneration>(
    editing?.topicGeneration ?? topicGenerationOff,
  );
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const active = useRef(false);
  const attempt = useRef<ScheduleCreate | ScheduleUpdate | null>(null);

  const options =
    editing && !templates.some((row) => row.id === editing.templateId)
      ? [
          ...templates,
          { id: editing.templateId, version: editing.templateVersion, name: "Saved template" },
        ]
      : templates.map((template) =>
          editing?.templateId === template.id
            ? { ...template, version: editing.templateVersion }
            : template,
        );
  const selectedTemplate = options.find((template) => template.id === templateId);
  const template = useQuery({
    queryKey: ["project-template", templateId],
    enabled: templateId !== "",
    queryFn: async () => {
      const reply = await readProjectTemplate(api, templateId);
      if (!reply.ok) throw new Error(reply.message);
      return reply.value;
    },
  });
  const form = template.data?.document.form;
  // The stored values, plus any keyword the project title names: a template saved without a
  // value for its title's keyword still offers it here.
  const keywords = form === undefined ? [] : templateKeywords(form);
  // Until the person picks one: the keyword the project title uses, else the first.
  const chosenKeyword =
    topicKeyword !== null && keywords.includes(topicKeyword)
      ? topicKeyword
      : (keywords.find((name) => form?.title.includes(`{{${name}}}`)) ?? keywords[0] ?? null);
  const everyRun: Record<string, string> = Object.fromEntries(
    keywords
      .filter((name) => name !== chosenKeyword)
      .map((name) => [name, fixed[name] ?? form?.values[name] ?? ""]),
  );
  const context: QueueContext = {
    keywords,
    topicKeyword: chosenKeyword,
    everyRun,
    form,
    kept: editing?.items ?? [],
  };
  const topics = queueResult(queue, context);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (active.current || pending) return;
    if (!selectedTemplate && !attempt.current) {
      onError("Choose a template before saving the schedule.");
      return;
    }
    if (!attempt.current && topics.problems.length > 0) {
      onError(`Fix the topics first. ${topics.problems.slice(0, 3).join(" ")}`);
      return;
    }
    if (topics.rows.length > queueMax) {
      onError(`Keep the list to ${String(queueMax)} topics or fewer.`);
      return;
    }
    if (brief.trim().length > briefMax) {
      onError(`Keep the series brief to ${String(briefMax)} characters or fewer.`);
      return;
    }
    if (
      generation.llm !== null &&
      (generation.llm.provider === "" || generation.llm.model === "")
    ) {
      onError(
        "Pick both a provider and a model for topic generation, or choose Use the template's LLM.",
      );
      return;
    }
    if (kind === "weekly" && days.length === 0) {
      onError("Choose at least one weekday for a weekly schedule.");
      return;
    }
    active.current = true;
    setSaving(true);
    onBusy(true);
    try {
      if (!attempt.current) {
        if (!selectedTemplate) throw new Error("Choose a template before saving the schedule.");
        const selectedZone = timezone.trim();
        if (!validTimeZone(selectedZone))
          throw new Error("Enter a timezone name like Europe/Tirane or America/New_York.");
        const cadence: Cadence =
          kind === "once"
            ? { kind, at: scheduleInstant(onceAt, selectedZone) }
            : kind === "weekly"
              ? { kind, time, days }
              : { kind, time };
        const limit = spendLimit.trim() === "" ? null : Number(spendLimit);
        if (limit !== null && (!Number.isInteger(limit) || limit < 0))
          throw new Error(
            "Enter the spend limit as a whole number of cents, 0 or more (500 is $5.00), or leave it empty.",
          );
        const input: ScheduleCreate = {
          id: editing?.id ?? crypto.randomUUID(),
          name: name.trim(),
          templateId: selectedTemplate.id,
          templateVersion:
            editing?.templateId === templateId ? editing.templateVersion : selectedTemplate.version,
          cadence,
          timezone: selectedZone,
          missedPolicy,
          overlapPolicy: "skip",
          spendLimitCents: limit,
          // A topic's own values override the every-run ones for its run.
          items: topics.rows,
          topicKeyword: chosenKeyword,
          values: everyRun,
          brief: brief.trim() === "" ? null : brief.trim(),
          topicGeneration: generation,
        };
        attempt.current = editing
          ? { ...input, baseVersion: editing.version, mutationId: crypto.randomUUID() }
          : input;
      }
      const request = attempt.current;
      const { id, ...body } = request;
      const reply =
        "mutationId" in body
          ? await updateSchedule(api, id, body)
          : await createSchedule(api, request);
      if (!reply.ok) {
        attempt.current = null;
        setUncertain(false);
        onError(
          reply.reason === "conflict"
            ? `${reply.message} Your inputs are kept here. To load the latest saved version, cancel editing and press Edit again.`
            : reply.message,
        );
        return;
      }
      attempt.current = null;
      setUncertain(false);
      setName("");
      setQueue(initialQueue([]));
      onCreated();
    } catch (error) {
      setUncertain(attempt.current !== null);
      onError(error instanceof Error ? error.message : "The schedule wasn't saved. Try again.");
    } finally {
      active.current = false;
      setSaving(false);
      onBusy(attempt.current !== null);
    }
  }

  return (
    <section aria-label={editing ? "Edit schedule" : "New schedule"}>
      {error ? (
        <Callout tone="danger" title="The schedule wasn't saved." className="mb-4">
          {error}
        </Callout>
      ) : null}
      <form onSubmit={(event) => void submit(event)}>
        <fieldset
          disabled={saving || uncertain || pending}
          className="m-0 grid min-w-0 gap-4 border-0 p-0 min-[700px]:grid-cols-2"
        >
          <Field label="Name" id="schedule-name">
            <Input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Monday morning stories"
            />
          </Field>
          <Field label="Template" id="schedule-template">
            <Select
              required
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              disabled={options.length === 0}
            >
              <option value="">Choose a template</option>
              {options.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} · v{template.version}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cadence" id="schedule-cadence">
            <Select
              value={kind}
              onChange={(event) =>
                setKind(
                  event.target.value === "once"
                    ? "once"
                    : event.target.value === "weekly"
                      ? "weekly"
                      : "daily",
                )
              }
            >
              <option value="daily">Every day</option>
              <option value="weekly">Selected weekdays</option>
              <option value="once">One time</option>
            </Select>
          </Field>
          {kind === "once" ? (
            <Field label="Run at" id="schedule-once">
              <Input
                required
                type="datetime-local"
                value={onceAt}
                onChange={(event) => setOnceAt(event.target.value)}
              />
            </Field>
          ) : (
            <Field label="Local time" id="schedule-time">
              <Input
                required
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </Field>
          )}
          {kind === "weekly" ? (
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="sl-field__label mb-2">Weekdays</legend>
              <div className="flex flex-wrap gap-3">
                {dayOptions.map(([value, label]) => (
                  <label key={value} className="inline-flex items-center gap-1 text-small">
                    <input
                      type="checkbox"
                      checked={days.includes(value)}
                      onChange={(event) =>
                        setDays((current) =>
                          event.target.checked
                            ? [...current, value]
                            : current.filter((day) => day !== value),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <div />
          )}
          <div className="sl-field">
            <span className="flex items-center gap-1">
              <label className="sl-field__label" htmlFor="schedule-timezone">
                Timezone
              </label>
              <InfoTip label="Timezone">
                <p>
                  {kind === "once"
                    ? "IANA zone; the one-off instant is calculated here. Repeated clock times use the earlier occurrence; nonexistent spring-forward times are refused."
                    : "IANA zone; next run is calculated here. Repeated clock times use the earlier occurrence; nonexistent spring-forward times move forward by the gap."}
                </p>
              </InfoTip>
            </span>
            <Input
              id="schedule-timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="Europe/Tirane"
            />
          </div>
          <Field label="Missed run" id="schedule-missed">
            <Select
              value={missedPolicy}
              onChange={(event) =>
                setMissedPolicy(event.target.value === "run-once" ? "run-once" : "skip")
              }
            >
              <option value="skip">Skip if Slopify was closed</option>
              <option value="run-once">Run once when Slopify reopens</option>
            </Select>
          </Field>
          <Field label="Spend ceiling (cents, optional)" id="schedule-spend">
            <Input
              inputMode="numeric"
              value={spendLimit}
              onChange={(event) => setSpendLimit(event.target.value)}
              placeholder="1000"
            />
          </Field>
          <TopicFields
            queue={queue}
            onQueue={setQueue}
            context={context}
            onKeyword={setTopicKeyword}
            onValue={(name, value) => setFixed((current) => ({ ...current, [name]: value }))}
            loading={templateId !== "" && template.isPending}
            exportName={name}
          />
          <GenerationFields
            brief={brief}
            onBrief={setBrief}
            generation={generation}
            onGeneration={setGeneration}
            templateLlm={form?.llm}
          />
        </fieldset>
        <div className="sticky bottom-0 z-10 mt-6 flex flex-wrap gap-2 border-t border-line bg-ground py-3 max-md:bottom-[68px]">
          <Button
            type="submit"
            variant="primary"
            disabled={pending || saving || (options.length === 0 && !uncertain)}
          >
            {saving
              ? "Saving…"
              : uncertain
                ? "Retry save"
                : editing
                  ? "Save changes"
                  : "Save schedule"}
          </Button>
          <Button variant="quiet" disabled={saving || uncertain} onClick={onCancel}>
            {editing ? "Cancel editing" : "Cancel"}
          </Button>
        </div>
      </form>
    </section>
  );
}

// The series brief and whether the schedule asks an LLM for its next topics.
function GenerationFields({
  brief,
  onBrief,
  generation,
  onGeneration,
  templateLlm,
}: {
  readonly brief: string;
  readonly onBrief: (text: string) => void;
  readonly generation: TopicGeneration;
  readonly onGeneration: (next: TopicGeneration) => void;
  readonly templateLlm: { readonly provider: string; readonly model: string } | undefined;
}): ReactElement {
  const { api } = useApp();
  const providers = useQuery({ ...providersQuery(api), enabled: generation.mode !== "off" });
  const own = generation.llm;
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 border-t border-line p-0 pt-5 min-[700px]:col-span-2">
      <legend className="float-left mb-1 flex w-full items-center gap-1 text-title-3 font-semibold">
        Topic generation
        <InfoTip label="Topic generation">
          <p>
            When the queue holds fewer topics than you ask for, Slopify asks an LLM for more. It
            sends the series brief and every title this schedule and your projects already have, and
            drops any suggestion close to one of them. Queue directly adds them to the end of the
            list; Hold for approval waits for you under Topics waiting.
          </p>
        </InfoTip>
      </legend>
      <Field label="Series brief (optional)" id="schedule-brief">
        <Textarea
          rows={3}
          maxLength={briefMax}
          value={brief}
          onChange={(event) => onBrief(event.target.value)}
          placeholder="D&D lore, documentary style. Famous villains and places first."
        />
      </Field>
      <div className="grid gap-4 min-[700px]:grid-cols-2">
        <Field label="New topics" id="schedule-generation">
          <Select
            value={generation.mode}
            onChange={(event) => {
              const mode = event.target.value;
              onGeneration({
                ...generation,
                mode: mode === "queue" || mode === "hold" ? mode : "off",
              });
            }}
          >
            <option value="off">Off: I add topics myself</option>
            <option value="queue">Generate and queue directly</option>
            <option value="hold">Generate and hold for approval</option>
          </Select>
        </Field>
        {generation.mode === "off" ? null : (
          <Field label="Keep at least this many queued" id="schedule-keep">
            <Input
              type="number"
              min={1}
              max={100}
              value={String(generation.keepAtLeast)}
              onChange={(event) => {
                const value = Math.round(Number(event.target.value));
                onGeneration({
                  ...generation,
                  keepAtLeast: Number.isFinite(value) ? Math.min(100, Math.max(1, value)) : 1,
                });
              }}
            />
          </Field>
        )}
      </div>
      {generation.mode === "off" ? null : (
        <div className="flex flex-col gap-3">
          <label className="inline-flex items-center gap-2 text-small">
            <input
              type="checkbox"
              checked={own === null}
              onChange={(event) =>
                onGeneration({
                  ...generation,
                  llm: event.target.checked
                    ? null
                    : {
                        provider: templateLlm?.provider ?? "",
                        model: templateLlm?.model ?? "",
                      },
                })
              }
            />
            Use the template's LLM
            {own === null && templateLlm !== undefined && templateLlm.provider !== ""
              ? ` (${templateLlm.provider} · ${templateLlm.model})`
              : ""}
          </label>
          {own === null ? null : (
            <div className="grid gap-4 min-[700px]:grid-cols-2">
              <ProviderPicker
                label="Provider"
                family="llm"
                providers={providers.data?.providers ?? []}
                value={own.provider}
                problem={providers.error?.message}
                onPick={(provider) => onGeneration({ ...generation, llm: { provider, model: "" } })}
              />
              <ModelPicker
                label="Model"
                provider={own.provider}
                value={own.model}
                problem={undefined}
                onPick={(model) => onGeneration({ ...generation, llm: { ...own, model } })}
              />
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}
