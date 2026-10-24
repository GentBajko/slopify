import { notificationUrlProblem, testNotice } from "@app/slices/notifications/address.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, useSyncExternalStore } from "react";
import { readNotificationUrl, saveNotificationUrl, sendTestNotification } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Field, Input } from "@/components/kit/field";
import { SectionHead } from "@/components/kit/section-head";
import { Switch } from "@/components/kit/switch";
import { useToast } from "@/components/kit/toast";
import { UnsavedStatus } from "@/components/save-state";
import { autopilotKey, readWeeklyReport, setWeeklyReport, weeklyReportKey } from "@/home/api";
import {
  browserNotificationsOn,
  notificationPermission,
  onBrowserNotificationsChange,
  permissionProblem,
  requestNotificationPermission,
  setBrowserNotifications,
  showBrowserNotification,
} from "./browser.js";
import { onRunSoundsChange, playRunSound, runSoundsOn, setRunSounds } from "./sounds.js";

const notificationUrlQueryKey = ["settings", "notifications"] as const;

const cantShow =
  "The test notification couldn't be shown: this browser only allows notifications from installed apps. Set a Notification URL below instead.";

// Settings → Notifications: this browser's own notifications, and the Notification URL the
// server POSTs to when no tab is open. The line under the heading says when Slopify tells you
// and what a message holds; each switch says what it needs under it.
export function NotificationSettings() {
  return (
    <div>
      <SectionHead
        title="Browser and phone"
        meta="When a run finishes, fails or waits for your review, Slopify sends its title and a link, never your keys."
      />
      <div className="flex flex-col gap-8">
        <BrowserNotifications />
        <RunSounds />
        <NotificationUrl />
        <WeeklyReport />
      </div>
    </div>
  );
}

function BrowserNotifications() {
  const on = useSyncExternalStore(
    onBrowserNotificationsChange,
    browserNotificationsOn,
    () => false,
  );
  const [permission, setPermission] = useState(notificationPermission);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [asking, setAsking] = useState(false);
  const notify = useToast();
  const active = on && permission === "granted";

  async function turn(next: boolean): Promise<void> {
    setProblem(undefined);
    if (!next) {
      setBrowserNotifications(false);
      return;
    }
    setAsking(true);
    try {
      const answer = await requestNotificationPermission();
      setPermission(answer);
      const refused = permissionProblem(answer);
      if (answer === "granted") {
        setBrowserNotifications(true);
        if (!browserNotificationsOn())
          setProblem(
            "Browser notifications couldn't be turned on because this browser blocks site storage for Slopify. Allow site data for this address in your browser's settings, then turn Browser notifications on again.",
          );
      } else
        setProblem(
          refused ??
            "Browser notifications weren't turned on because the permission prompt was dismissed. Turn Browser notifications on again and choose Allow.",
        );
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Switch
          label="Browser notifications"
          tip="settings.notifications.browser"
          checked={active}
          disabled={asking}
          onChange={(next) => void turn(next)}
        />
        <Button
          variant="quiet"
          disabled={!active}
          disabledReason="Turn Browser notifications on first."
          onClick={() => {
            setProblem(undefined);
            try {
              showBrowserNotification({ projectId: "test", text: testNotice }, () => {});
              notify("Test notification sent to this browser.", "success");
            } catch {
              setProblem(cantShow);
            }
          }}
        >
          Send test notification
        </Button>
      </div>
      <p className="m-0 text-small text-ink-2">
        Works while any Slopify tab is open. The switch applies in this browser at once.
      </p>
      {problem === undefined ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}

// A chime when a run starts and another when it ends, in this browser. Needs a Slopify tab
// open, like browser notifications, but not their permission.
function RunSounds() {
  const on = useSyncExternalStore(onRunSoundsChange, runSoundsOn, () => true);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Switch
          label="Run sounds"
          tip="settings.notifications.sounds"
          checked={on}
          onChange={setRunSounds}
        />
        <Button variant="quiet" onClick={() => playRunSound("start")}>
          Play start
        </Button>
        <Button variant="quiet" onClick={() => playRunSound("end")}>
          Play end
        </Button>
      </div>
      <p className="m-0 text-small text-ink-2">
        A chime when a run starts and a different one when it finishes, fails or waits for you.
        Works while any Slopify tab is open; set your computer's volume for how loud. The switch
        applies in this browser at once.
      </p>
    </div>
  );
}

function NotificationUrl() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const errorId = useId();
  const saved = useQuery({
    queryKey: notificationUrlQueryKey,
    queryFn: () => readNotificationUrl(api),
  });
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const value = typed ?? saved.data?.url ?? "";
  const problem = notificationUrlProblem(value);

  const save = useMutation({
    mutationFn: (url: string) => saveNotificationUrl(api, url),
    onSuccess: (body) => {
      queryClient.setQueryData(notificationUrlQueryKey, body);
      setTyped(undefined);
      notify(
        body.url === null ? "Notification URL removed." : "Notification URL saved.",
        "success",
      );
    },
  });
  const test = useMutation({
    mutationFn: (url: string) => sendTestNotification(api, url),
    onSuccess: () => {
      notify(
        "Test notification sent. Check the app or page behind your Notification URL.",
        "success",
      );
    },
  });

  const error = problem ?? save.error?.message ?? test.error?.message;
  const busy = save.isPending || test.isPending || saved.data === undefined;
  const dirty = typed !== undefined && typed !== (saved.data?.url ?? "");
  return (
    <Field
      label="Notification URL"
      tip="settings.notifications.url"
      help="Works with no tab open, for example an ntfy topic on your phone. Saved only when you press Save."
    >
      {/* A form so Enter in the box saves, as Save does. */}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && problem === undefined && dirty) save.mutate(value);
        }}
      >
        <Input
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://ntfy.sh/your-topic"
          className="min-w-0 flex-1 basis-[220px]"
          value={value}
          disabled={saved.data === undefined}
          aria-invalid={problem !== undefined}
          aria-describedby={error === undefined ? undefined : errorId}
          onChange={(event) => {
            save.reset();
            test.reset();
            setTyped(event.target.value);
          }}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={busy || problem !== undefined || !dirty}
          disabledReason="Type a new address first, or fix the one shown."
        >
          Save
        </Button>
        <Button
          variant="quiet"
          disabled={busy || problem !== undefined || value.trim() === ""}
          onClick={() => test.mutate(value)}
        >
          Send test notification
        </Button>
      </form>
      <UnsavedStatus
        dirty={dirty}
        onDiscard={() => {
          save.reset();
          test.reset();
          setTyped(undefined);
        }}
      />
      {saved.error === null ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          The saved Notification URL couldn't be read: {saved.error.message}
        </p>
      )}
      {error === undefined ? null : (
        <p id={errorId} role="alert" className="m-0 text-small text-danger">
          {error}
        </p>
      )}
    </Field>
  );
}

// Last week's report (made, failed, cost) sent to the Notification URL each Monday. Off by
// default; it applies at once, like the switches above.
function WeeklyReport() {
  const { api } = useApp();
  const client = useQueryClient();
  const current = useQuery({ queryKey: weeklyReportKey, queryFn: () => readWeeklyReport(api) });
  const save = useMutation({
    mutationFn: (enabled: boolean) => setWeeklyReport(api, enabled),
    onSuccess: async (saved) => {
      client.setQueryData(weeklyReportKey, saved);
      await client.invalidateQueries({ queryKey: autopilotKey });
    },
  });
  return (
    <div className="flex flex-col gap-2">
      <Switch
        label="Weekly report"
        tip="settings.notifications.weekly"
        checked={current.data?.enabled === true}
        disabled={current.data === undefined || save.isPending}
        onChange={(next) => save.mutate(next)}
      />
      <p className="m-0 text-small text-ink-2">
        Each Monday from 09:00, what was made, what failed and what it cost last week go to the
        Notification URL above.
      </p>
      {current.error === null ? null : (
        <p className="m-0 text-small text-danger">
          {`The Weekly report setting didn't load: ${current.error.message}. Reload the page to try again.`}
        </p>
      )}
      {save.error === null ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {`Weekly report wasn't changed: ${save.error.message}. Try the switch again.`}
        </p>
      )}
    </div>
  );
}
