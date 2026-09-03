import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AppearanceSkin } from "@/components/theme";
import type { Answer } from "@/test-app";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { gapProblem, SettingsRoute } from "./settings.js";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

const settings = { silenceGapSeconds: 3, appearance: "system" as const };

function deps(extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({
    "GET /api/providers": jsonAnswer({ providers: [] }),
    "GET /api/settings/voices": jsonAnswer({ voices: [] }),
    "GET /api/settings": jsonAnswer(settings),
    ...extra,
  });
}

describe("the silence gap field", () => {
  it("takes a whole number of seconds inside the bound a run allows", () => {
    expect(gapProblem("0")).toBeUndefined();
    expect(gapProblem("3")).toBeUndefined();
    expect(gapProblem("30")).toBeUndefined();
  });

  it("refuses empty, negative, fractional and out of range values with one sentence", () => {
    const named = "The silence gap is a whole number of seconds between 0 and 30.";
    expect(gapProblem("")).toBe(named);
    expect(gapProblem("   ")).toBe(named);
    expect(gapProblem("-1")).toBe(named);
    expect(gapProblem("1.5")).toBe(named);
    expect(gapProblem("31")).toBe(named);
    expect(gapProblem("three")).toBe(named);
  });
});

describe("the settings screen", () => {
  it("carries the three groups the screen is made of", async () => {
    renderApp(<SettingsRoute />, deps());
    expect(await screen.findByRole("heading", { name: "Settings" })).not.toBeNull();
    expect(await screen.findByRole("heading", { name: "API keys · LLM" })).not.toBeNull();
    expect(await screen.findByText("Voices · Name")).not.toBeNull();
    expect(await screen.findByRole("heading", { name: "Playback" })).not.toBeNull();
  });

  it("holds Save while the gap is not a number a run would take", async () => {
    const user = userEvent.setup();
    renderApp(<SettingsRoute />, deps());

    const field = await screen.findByLabelText("Silence between segments");
    await user.clear(field);
    expect(
      screen.getByText("The silence gap is a whole number of seconds between 0 and 30."),
    ).not.toBeNull();
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
  });

  it("saves the gap and confirms it inline", async () => {
    const user = userEvent.setup();
    let sent: unknown;
    renderApp(
      <SettingsRoute />,
      deps({
        "PUT /api/settings": async (request) => {
          sent = await request.json();
          return jsonAnswer({ silenceGapSeconds: 5, appearance: "system" })(request);
        },
      }),
    );

    const field = await screen.findByLabelText("Silence between segments");
    await user.clear(field);
    await user.type(field, "5");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved")).not.toBeNull();
    expect(sent).toEqual({ silenceGapSeconds: 5, appearance: "system" });
  });

  it("names the problem when the settings cannot be read", async () => {
    renderApp(
      <SettingsRoute />,
      deps({ "GET /api/settings": problemAnswer("The database is locked.", 500) }),
    );
    expect(await screen.findByText("The database is locked.")).not.toBeNull();
  });
});

describe("the appearance switch", () => {
  it("leaves the theme to prefers-color-scheme until one is picked", async () => {
    renderApp(
      <>
        <AppearanceSkin />
        <SettingsRoute />
      </>,
      deps(),
    );
    expect(await screen.findByRole("radio", { name: "System" })).not.toBeNull();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  // Toggling the theme is immediate. The page repaints from the
  // cache the moment the switch moves, not when the server answers.
  it("paints the new theme before the save has answered", async () => {
    const user = userEvent.setup();
    renderApp(
      <>
        <AppearanceSkin />
        <SettingsRoute />
      </>,
      deps({ "PUT /api/settings": () => new Promise<Response>(() => {}) }),
    );

    await user.click(await screen.findByRole("radio", { name: "Light" }));
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });

  it("persists the override and keeps it after the answer", async () => {
    const user = userEvent.setup();
    let sent: unknown;
    renderApp(
      <>
        <AppearanceSkin />
        <SettingsRoute />
      </>,
      deps({
        "PUT /api/settings": async (request) => {
          sent = await request.json();
          return jsonAnswer({ silenceGapSeconds: 3, appearance: "dark" })(request);
        },
      }),
    );

    await user.click(await screen.findByRole("radio", { name: "Dark" }));
    await waitFor(() => {
      expect(sent).toEqual({ silenceGapSeconds: 3, appearance: "dark" });
    });
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });

  it("hands the theme back when the save is refused", async () => {
    const user = userEvent.setup();
    renderApp(
      <>
        <AppearanceSkin />
        <SettingsRoute />
      </>,
      deps({ "PUT /api/settings": problemAnswer("The database is locked.", 500) }),
    );

    await user.click(await screen.findByRole("radio", { name: "Light" }));
    expect(await screen.findByText("The database is locked.")).not.toBeNull();
    await waitFor(() => {
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    });
  });
});
