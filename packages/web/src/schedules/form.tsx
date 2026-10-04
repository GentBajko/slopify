import { type Cadence, validTimeZone } from "@app/slices/schedules/calendar.js";
import type {
  ScheduleCreate,
  ScheduleSummary,
  ScheduleUpdate,
} from "@app/slices/schedules/model.js";
import {
  briefMax,
  type ScheduleRelease,
  type TopicGeneration,
  topicGenerationOff,
} from "@app/slices/schedules/schema.js";
import { templateKeywords } from "@app/slices/schedules/topic-list.js";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, type ReactElement, useId, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Field, Input, Select, Textarea } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { limitCount } from "@/lib/limit-count";
import { keywordOrigins } from "@/play/admission";
import { ModelPicker, ProviderPicker } from "@/play/pickers";
import { providersQuery } from "@/queries";
import { readProjectTemplate } from "@/templates/api";
import { createSchedule, updateSchedule } from "./api";
import {
  centsToDollars,
  dollarsToCents,
  firstProblem,
  problemSummary,
  type ScheduleProblems,
  scheduleFieldIds,
  scheduleProblems,
  timeZoneNames,
} from "./form-checks";
import { ReleaseFields, releaseLines } from "./release-fields";
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
  // Typed in US dollars; the server stores cents.
  const [spendLimit, setSpendLimit] = useState(centsToDollars(editing?.spendLimitCents));
  const [queue, setQueue] = useState(() => initialQueue(editing?.items ?? []));
  const [topicKeyword, setTopicKeyword] = useState<string | null>(editing?.topicKeyword ?? null);
  const [fixed, setFixed] = useState<Readonly<Record<string, string>>>(editing?.values ?? {});
  const [brief, setBrief] = useState(editing?.brief ?? "");
  const [generation, setGeneration] = useState<TopicGeneration>(
    editing?.topicGeneration ?? topicGenerationOff,
  );
  const [releases, setReleases] = useState<readonly ScheduleRelease[] | null>(
    // A server from before release times sends none.
    (editing?.releases ?? []).length === 0 ? null : (editing?.releases ?? null),
  );
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  // After a Save the form's own checks refused, every field shows its problem as it is typed,
  // and the problem goes as soon as the field is fixed.
  const [tried, setTried] = useState(false);
  const zonesId = useId();
  const active = useRef(false);
  const attempt = useRef<ScheduleCreate | ScheduleUpdate | null>(null);

  // A schedule always runs its template as it is now, so each template shows its newest
  // version; only a template deleted since keeps the version the schedule last saved.
  const options =
    editing && !templates.some((row) => row.id === editing.templateId)
      ? [
          ...templates,
          { id: editing.templateId, version: editing.templateVersion, name: "Saved template" },
        ]
      : templates;
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
  const origins =
    form === undefined
      ? undefined
      : keywordOrigins({
          form,
          prompts: template.data?.document.librarySnapshot?.prompts ?? [],
          entries: template.data?.document.librarySnapshot?.entries ?? [],
        });
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
    ...(origins === undefined ? {} : { origins }),
  };
  const topics = queueResult(queue, context);
  // The days a run starts on (every day for a daily schedule), and how many shorts each makes.
  const runDays = kind === "weekly" ? days : kind === "daily" ? [0, 1, 2, 3, 4, 5, 6] : [];
  const shortCount =
    form !== undefined && form.sources.audio !== "off" && form.shorts?.enabled === true
      ? Math.max(0, Math.min(10, Number(form.shorts.count) || 0))
      : 0;

  const check = (): ScheduleProblems =>
    scheduleProblems({
      name,
      templateChosen: selectedTemplate !== undefined,
      kind,
      onceAt,
      time,
      days,
      timezone,
      spend: spendLimit,
      topicProblems: topics.problems,
      topicCount: topics.rows.length,
      brief,
      generationLlm: generation.llm,
    });
  const problems: ScheduleProblems = tried ? check() : {};

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (active.current || pending) return;
    if (!attempt.current) {
      const found = check();
      const first = firstProblem(found);
      if (first !== undefined) {
        setTried(true);
        onError(problemSummary(found));
        focusField(scheduleFieldIds[first]);
        return;
      }
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
        const limit = dollarsToCents(spendLimit);
        if (limit === undefined)
          throw new Error(
            "Enter the spend ceiling in US dollars, such as 5 or 2.50, or leave it empty.",
          );
        const input: ScheduleCreate = {
          id: editing?.id ?? crypto.randomUUID(),
          name: name.trim(),
          templateId: selectedTemplate.id,
          templateVersion: selectedTemplate.version,
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
          releases:
            releases === null || kind === "once" ? [] : releaseLines(releases, runDays, shortCount),
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
      setTried(false);
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
      {/* noValidate: the form's own checks mark each field in words and move focus to the first,
          instead of the browser's bubble on one required field at a time. */}
      <form noValidate onSubmit={(event) => void submit(event)}>
        <fieldset
          disabled={saving || uncertain || pending}
          className="m-0 grid min-w-0 gap-4 border-0 p-0 min-[700px]:grid-cols-2"
        >
          <Field label="Name" id="schedule-name" tip="planning.schedule.name" error={problems.name}>
            <Input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Monday morning stories"
            />
          </Field>
          <Field
            label="Template"
            id="schedule-template"
            tip="planning.schedule.template"
            error={problems.template}
          >
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
          <Field label="Cadence" id="schedule-cadence" tip="planning.schedule.cadence">
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
            <Field
              label="Run at"
              id="schedule-once"
              tip="planning.schedule.once-at"
              error={problems.once}
            >
              <Input
                required
                type="datetime-local"
                value={onceAt}
                onChange={(event) => setOnceAt(event.target.value)}
              />
            </Field>
          ) : (
            <Field
              label="Local time"
              id="schedule-time"
              tip="planning.schedule.time"
              error={problems.time}
            >
              <Input
                required
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </Field>
          )}
          {kind === "weekly" ? (
            <fieldset
              id="schedule-weekdays"
              className="m-0 min-w-0 border-0 p-0"
              aria-invalid={problems.weekdays !== undefined}
              aria-describedby={
                problems.weekdays === undefined ? undefined : "schedule-weekdays-error"
              }
              {...helpScope}
            >
              <legend className="sl-field__label mb-2 flex items-center gap-1">
                Weekdays
                <InfoTip id="planning.schedule.weekdays" className="-my-1" />
              </legend>
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
              {problems.weekdays === undefined ? null : (
                <p id="schedule-weekdays-error" className="sl-field__error m-0 mt-1">
                  {problems.weekdays}
                </p>
              )}
            </fieldset>
          ) : (
            <div />
          )}
          <Field
            label="Timezone"
            id="schedule-timezone"
            tip={kind === "once" ? "planning.schedule.timezone-once" : "planning.schedule.timezone"}
            help={`Start typing to pick from the list. This computer uses ${localZone}.`}
            error={problems.timezone}
          >
            <Input
              value={timezone}
              list={zonesId}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="Europe/Tirane"
            />
          </Field>
          <datalist id={zonesId}>
            {timeZoneNames().map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          <Field label="Missed run" id="schedule-missed" tip="planning.schedule.missed">
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
          <Field
            label="Spend ceiling per run (US$, optional)"
            id="schedule-spend"
            tip="planning.schedule.spend"
            tipLabel="Spend ceiling"
            help="In dollars, such as 5 or 2.50. Empty means no ceiling."
            error={problems.spend}
          >
            <Input
              inputMode="decimal"
              value={spendLimit}
              onChange={(event) => setSpendLimit(event.target.value)}
              placeholder="10.00"
            />
          </Field>
          <div id="schedule-topics" tabIndex={-1} className="min-w-0 min-[700px]:col-span-2">
            <TopicFields
              queue={queue}
              onQueue={setQueue}
              context={context}
              onKeyword={setTopicKeyword}
              onValue={(name, value) => setFixed((current) => ({ ...current, [name]: value }))}
              loading={templateId !== "" && template.isPending}
              exportName={name}
            />
            {problems.topics === undefined ? null : (
              <p className="sl-field__error m-0 mt-2">{problems.topics}</p>
            )}
          </div>
          <ReleaseFields
            releases={releases}
            onReleases={setReleases}
            runDays={runDays}
            shorts={shortCount}
            once={kind === "once"}
            timezone={timezone}
          />
          <GenerationFields
            problems={problems}
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

// Moves focus to a field the checks refused; a group (weekdays, topics) focuses its first box.
function focusField(id: string): void {
  const target = document.getElementById(id);
  if (target === null) return;
  const box =
    target instanceof HTMLFieldSetElement
      ? target.querySelector<HTMLElement>("input, select, textarea")
      : target;
  (box ?? target).focus();
  target.scrollIntoView?.({ block: "center", behavior: "smooth" });
}

const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// The series brief and whether the schedule asks an LLM for its next topics.
function GenerationFields({
  problems,
  brief,
  onBrief,
  generation,
  onGeneration,
  templateLlm,
}: {
  readonly problems: ScheduleProblems;
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
        <InfoTip id="planning.schedule.generation" />
      </legend>
      <Field
        label="Series brief (optional)"
        id="schedule-brief"
        tip="planning.schedule.brief"
        tipLabel="Series brief"
        help={limitCount(brief.length, briefMax, "characters")}
        error={problems.brief}
      >
        <Textarea
          rows={3}
          maxLength={briefMax}
          value={brief}
          onChange={(event) => onBrief(event.target.value)}
          placeholder="Ancient history, documentary style. Famous rulers and places first."
        />
      </Field>
      <div className="grid gap-4 min-[700px]:grid-cols-2">
        <Field
          label="New topics"
          id="schedule-generation"
          tip="planning.schedule.new-topics"
          error={problems.generation}
        >
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
            <option value="off">Off: add topics yourself</option>
            <option value="queue">Generate and queue directly</option>
            <option value="hold">Generate and hold for approval</option>
          </Select>
        </Field>
        {generation.mode === "off" ? null : (
          <Field
            label="Keep at least this many queued"
            id="schedule-keep"
            tip="planning.schedule.keep-count"
          >
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
        <div className="flex flex-col gap-3" {...helpScope}>
          <div className="flex items-center gap-1">
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
            <InfoTip id="planning.schedule.generation-llm" className="-my-1" />
          </div>
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
