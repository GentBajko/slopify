import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, renderRouted, testDeps } from "@/test-app";
import type { AutostartView } from "./api";
import { AutostartReminder } from "./autostart-reminder";
import { AutostartOffer, AutostartSettings } from "./autostart-settings";

afterEach(cleanup);

const native = (enabled: boolean, offer = false): AutostartView => ({
  kind: "native",
  available: true,
  enabled,
  summary: enabled
    ? "Slopify starts quietly when you log in to this computer, without opening a browser tab."
    : "Slopify starts only when you start it.",
  where: "/home/ann/.config/autostart/slopify.desktop",
  howTo: null,
  checkedAt: null,
  offer,
});

it("turns starting at login on and shows the login entry", async () => {
  let sent: unknown;
  renderApp(
    <AutostartSettings />,
    testDeps({
      "GET /api/settings/autostart": jsonAnswer(native(false)),
      "PUT /api/settings/autostart": async (request) => {
        sent = await request.json();
        return jsonAnswer(native(true))(request);
      },
    }),
  );
  const toggle = await screen.findByRole("switch", { name: "Start Slopify when I log in" });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  // Off, the switch and its help say it all: no heading and no "starts only when you start it".
  expect(screen.queryByText("Slopify starts only when you start it.")).toBeNull();
  expect(screen.queryByRole("heading", { name: "Start at login" })).toBeNull();
  await userEvent.click(toggle);
  await waitFor(() => expect(sent).toEqual({ enabled: true }));
  expect(
    await screen.findByText(/Login entry: \/home\/ann\/\.config\/autostart\/slopify\.desktop/u),
  ).not.toBeNull();
  expect(toggle.getAttribute("aria-checked")).toBe("true");
});

it("shows the server's sentence when it can't be turned on", async () => {
  renderApp(
    <AutostartSettings />,
    testDeps({
      "GET /api/settings/autostart": jsonAnswer(native(false)),
      "PUT /api/settings/autostart": problemAnswer(
        "Slopify couldn't add its login entry: writing /home/ann/.config/autostart failed.",
        409,
      ),
    }),
  );
  await userEvent.click(await screen.findByRole("switch", { name: "Start Slopify when I log in" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't add its login entry/u);
});

it("in Docker, says whether Docker starts at login and where to change it", async () => {
  renderApp(
    <AutostartSettings />,
    testDeps({
      "GET /api/settings/autostart": jsonAnswer({
        kind: "docker",
        available: false,
        enabled: null,
        summary: "Slopify runs in Docker and starts whenever Docker starts.",
        where: null,
        howTo:
          "With Docker Desktop: Docker Desktop → Settings → General → Start Docker Desktop when you sign in.",
        checkedAt: null,
        offer: false,
      } satisfies AutostartView),
    }),
  );
  expect(await screen.findByText("Starts with Docker: unknown")).not.toBeNull();
  expect(screen.getByText(/Start Docker Desktop when you sign in/u)).not.toBeNull();
  expect(screen.queryByRole("switch")).toBeNull();
});

it("offers it once on the first-run screen, and No thanks ends the offer", async () => {
  let answered = false;
  renderApp(
    <AutostartOffer />,
    testDeps({
      "GET /api/settings/autostart": jsonAnswer(native(false, true)),
      "POST /api/settings/autostart/answer": (request) => {
        answered = true;
        return jsonAnswer(native(false, false))(request);
      },
    }),
  );
  await userEvent.click(await screen.findByRole("button", { name: "No thanks" }));
  await waitFor(() => expect(answered).toBe(true));
  await waitFor(() => expect(screen.queryByRole("button", { name: "No thanks" })).toBeNull());
});

it("asks nothing on the first-run screen in Docker, where there is nothing to switch", async () => {
  renderApp(
    <AutostartOffer />,
    testDeps({
      "GET /api/settings/autostart": jsonAnswer({
        kind: "docker",
        available: false,
        enabled: false,
        summary:
          "Slopify runs in Docker Desktop, and Docker Desktop doesn't start when you sign in, so Slopify doesn't either.",
        where: null,
        howTo:
          "Turn on Docker Desktop → Settings → General → Start Docker Desktop when you sign in to your computer.",
        checkedAt: "2026-09-27T10:00:00.000Z",
        offer: false,
      } satisfies AutostartView),
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.queryByText(/Start Slopify when you log in/u)).toBeNull();
  expect(screen.queryByRole("button", { name: "Start when I log in" })).toBeNull();
});

it("asks in one line on the first-run screen, with nothing in lime", async () => {
  renderApp(
    <AutostartOffer />,
    testDeps({ "GET /api/settings/autostart": jsonAnswer(native(false, true)) }),
  );
  const yes = await screen.findByRole("button", { name: "Start when I log in" });
  expect(screen.getByRole("region", { name: "Start Slopify when you log in?" })).not.toBeNull();
  expect(yes.className).not.toContain("sl-btn--primary");
  expect(screen.getByRole("button", { name: "No thanks" }).className).not.toContain(
    "sl-btn--primary",
  );
});

describe("the reminder for someone who updated", () => {
  const settled = {
    "GET /api/telemetry/notice": jsonAnswer({ seen: true, appVersion: "3.0.1" }),
    "GET /api/onboarding": jsonAnswer({ show: false, settle: false }),
  };

  it("starts on No thanks, since the other answer changes the computer", async () => {
    renderRouted(
      <AutostartReminder />,
      testDeps({ ...settled, "GET /api/settings/autostart": jsonAnswer(native(false, true)) }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Start Slopify when you log in?" });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialog).getByRole("button", { name: "No thanks" }),
      ),
    );
    expect(
      within(dialog).getByRole("button", { name: "Start when I log in" }).className,
    ).not.toContain("sl-btn--primary");
  });

  it("asks once, and Start when I log in turns it on", async () => {
    let sent: unknown;
    renderRouted(
      <AutostartReminder />,
      testDeps({
        ...settled,
        "GET /api/settings/autostart": jsonAnswer(native(false, true)),
        "PUT /api/settings/autostart": async (request) => {
          sent = await request.json();
          return jsonAnswer(native(true, false))(request);
        },
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Start Slopify when you log in?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Start when I log in" }));
    await waitFor(() => expect(sent).toEqual({ enabled: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("ends for good when closed", async () => {
    let answered = false;
    renderRouted(
      <AutostartReminder />,
      testDeps({
        ...settled,
        "GET /api/settings/autostart": jsonAnswer(native(false, true)),
        "POST /api/settings/autostart/answer": (request) => {
          answered = true;
          return jsonAnswer(native(false, false))(request);
        },
      }),
    );
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(answered).toBe(true));
  });

  it("stays away while the first-run screen asks, or once answered", async () => {
    renderRouted(
      <AutostartReminder />,
      testDeps({
        ...settled,
        "GET /api/onboarding": jsonAnswer({ show: true, settle: false }),
        "GET /api/settings/autostart": jsonAnswer(native(false, true)),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks the server afresh once due, so a question leaving the welcome answered never opens", async () => {
    let reads = 0;
    renderRouted(
      <AutostartReminder />,
      testDeps({
        ...settled,
        // The page read the offer on the welcome; Skip has answered it since.
        "GET /api/settings/autostart": (request) => {
          reads += 1;
          return jsonAnswer(native(false, reads === 1))(request);
        },
      }),
    );
    await waitFor(() => expect(reads).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays away while a first project made elsewhere is being settled, which answers it", async () => {
    renderRouted(
      <AutostartReminder />,
      testDeps({
        ...settled,
        "GET /api/onboarding": jsonAnswer({ show: false, settle: true }),
        "GET /api/settings/autostart": jsonAnswer(native(false, true)),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
