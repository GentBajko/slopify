import type { Cadence } from "@app/slices/schedules/calendar.js";
import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PauseIcon,
  PlayIcon,
  XIcon,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { useApp } from "@/app-context";
import { RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createSchedule,
  deleteSchedule,
  readSchedule,
  scheduleAction,
  schedulesKey,
  schedulesQuery,
} from "@/schedules/api";
import { templatesQuery } from "@/templates/api";

const dayOptions = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
] as const;

export function SchedulesRoute() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const schedules = useQuery(schedulesQuery(api));
  const templates = useQuery(templatesQuery(api));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (
      job: () => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>,
    ) => job(),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: schedulesKey });
    },
  });

  const act = (
    job: () => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>,
  ) => {
    setNotice(null);
    mutation.mutate(job);
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-title font-bold tracking-[-0.01em]">
          <CalendarClockIcon aria-hidden="true" className="size-6 text-lamp-run" />
          Schedules
        </h1>
        <p className="mt-2 max-w-[70ch] text-body text-ink2">
          Run a saved template on this machine at a predictable local time. Each schedule keeps a
          durable history and creates fresh projects, so changing a template never rewrites an old
          run.
        </p>
      </div>
      <ScheduleForm
        templates={templates.data ?? []}
        pending={mutation.isPending}
        onCreated={() => {
          setNotice("Schedule saved. It will run automatically while Slopify is open.");
          setError(null);
          void queryClient.invalidateQueries({ queryKey: schedulesKey });
        }}
        onError={setError}
      />
      {templates.data?.length === 0 ? (
        <p className="text-small text-ink2">
          Save a template in{" "}
          <a className="underline" href="/templates">
            Templates
          </a>{" "}
          before creating a schedule.
        </p>
      ) : null}
      {schedules.error ? (
        <p role="alert" className="text-red">
          {schedules.error.message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-red">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-lamp-run">
          {notice}
        </p>
      ) : null}
      {schedules.data?.length === 0 ? (
        <RailGroup>
          <p className="px-4 py-6 text-ink2">
            No schedules yet. Your first one can be a one-off run or a recurring series.
          </p>
        </RailGroup>
      ) : null}
      <section className="space-y-3" aria-label="Saved schedules">
        {schedules.data?.map((schedule) => (
          <ScheduleCard
            key={schedule.id}
            schedule={schedule}
            pending={mutation.isPending}
            onAction={act}
          />
        ))}
      </section>
    </div>
  );
}

function ScheduleForm({
  templates,
  pending,
  onCreated,
  onError,
}: {
  readonly templates: readonly {
    readonly id: string;
    readonly name: string;
    readonly version: number;
  }[];
  readonly pending: boolean;
  readonly onCreated: () => void;
  readonly onError: (message: string) => void;
}) {
  const { api } = useApp();
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [kind, setKind] = useState<Cadence["kind"]>("daily");
  const [onceAt, setOnceAt] = useState("");
  const [time, setTime] = useState("09:00");
  const [days, setDays] = useState<readonly number[]>([1, 3, 5]);
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [missedPolicy, setMissedPolicy] = useState<"skip" | "run-once">("skip");
  const [spendLimit, setSpendLimit] = useState("");
  const [variants, setVariants] = useState("");

  const selectedTemplate = templates.find((template) => template.id === templateId);
  const parsedItems = useMemo(() => parseVariants(variants), [variants]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTemplate) {
      onError("Choose a template before saving the schedule.");
      return;
    }
    if (kind === "weekly" && days.length === 0) {
      onError("Choose at least one weekday for a weekly schedule.");
      return;
    }
    let cadence: Cadence;
    if (kind === "once") {
      const date = new Date(onceAt);
      if (!onceAt || Number.isNaN(date.valueOf())) {
        onError("Choose a valid date and time for the one-off run.");
        return;
      }
      cadence = { kind, at: date.toISOString() };
    } else if (kind === "weekly") {
      cadence = { kind, time, days };
    } else {
      cadence = { kind, time };
    }
    const limit = spendLimit.trim() === "" ? null : Number(spendLimit);
    if (limit !== null && (!Number.isInteger(limit) || limit < 0)) {
      onError("Spend limit must be a non-negative whole number of cents.");
      return;
    }
    const reply = await createSchedule(api, {
      name: name.trim(),
      templateId: selectedTemplate.id,
      templateVersion: selectedTemplate.version,
      cadence,
      timezone: timezone.trim(),
      missedPolicy,
      overlapPolicy: "skip",
      spendLimitCents: limit,
      items: parsedItems,
    });
    if (!reply.ok) {
      onError(reply.message);
      return;
    }
    setName("");
    setVariants("");
    onCreated();
  }

  return (
    <section
      aria-labelledby="new-schedule-heading"
      className="rounded-panel border border-line bg-panel p-4 sm:p-5"
    >
      <h2 id="new-schedule-heading" className="font-semibold">
        New schedule
      </h2>
      <p className="mt-1 text-small text-ink2">
        Schedules use the selected template version and never include uploaded media.
      </p>
      <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(event) => void submit(event)}>
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
            disabled={templates.length === 0}
          >
            <option value="">Choose a template</option>
            {templates.map((template) => (
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
            onChange={(event) => setKind(event.target.value as Cadence["kind"])}
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
          <small className="block text-ink3">IANA zone; next run is calculated in this zone.</small>
        </label>
        <label className="space-y-1" htmlFor="schedule-missed">
          <span>Missed run</span>
          <select
            id="schedule-missed"
            value={missedPolicy}
            onChange={(event) => setMissedPolicy(event.target.value as "skip" | "run-once")}
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
        <label className="space-y-1 md:col-span-2" htmlFor="schedule-variants">
          <span>Keyword variants (optional)</span>
          <textarea
            id="schedule-variants"
            value={variants}
            onChange={(event) => setVariants(event.target.value)}
            rows={3}
            className="w-full rounded-control border border-line2 bg-panel2 px-[10px] py-2 text-small"
            placeholder="One per line: Title | topic=solar,place=Lisbon"
          />
          <small className="block text-ink3">
            The base template run is always included. Add up to 49 variant lines.
          </small>
        </label>
        <div className="md:col-span-2">
          <Button type="submit" disabled={pending || templates.length === 0}>
            {pending ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function ScheduleCard({
  schedule,
  pending,
  onAction,
}: {
  readonly schedule: ScheduleSummary;
  readonly pending: boolean;
  readonly onAction: (
    job: () => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>,
  ) => void;
}) {
  const { api } = useApp();
  const [open, setOpen] = useState(false);
  const details = useQuery({
    queryKey: ["schedule", schedule.id],
    queryFn: async () => {
      const reply = await readSchedule(api, schedule.id);
      if (!reply.ok) throw new Error(reply.message);
      return reply.value;
    },
    enabled: open,
  });
  const cadence =
    schedule.cadence.kind === "once"
      ? "One time"
      : schedule.cadence.kind === "daily"
        ? `Daily at ${schedule.cadence.time}`
        : `Weekly at ${schedule.cadence.time}`;
  return (
    <article className="rounded-panel border border-line bg-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words font-semibold">{schedule.name}</h2>
          <p className="text-small text-ink2">
            {cadence} · {schedule.timezone} · {schedule.items.length} variant
            {schedule.items.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-small text-ink3">
            {schedule.nextRunAt === null
              ? "No future run"
              : `Next: ${formatDate(schedule.nextRunAt)}`}{" "}
            · <span className="capitalize">{schedule.status}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {schedule.status === "active" ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                onAction(() => scheduleAction(api, schedule.id, "pause", schedule.version))
              }
            >
              <PauseIcon aria-hidden="true" className="size-4" />
              Pause
            </Button>
          ) : null}
          {schedule.status === "paused" ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                onAction(() => scheduleAction(api, schedule.id, "resume", schedule.version))
              }
            >
              <PlayIcon aria-hidden="true" className="size-4" />
              Resume
            </Button>
          ) : null}
          {schedule.status === "active" || schedule.status === "paused" ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                onAction(() => scheduleAction(api, schedule.id, "cancel", schedule.version))
              }
            >
              <XIcon aria-hidden="true" className="size-4" />
              Cancel
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            {open ? (
              <ChevronUpIcon aria-hidden="true" className="size-4" />
            ) : (
              <ChevronDownIcon aria-hidden="true" className="size-4" />
            )}
            History
          </Button>
          {schedule.status === "canceled" || schedule.status === "completed" ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => onAction(() => deleteSchedule(api, schedule.id, schedule.version))}
            >
              Delete
            </Button>
          ) : null}
        </div>
      </div>
      {open ? (
        <div className="mt-4 border-t border-line pt-3">
          {details.isPending ? (
            <p className="text-small text-ink3">Loading history…</p>
          ) : details.error ? (
            <p className="text-small text-red">{details.error.message}</p>
          ) : details.data?.runs.length === 0 ? (
            <p className="text-small text-ink3">No runs yet.</p>
          ) : (
            <ul className="space-y-2">
              {details.data?.runs.map((run) => (
                <li key={run.id} className="flex flex-wrap justify-between gap-2 text-small">
                  <span className="capitalize">
                    {run.status} · {formatDate(run.scheduledFor)}
                  </span>
                  <span className="text-ink3">
                    {run.error ??
                      `${run.projectIds.length} project${run.projectIds.length === 1 ? "" : "s"}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </article>
  );
}

function parseVariants(
  raw: string,
): readonly { readonly title: string; readonly values: Readonly<Record<string, string>> }[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 49)
    .flatMap((line) => {
      const [titlePart, valuesPart = ""] = line.split("|", 2);
      const title = titlePart?.trim() ?? "";
      if (!title) return [];
      const values: Record<string, string> = {};
      for (const pair of valuesPart.split(",")) {
        const [key, ...rest] = pair.split("=");
        if (key?.trim() && rest.length) values[key.trim()] = rest.join("=").trim();
      }
      return [{ title, values }];
    });
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
