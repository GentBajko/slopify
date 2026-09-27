import { notificationUrlProblem, testNotice } from "@app/slices/notifications/rules.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, useSyncExternalStore } from "react";
import { readNotificationUrl, saveNotificationUrl, sendTestNotification } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Field, Input } from "@/components/kit/field";
import { SectionHead } from "@/components/kit/section-head";
import { Switch } from "@/components/kit/switch";
import { useToast } from "@/components/kit/toast";
import {
  browserNotificationsOn,
  notificationPermission,
  onBrowserNotificationsChange,
  permissionProblem,
  requestNotificationPermission,
  setBrowserNotifications,
  showBrowserNotification,
} from "./browser.js";

const notificationUrlQueryKey = ["settings", "notifications"] as const;

const cantShow =
  "The test notification couldn't be shown: this browser only allows notifications from installed apps. Set a Notification URL below instead.";

// Settings → Notifications: this browser's own notifications, and the Notification URL the
// server POSTs to when no tab is open.
export function NotificationSettings() {
  return (
    <div>
      <SectionHead title="Browser and phone" info="settings.notifications" />
      <div className="flex flex-col gap-8">
        <BrowserNotifications />
        <NotificationUrl />
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
      <p className="m-0 text-small text-ink-2">Works while any Slopify tab is open.</p>
      {problem === undefined ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {problem}
        </p>
      )}
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
  return (
    <Field
      label="Notification URL"
      tip="settings.notifications.url"
      help="Works with no tab open, for example an ntfy topic on your phone."
    >
      <div className="flex flex-wrap items-center gap-2">
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
          variant="primary"
          disabled={busy || problem !== undefined || typed === undefined}
          onClick={() => save.mutate(value)}
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
      </div>
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
