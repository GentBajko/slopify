import { payloadSchema, telemetryEventTypes } from "@app/slices/telemetry/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { FirstRunNotice } from "./notice.js";

afterEach(cleanup);

const sentence =
  "Slopify adds what it makes (videos, images, words) to the public totals on its website, slopify.stream, anonymously. Nothing you type is counted.";

// The notice's list is a promise made before anything is counted, so it is pinned to the code
// that does the counting rather than to a reviewer's memory. Every key `payloadSchema` allows,
// and every kind of count the catalogue has, is mapped to the words the list says it in;
// adding a key without saying so fails here first.
const promisedPayload: Readonly<Record<string, string>> = {
  appVersion: "the Slopify version",
  stage: "for which part of the video",
  segment: "whether for the main part, the intro or the outro",
  provider: "with the AI service and model",
  model: "with the AI service and model",
  tokensIn: "How much text each AI read and wrote",
  tokensOut: "How much text each AI read and wrote",
  audioSeconds: "How many seconds of narration were made",
  images: "images",
  thumbnails: "thumbnails",
  descriptions: "YouTube descriptions",
  shorts: "shorts",
};

const promisedTypes: Readonly<Record<string, string>> = {
  install: "That Slopify was installed",
  "project.created": "How many projects were started",
  // Every part that completes, of which the finished video is the one the totals name.
  "stage.completed": "How many videos",
};

// The envelope `slices/telemetry/flush.ts` builds around a payload.
const promisedEnvelope = [
  "the time",
  "a random number of its own",
  "a random number for this computer",
];

// Words of the code, which a person reading the notice never needs.
const codeWords = /\b(tokens?|stages?|segments?|events?|ID|IDs)\b/;

const fresh = jsonAnswer({ seen: false, appVersion: "9.9.9" });

async function openList(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole("button", { name: "What's counted" }));
  return screen.getByRole("region", { name: "Usage stats" });
}

describe("the first-run notice", () => {
  it("is one sentence and OK on the window's edge, not a dialog over the page", async () => {
    renderApp(<FirstRunNotice />, testDeps({ "GET /api/telemetry/notice": fresh }));

    const notice = await screen.findByRole("region", { name: "Usage stats" });
    expect(screen.getByText(sentence)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Start counting" })).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    // The list waits behind its link.
    expect(screen.queryByText("Never counted")).toBeNull();
    expect(notice.textContent).not.toMatch(codeWords);
  });

  it("opens the full list in place, in plain words", async () => {
    renderApp(<FirstRunNotice />, testDeps({ "GET /api/telemetry/notice": fresh }));

    const notice = await openList();
    expect(screen.getByRole("list", { name: "Counted" })).not.toBeNull();
    expect(screen.getByRole("list", { name: "Never counted" })).not.toBeNull();
    expect(screen.getByText("Your API keys")).not.toBeNull();
    expect(notice.textContent).not.toMatch(codeWords);
    expect(
      screen.getByRole("button", { name: "Hide the list" }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("is never shown again once the machine has seen it", async () => {
    renderApp(
      <FirstRunNotice />,
      testDeps({ "GET /api/telemetry/notice": jsonAnswer({ seen: true, appVersion: "9.9.9" }) }),
    );

    await waitFor(() => {
      expect(screen.queryByText(sentence)).toBeNull();
    });
  });

  it("shows nothing while the answer is still coming", () => {
    renderApp(<FirstRunNotice />, testDeps({}));
    expect(screen.queryByText(sentence)).toBeNull();
  });

  it("starts counting only on OK, and does not come back", async () => {
    const dismissed = vi.fn(jsonAnswer({ seen: true }));
    renderApp(
      <FirstRunNotice />,
      testDeps({
        "GET /api/telemetry/notice": fresh,
        "POST /api/telemetry/notice": dismissed,
      }),
    );

    await screen.findByText(sentence);
    expect(dismissed).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Start counting" }));

    await waitFor(() => {
      expect(screen.queryByText(sentence)).toBeNull();
    });
    expect(dismissed).toHaveBeenCalledTimes(1);
  });

  it("stays until Start counting: Esc does not answer it", async () => {
    renderApp(<FirstRunNotice />, testDeps({ "GET /api/telemetry/notice": fresh }));

    await screen.findByText(sentence);
    await userEvent.keyboard("{Escape}");

    expect(screen.getByText(sentence)).not.toBeNull();
  });

  it("names every payload key the code is allowed to send", async () => {
    renderApp(<FirstRunNotice />, testDeps({ "GET /api/telemetry/notice": fresh }));
    const notice = await openList();

    // If this fails, a key was added to the payload and the promise was not updated.
    expect(Object.keys(payloadSchema.shape).toSorted()).toEqual(
      Object.keys(promisedPayload).toSorted(),
    );
    for (const words of new Set(Object.values(promisedPayload))) {
      expect(notice.textContent).toContain(words);
    }
  });

  it("names every kind of count the code is allowed to send, and what goes with each", async () => {
    renderApp(<FirstRunNotice />, testDeps({ "GET /api/telemetry/notice": fresh }));
    const notice = await openList();

    expect([...telemetryEventTypes].toSorted()).toEqual(Object.keys(promisedTypes).toSorted());
    for (const words of Object.values(promisedTypes)) {
      expect(notice.textContent).toContain(words);
    }
    for (const words of promisedEnvelope) {
      expect(notice.textContent).toContain(words);
    }
  });

  it("names the version that goes out with every count", async () => {
    renderApp(<FirstRunNotice />, testDeps({ "GET /api/telemetry/notice": fresh }));
    const notice = await openList();

    expect(notice.textContent).toContain("the Slopify version (9.9.9)");
  });

  it("promises nothing about a version it has not been told", async () => {
    renderApp(
      <FirstRunNotice />,
      testDeps({ "GET /api/telemetry/notice": jsonAnswer({ seen: false }) }),
    );
    const notice = await openList();

    expect(notice.textContent).toContain("the Slopify version,");
    expect(notice.textContent).not.toMatch(/version \(/);
  });

  it("stays and names the problem when OK fails", async () => {
    renderApp(
      <FirstRunNotice />,
      testDeps({
        "GET /api/telemetry/notice": fresh,
        "POST /api/telemetry/notice": problemAnswer("The data directory is read-only.", 500),
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Start counting" }));

    expect(await screen.findByText("The data directory is read-only.")).not.toBeNull();
    expect(screen.getByText(sentence)).not.toBeNull();
  });
});
