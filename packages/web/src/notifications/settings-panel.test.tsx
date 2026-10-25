import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { NotificationSettings } from "./settings-panel.js";

afterEach(() => {
  cleanup();
});

describe("Settings → Notifications", () => {
  it("says under its heading when Slopify tells you and what a message holds", async () => {
    renderApp(
      <NotificationSettings />,
      testDeps({ "GET /api/settings/notifications": jsonAnswer({ url: null }) }),
    );
    expect(screen.getByRole("heading", { name: "Browser and phone" })).not.toBeNull();
    expect(
      screen.getByText(
        "When a run finishes, fails or waits for your review, Slopify sends the project's title and a link, never your keys.",
      ),
    ).not.toBeNull();
    // In words, not behind an info button beside the heading.
    expect(
      screen.queryByRole("button", { name: /^About (Browser and phone|Notifications)$/ }),
    ).toBeNull();
    await screen.findByLabelText("Notification URL");
  });

  it("names each switch for what it does, with one visible line and no info button", async () => {
    renderApp(
      <NotificationSettings />,
      testDeps({
        "GET /api/settings/notifications": jsonAnswer({ url: null }),
        "GET /api/home/autopilot/weekly": jsonAnswer({ enabled: false }),
      }),
    );
    await screen.findByLabelText("Notification URL");
    const browser = screen.getByRole("switch", { name: "Notify me in this browser" });
    expect(browser.getAttribute("aria-describedby")).not.toBeNull();
    expect(screen.getByText(/Turning it on asks the browser's permission\./)).not.toBeNull();
    expect(
      screen.getByRole("switch", { name: "Play a sound when a run starts and ends" }),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Hear the start sound" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Hear the end sound" })).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: /^About (Notify|Play a sound|Weekly)/ }),
    ).toBeNull();
  });

  it("refuses a URL that isn't http or https before anything is sent", async () => {
    const user = userEvent.setup();
    renderApp(
      <NotificationSettings />,
      testDeps({ "GET /api/settings/notifications": jsonAnswer({ url: null }) }),
    );
    const field = await screen.findByLabelText("Notification URL");
    await waitFor(() => {
      expect(field.hasAttribute("disabled")).toBe(false);
    });
    await user.type(field, "ntfy.sh/topic");
    expect(screen.getByRole("alert").textContent).toContain("full address");
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows why a test notification wasn't delivered", async () => {
    const user = userEvent.setup();
    const detail =
      "The test notification wasn't delivered: the Notification URL answered HTTP 404. Check the address in Settings → Notifications → Notification URL (for ntfy, https://ntfy.sh/your-topic), then press Send test notification again.";
    let sent: unknown;
    renderApp(
      <NotificationSettings />,
      testDeps({
        "GET /api/settings/notifications": jsonAnswer({ url: "https://ntfy.sh/slopify-runs" }),
        "POST /api/settings/notifications/test": async (request) => {
          sent = await request.json();
          return problemAnswer(detail, 502)(request);
        },
      }),
    );
    expect(await screen.findByDisplayValue("https://ntfy.sh/slopify-runs")).not.toBeNull();
    const tests = screen.getAllByRole("button", { name: "Send test notification" });
    // The browser's own test waits for the toggle; the URL's is ready.
    expect(tests[0]?.hasAttribute("disabled")).toBe(true);
    const urlTest = tests[1];
    if (urlTest === undefined) throw new Error("the Notification URL row has no test button");
    await user.click(urlTest);
    expect((await screen.findByText(detail)).getAttribute("role")).toBe("alert");
    expect(sent).toEqual({ url: "https://ntfy.sh/slopify-runs" });
  });
});

describe("Settings → Notifications save boundary", () => {
  it("says a typed URL is unsaved, saves it on Enter, and Discard puts the saved one back", async () => {
    const user = userEvent.setup();
    let sent: unknown;
    renderApp(
      <NotificationSettings />,
      testDeps({
        "GET /api/settings/notifications": jsonAnswer({ url: "https://ntfy.sh/old" }),
        "PUT /api/settings/notifications": async (request) => {
          sent = await request.json();
          return jsonAnswer({ url: "https://ntfy.sh/new" })(request);
        },
      }),
    );
    const field = await screen.findByDisplayValue("https://ntfy.sh/old");
    await user.clear(field);
    await user.type(field, "https://ntfy.sh/mine");
    expect(screen.getByText(/Unsaved changes/)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect((field as HTMLInputElement).value).toBe("https://ntfy.sh/old");
    expect(screen.queryByText(/Unsaved changes/)).toBeNull();
    await user.clear(field);
    await user.type(field, "https://ntfy.sh/new{Enter}");
    await waitFor(() => {
      expect(sent).toEqual({ url: "https://ntfy.sh/new" });
    });
  });

  it("turns the weekly report on, off by default", async () => {
    const user = userEvent.setup();
    const put: unknown[] = [];
    renderApp(
      <NotificationSettings />,
      testDeps({
        "GET /api/settings/notifications": jsonAnswer({ url: "https://ntfy.sh/slopify-runs" }),
        "GET /api/home/autopilot/weekly": jsonAnswer({ enabled: false }),
        "PUT /api/home/autopilot/weekly": async (request) => {
          const body = (await request.json()) as { enabled: boolean };
          put.push(body);
          return jsonAnswer(body)(request);
        },
      }),
    );
    const toggle = await screen.findByRole("switch", { name: "Weekly report" });
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await user.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    expect(put).toEqual([{ enabled: true }]);
  });
});
