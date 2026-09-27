import { notificationUrlProblem, testNotice } from "@app/slices/notifications/rules.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, useSyncExternalStore } from "react";
import { readNotificationUrl, saveNotificationUrl, sendTestNotification } from "@/api";
import { useApp } from "@/app-context";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
      <SectionHead
        title="Notifications"
        info="Slopify tells you when a run finishes, fails, or stops to wait for your review or Resume. Browser notifications work while any Slopify tab is open. A Notification URL works with no tab open: Slopify POSTs a short plain-text message (the project title and what happened, never your keys) to it. For your phone, install the ntfy app, subscribe to a topic with a long random name, and paste https://ntfy.sh/that-topic here. Any address that accepts a POST works too."
      />
      <RailGroup>
        <BrowserNotifications />
        <NotificationUrl />
      </RailGroup>
    </div>
  );
}

function BrowserNotifications() {
  const labelId = useId();
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
    <div className="grid items-center gap-[14px] border-b border-line px-4 py-[14px] sm:grid-cols-[240px_1fr]">
      <span id={labelId} className="font-semibold">
        Browser notifications
      </span>
      <div className="flex flex-wrap items-center gap-[10px]">
        <ToggleGroup
          type="single"
          value={active ? "on" : "off"}
          aria-labelledby={labelId}
          disabled={asking}
          onValueChange={(next) => {
            if (next === "on" || next === "off") void turn(next === "on");
          }}
        >
          <ToggleGroupItem value="off">Off</ToggleGroupItem>
          <ToggleGroupItem value="on">On</ToggleGroupItem>
        </ToggleGroup>
        <Button
          type="button"
          variant="ghost"
          disabled={!active}
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
        {problem === undefined ? null : (
          <p role="alert" className="basis-full text-label text-red">
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}

function NotificationUrl() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const inputId = useId();
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
    <div className="grid items-center gap-[14px] px-4 py-[14px] sm:grid-cols-[240px_1fr]">
      <label htmlFor={inputId} className="font-semibold">
        Notification URL
      </label>
      <div className="flex flex-wrap items-center gap-[10px]">
        <Input
          id={inputId}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://ntfy.sh/your-topic"
          className="min-w-[220px] flex-1"
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
          type="button"
          disabled={busy || problem !== undefined || typed === undefined}
          onClick={() => save.mutate(value)}
        >
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || problem !== undefined || value.trim() === ""}
          onClick={() => test.mutate(value)}
        >
          Send test notification
        </Button>
        {saved.error === null ? null : (
          <p role="alert" className="basis-full text-label text-red">
            The saved Notification URL couldn't be read: {saved.error.message}
          </p>
        )}
        {error === undefined ? null : (
          <p id={errorId} role="alert" className="basis-full text-label text-red">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
