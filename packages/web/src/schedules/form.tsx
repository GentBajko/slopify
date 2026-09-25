import { render } from "@app/slices/admission/substitute.js";
import { type Cadence, validTimeZone } from "@app/slices/schedules/calendar.js";
import type {
  ScheduleCreate,
  ScheduleSummary,
  ScheduleUpdate,
} from "@app/slices/schedules/model.js";
import { queueMax } from "@app/slices/schedules/schema.js";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { InfoTip } from "@/components/kit/info-tip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readProjectTemplate } from "@/templates/api";
import { createSchedule, updateSchedule } from "./api";
import { localScheduleTime, scheduleInstant } from "./time";

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
  const [topics, setTopics] = useState(() =>
    (editing?.items ?? []).map((item) => item.title).join("\n"),
  );
  const [topicKeyword, setTopicKeyword] = useState<string | null>(editing?.topicKeyword ?? null);
  const [fixed, setFixed] = useState<Readonly<Record<string, string>>>(editing?.values ?? {});
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
  const keywords = form === undefined ? [] : Object.keys(form.values);
  // Until the person picks one: the keyword the project title uses, else the first.
  const chosenKeyword =
    topicKeyword !== null && keywords.includes(topicKeyword)
      ? topicKeyword
      : (keywords.find((name) => form?.title.includes(`{{${name}}}`)) ?? keywords[0] ?? null);
  const queue = topicLines(topics);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (active.current || pending) return;
    if (!selectedTemplate && !attempt.current) {
      onError("Choose a template before saving the schedule.");
      return;
    }
    if (queue.length > queueMax) {
      onError(`Keep the list to ${String(queueMax)} topics or fewer.`);
      return;
    }
    if (queue.some((line) => line.length > 200)) {
      onError("Each topic can be at most 200 characters.");
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
          items: queue.map((title) => ({
            title,
            // A topic kept from an older schedule keeps the values it was saved with.
            values: editing?.items.find((item) => item.title === title)?.values ?? {},
          })),
          topicKeyword: chosenKeyword,
          values: Object.fromEntries(
            keywords
              .filter((name) => name !== chosenKeyword)
              .map((name) => [name, fixed[name] ?? form?.values[name] ?? ""]),
          ),
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
      setTopics("");
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
        <p role="alert" className="mb-3 text-small text-red">
          {error}
        </p>
      ) : null}
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={saving || uncertain || pending} className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1" htmlFor="schedule-name">
            <span>Name</span>
            <Input
              id="schedule-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Monday morning stories"
            />
          </label>
          <label className="space-y-1" htmlFor="schedule-template">
            <span>Template</span>
            <select
              id="schedule-template"
              required
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className="h-8 w-full rounded-control border border-line2 bg-panel2 px-2 text-small"
              disabled={options.length === 0}
            >
              <option value="">Choose a template</option>
              {options.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} · v{template.version}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1" htmlFor="schedule-cadence">
            <span>Cadence</span>
            <select
              id="schedule-cadence"
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
              className="h-8 w-full rounded-control border border-line2 bg-panel2 px-2 text-small"
            >
              <option value="daily">Every day</option>
              <option value="weekly">Selected weekdays</option>
              <option value="once">One time</option>
            </select>
          </label>
          {kind === "once" ? (
            <label className="space-y-1" htmlFor="schedule-once">
              <span>Run at</span>
              <Input
                id="schedule-once"
                required
                type="datetime-local"
                value={onceAt}
                onChange={(event) => setOnceAt(event.target.value)}
              />
            </label>
          ) : (
            <label className="space-y-1" htmlFor="schedule-time">
              <span>Local time</span>
              <Input
                id="schedule-time"
                required
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </label>
          )}
          {kind === "weekly" ? (
            <fieldset className="space-y-2">
              <legend>Weekdays</legend>
              <div className="flex flex-wrap gap-2">
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
          <div className="space-y-1">
            <span className="flex items-center gap-1">
              <label htmlFor="schedule-timezone">Timezone</label>
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
          <label className="space-y-1" htmlFor="schedule-missed">
            <span>Missed run</span>
            <select
              id="schedule-missed"
              value={missedPolicy}
              onChange={(event) =>
                setMissedPolicy(event.target.value === "run-once" ? "run-once" : "skip")
              }
              className="h-8 w-full rounded-control border border-line2 bg-panel2 px-2 text-small"
            >
              <option value="skip">Skip if Slopify was closed</option>
              <option value="run-once">Run once when Slopify reopens</option>
            </select>
          </label>
          <label className="space-y-1" htmlFor="schedule-spend">
            <span>Spend ceiling (cents, optional)</span>
            <Input
              id="schedule-spend"
              inputMode="numeric"
              value={spendLimit}
              onChange={(event) => setSpendLimit(event.target.value)}
              placeholder="1000"
            />
          </label>
          <TopicFields
            topics={topics}
            onTopics={setTopics}
            queue={queue}
            keywords={keywords}
            keyword={chosenKeyword}
            onKeyword={setTopicKeyword}
            values={Object.fromEntries(
              keywords.map((name) => [name, fixed[name] ?? form?.values[name] ?? ""]),
            )}
            onValue={(name, value) => setFixed((current) => ({ ...current, [name]: value }))}
            title={form?.title}
            loading={templateId !== "" && template.isPending}
          />
        </fieldset>
        <div className="sticky bottom-[-16px] -mx-4 mt-4 flex gap-2 border-t border-line bg-panel px-4 py-3">
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
          <Button type="button" disabled={saving || uncertain} onClick={onCancel}>
            {editing ? "Cancel editing" : "Cancel"}
          </Button>
        </div>
      </form>
    </section>
  );
}

// One topic per line; blank lines and surrounding spaces do not count.
function topicLines(text: string): readonly string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function TopicFields({
  topics,
  onTopics,
  queue,
  keywords,
  keyword,
  onKeyword,
  values,
  onValue,
  title,
  loading,
}: {
  readonly topics: string;
  readonly onTopics: (text: string) => void;
  readonly queue: readonly string[];
  readonly keywords: readonly string[];
  readonly keyword: string | null;
  readonly onKeyword: (name: string) => void;
  readonly values: Readonly<Record<string, string>>;
  readonly onValue: (name: string, value: string) => void;
  readonly title: string | undefined;
  readonly loading: boolean;
}): ReactElement {
  const fieldClass =
    "min-h-8 w-full rounded-control border border-line2 bg-panel2 px-[10px] py-[5px] text-small";
  const next = queue[0];
  const preview =
    title === undefined
      ? undefined
      : render(title, {
          ...values,
          ...(keyword !== null && next !== undefined ? { [keyword]: next } : {}),
        });
  const titleUsesTopic = keyword !== null && title?.includes(`{{${keyword}}}`) === true;
  return (
    <fieldset className="space-y-3 sm:col-span-2">
      <legend className="flex items-center gap-1">
        Topics (optional)
        <InfoTip label="Topics">
          <p>
            One topic per line. Each run starts one project with the first topic and removes it from
            the list; the schedule completes when the list is empty. With no topics, every run uses
            the template as saved.
          </p>
        </InfoTip>
      </legend>
      <label className="block space-y-1" htmlFor="schedule-topics">
        <span className="text-small text-ink2">
          {queue.length === 0
            ? "One per line"
            : `${String(queue.length)} ${queue.length === 1 ? "topic" : "topics"} · next: ${next ?? ""}`}
        </span>
        <textarea
          id="schedule-topics"
          rows={6}
          className={fieldClass}
          value={topics}
          onChange={(event) => onTopics(event.target.value)}
          placeholder={"Owlbears\nGelatinous Cubes\nMimics"}
        />
      </label>
      {loading ? (
        <p className="text-small text-ink3">Reading the template's keywords…</p>
      ) : keywords.length === 0 ? (
        <p className="text-small text-ink3">
          This template has no keywords such as {"{{Topic}}"}, so each topic becomes the project's
          title.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1" htmlFor="schedule-topic-keyword">
            <span className="text-small text-ink2">Each topic fills</span>
            <select
              id="schedule-topic-keyword"
              value={keyword ?? ""}
              onChange={(event) => onKeyword(event.target.value)}
              className="h-8 w-full rounded-control border border-line2 bg-panel2 px-2 text-small"
            >
              {keywords.map((name) => (
                <option key={name} value={name}>
                  {`{{${name}}}`}
                </option>
              ))}
            </select>
          </label>
          {keywords
            .filter((name) => name !== keyword)
            .map((name) => (
              <label key={name} className="block space-y-1">
                <span className="text-small text-ink2">{name} (every run)</span>
                <input
                  maxLength={10000}
                  aria-label={`${name} for every run`}
                  className={fieldClass}
                  value={values[name] ?? ""}
                  onChange={(event) => onValue(name, event.target.value)}
                />
              </label>
            ))}
        </div>
      )}
      {preview !== undefined && next !== undefined ? (
        <p className="text-small text-ink2">
          Next project: <span className="font-semibold text-ink">{preview}</span>
          {titleUsesTopic ? null : (
            <span className="block text-ink3">
              The template's project title does not use {`{{${keyword ?? "keyword"}}}`}, so every
              project gets this title. Edit the template's title to include it.
            </span>
          )}
        </p>
      ) : null}
    </fieldset>
  );
}
