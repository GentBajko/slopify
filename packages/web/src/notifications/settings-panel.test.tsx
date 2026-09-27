import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { NotificationSettings } from "./settings-panel.js";

afterEach(() => {
  cleanup();
});

describe("Settings → Notifications", () => {
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
