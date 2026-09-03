import { payloadSchema, telemetryEventTypes } from "@app/slices/telemetry/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { FirstRunNotice } from "./notice.js";

afterEach(cleanup);

const title = "Anonymous usage stats";

// The notice's copy is a promise made before anything is collected, so it is pinned to
// the code that does the collecting rather than to a reviewer's memory. Every key
// `payloadSchema` allows, and every event type the catalogue has, is mapped to the words
// the dialog says it in; adding a key without saying so fails here first.
const promisedPayload: Readonly<Record<string, string>> = {
  appVersion: "this version is included in each report",
  stage: "Tokens in and out per stage, with provider and model",
  segment: "Audio seconds per segment",
  provider: "Tokens in and out per stage, with provider and model",
  model: "Tokens in and out per stage, with provider and model",
  tokensIn: "Tokens in and out per stage, with provider and model",
  tokensOut: "Tokens in and out per stage, with provider and model",
  audioSeconds: "Audio seconds per segment",
  images: "Images made",
  thumbnails: "Thumbnails made",
};

const promisedTypes: Readonly<Record<string, string>> = {
  install: "That this machine installed Slopify",
  "project.created": "Projects created",
  // Every stage that completes, of which the render is the one the counters name.
  "stage.completed": "Videos rendered",
};

// The envelope `slices/telemetry/flush.ts` builds around a payload.
const fresh = jsonAnswer({ seen: false, appVersion: "9.9.9" });

const promisedEnvelope = [
  "a random ID of its own",
  "this machine's random ID",
  "The time each of those happened",
];

describe("the first-run notice", () => {
  it("is shown when this machine has not seen it", async () => {
    renderApp(<FirstRunNotice />, testDeps({ "GET /api/telemetry/notice": fresh }));

    expect(await screen.findByText(title)).not.toBeNull();
    // The disclosure itself: what is counted and what never is (logic/16 steps 3-4).
    expect(screen.getByText("Tracked")).not.toBeNull();
    expect(screen.getByText("Never tracked")).not.toBeNull();
    expect(screen.getByText("API keys")).not.toBeNull();
    expect(screen.getByText("Videos rendered")).not.toBeNull();
  });

  it("is never shown again once the machine has seen it", async () => {
    renderApp(
      <FirstRunNotice />,
      testDeps({ "GET /api/telemetry/notice": jsonAnswer({ seen: true, appVersion: "9.9.9" }) }),
    );

    await waitFor(() => {
      expect(screen.queryByText(title)).toBeNull();
    });
  });

  it("shows nothing while the answer is still coming", () => {
    renderApp(<FirstRunNotice />, testDeps({}));
    expect(screen.queryByText(title)).toBeNull();
  });

  it("creates the machine id on Got it and does not come back", async () => {
    const dismissed = vi.fn(jsonAnswer({ seen: true }));
    renderApp(
      <FirstRunNotice />,
      testDeps({
        "GET /api/telemetry/notice": fresh,
        "POST /api/telemetry/notice": dismissed,
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Got it" }));

    await waitFor(() => {
      expect(screen.queryByText(title)).toBeNull();
    });
    expect(dismissed).toHaveBeenCalledTimes(1);
  });

  it("cannot be escaped: it must be acknowledged", async () => {
    renderApp(<FirstRunNotice />, testDeps({ "GET /api/telemetry/notice": fresh }));

    await screen.findByText(title);
    await userEvent.keyboard("{Escape}");

    expect(screen.getByText(title)).not.toBeNull();
  });

  it("names every payload key the code is allowed to send", async () => {
    renderApp(<FirstRunNotice />, testDeps({ "GET /api/telemetry/notice": fresh }));
    const dialog = await screen.findByRole("dialog");

    // If this fails, a key was added to the payload and the promise was not updated.
    expect(Object.keys(payloadSchema.shape).toSorted()).toEqual(
      Object.keys(promisedPayload).toSorted(),
    );
    for (const words of new Set(Object.values(promisedPayload))) {
      expect(dialog.textContent).toContain(words);
    }
  });

  it("names every event type the code is allowed to send, and the envelope around it", async () => {
    renderApp(<FirstRunNotice />, testDeps({ "GET /api/telemetry/notice": fresh }));
    const dialog = await screen.findByRole("dialog");

    expect([...telemetryEventTypes].toSorted()).toEqual(Object.keys(promisedTypes).toSorted());
    for (const words of Object.values(promisedTypes)) {
      expect(dialog.textContent).toContain(words);
    }
    for (const words of promisedEnvelope) {
      expect(dialog.textContent).toContain(words);
    }
  });

  it("names the version that goes out with every report", async () => {
    renderApp(<FirstRunNotice />, testDeps({ "GET /api/telemetry/notice": fresh }));

    expect(
      await screen.findByText("Slopify 9.9.9 · this version is included in each report"),
    ).not.toBeNull();
  });

  it("promises nothing about a version it has not been told", async () => {
    renderApp(
      <FirstRunNotice />,
      testDeps({ "GET /api/telemetry/notice": jsonAnswer({ seen: false }) }),
    );

    await screen.findByText(title);
    expect(screen.queryByText(/included in each report/)).toBeNull();
  });

  it("stays open and names the problem when the dismissal fails", async () => {
    renderApp(
      <FirstRunNotice />,
      testDeps({
        "GET /api/telemetry/notice": fresh,
        "POST /api/telemetry/notice": problemAnswer("The data directory is read-only.", 500),
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Got it" }));

    expect(await screen.findByText("The data directory is read-only.")).not.toBeNull();
    expect(screen.getByText(title)).not.toBeNull();
  });
});
