import { type Cadence, validTimeZone } from "@app/slices/schedules/calendar.js";
import type {
  ScheduleCreate,
  ScheduleSummary,
  ScheduleUpdate,
} from "@app/slices/schedules/model.js";
import { type FormEvent, type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [variants, setVariants] = useState<readonly EditableVariant[]>(() =>
    (editing?.items ?? []).map((item) => ({
      id: crypto.randomUUID(),
      title: item.title,
      values: Object.entries(item.values).map(([name, value]) => ({
        id: crypto.randomUUID(),
        name,
        value,
      })),
    })),
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

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (active.current || pending) return;
    if (!selectedTemplate && !attempt.current) {
      onError("Choose a template before saving the schedule.");
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
          throw new Error("Choose a valid IANA timezone, such as Europe/Tirane.");
        const cadence: Cadence =
          kind === "once"
            ? { kind, at: scheduleInstant(onceAt, selectedZone) }
            : kind === "weekly"
              ? { kind, time, days }
              : { kind, time };
        const limit = spendLimit.trim() === "" ? null : Number(spendLimit);
        if (limit !== null && (!Number.isInteger(limit) || limit < 0))
          throw new Error("Spend limit must be a non-negative whole number of cents.");
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
          items: variantInputs(variants),
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
            ? `${reply.message} Your inputs are kept. Cancel editing and reopen Edit to load the latest saved version.`
            : reply.message,
        );
        return;
      }
      attempt.current = null;
      setUncertain(false);
      setName("");
      setVariants([]);
      onCreated();
    } catch (error) {
      setUncertain(attempt.current !== null);
      onError(error instanceof Error ? error.message : "Could not save the schedule. Try again.");
    } finally {
      active.current = false;
      setSaving(false);
      onBusy(attempt.current !== null);
    }
  }

  return (
    <section
      aria-labelledby="new-schedule-heading"
      className="rounded-panel border border-line bg-panel p-4 sm:p-5"
    >
      <h2 id="new-schedule-heading" className="font-semibold">
        {editing ? "Edit schedule" : "New schedule"}
      </h2>
      <p className="mt-1 text-small text-ink2">
        Schedules use the selected template version and never include uploaded media.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset
          disabled={saving || uncertain || pending}
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
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
          <label className="space-y-1" htmlFor="schedule-timezone">
            <span>Timezone</span>
            <Input
              id="schedule-timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="Europe/Tirane"
            />
            <small className="block text-ink3">
              {kind === "once"
                ? "IANA zone; the one-off instant is calculated here. Repeated clock times use the earlier occurrence; nonexistent spring-forward times are refused."
                : "IANA zone; next run is calculated here. Repeated clock times use the earlier occurrence; nonexistent spring-forward times move forward by the gap."}
            </small>
          </label>
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
          <VariantFields variants={variants} onChange={setVariants} />
        </fieldset>
        <div className="mt-4 flex gap-2">
          <Button
            type="submit"
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
          {editing ? (
            <Button type="button" disabled={saving || uncertain} onClick={onCancel}>
              Cancel editing
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

interface EditableVariant {
  readonly id: string;
  readonly title: string;
  readonly values: readonly {
    readonly id: string;
    readonly name: string;
    readonly value: string;
  }[];
}

function variantInputs(variants: readonly EditableVariant[]): ScheduleCreate["items"] {
  return variants.map((variant) => {
    const names = variant.values.map((value) => value.name.trim());
    if (names.some((name) => !name) || new Set(names).size !== names.length)
      throw new Error("Each variant needs non-empty, unique keyword names.");
    return {
      title: variant.title,
      values: Object.fromEntries(variant.values.map(({ name, value }) => [name.trim(), value])),
    };
  });
}

function VariantFields({
  variants,
  onChange,
}: {
  readonly variants: readonly EditableVariant[];
  readonly onChange: (variants: readonly EditableVariant[]) => void;
}): ReactElement {
  const replace = (next: EditableVariant) =>
    onChange(variants.map((variant) => (variant.id === next.id ? next : variant)));
  const textClass =
    "min-h-10 w-full rounded-control border border-line2 bg-panel2 px-[10px] py-2 text-small";
  return (
    <fieldset className="space-y-3 md:col-span-2">
      <legend>Keyword variants (optional)</legend>
      <p className="text-small text-ink3">
        The base template run is always included. Add up to 49 variants.
      </p>
      {variants.map((variant, index) => (
        <fieldset key={variant.id} className="space-y-3 rounded-control border border-line p-3">
          <legend>Variant {index + 1}</legend>
          <label className="block space-y-1">
            <span>Variant {index + 1} title</span>
            <textarea
              required
              maxLength={200}
              rows={1}
              className={textClass}
              value={variant.title}
              onChange={(event) => replace({ ...variant, title: event.target.value })}
            />
          </label>
          {variant.values.map((keyword, keywordIndex) => (
            <div key={keyword.id} className="grid gap-2 sm:grid-cols-2">
              <label className="block space-y-1">
                <span>
                  Variant {index + 1} keyword {keywordIndex + 1} name
                </span>
                <textarea
                  required
                  maxLength={200}
                  rows={1}
                  className={textClass}
                  value={keyword.name}
                  onChange={(event) =>
                    replace({
                      ...variant,
                      values: variant.values.map((value) =>
                        value.id === keyword.id ? { ...value, name: event.target.value } : value,
                      ),
                    })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span>
                  Variant {index + 1} keyword {keywordIndex + 1} value
                </span>
                <textarea
                  maxLength={10000}
                  rows={2}
                  className={textClass}
                  value={keyword.value}
                  onChange={(event) =>
                    replace({
                      ...variant,
                      values: variant.values.map((value) =>
                        value.id === keyword.id ? { ...value, value: event.target.value } : value,
                      ),
                    })
                  }
                />
              </label>
              <Button
                type="button"
                className="min-h-10"
                onClick={() =>
                  replace({
                    ...variant,
                    values: variant.values.filter((value) => value.id !== keyword.id),
                  })
                }
              >
                Remove keyword {keywordIndex + 1} from variant {index + 1}
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-10"
              onClick={() =>
                replace({
                  ...variant,
                  values: [...variant.values, { id: crypto.randomUUID(), name: "", value: "" }],
                })
              }
            >
              Add keyword to variant {index + 1}
            </Button>
            <Button
              type="button"
              className="min-h-10"
              onClick={() => onChange(variants.filter((value) => value.id !== variant.id))}
            >
              Remove variant {index + 1}
            </Button>
          </div>
        </fieldset>
      ))}
      <Button
        type="button"
        className="min-h-10"
        disabled={variants.length >= 49}
        onClick={() => onChange([...variants, { id: crypto.randomUUID(), title: "", values: [] }])}
      >
        Add variant
      </Button>
    </fieldset>
  );
}
