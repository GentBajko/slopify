import { describe, expect, it } from "vitest";
import type { ProjectEvent } from "../../kernel/events.js";
import { createHub, type SseMessage } from "./hub.js";

// The live build view's frames: the article as it is typed (llm.preview, including the
// typed-ahead text a CLI streams) and each narration piece as it lands (narration.piece).
function listener() {
  const frames: SseMessage[] = [];
  const controller = new AbortController();
  return {
    frames,
    controller,
    stream: {
      writeSSE: async (message: SseMessage) => {
        frames.push(message);
      },
    },
  };
}

describe("live build events", () => {
  const origin = { revisionId: "r1", workId: "w1", workPieceId: "p1" };
  const preview = (text: string, reset?: boolean): ProjectEvent => ({
    type: "llm.preview",
    projectId: "p",
    stage: "article",
    callId: "call",
    label: "article:body",
    text,
    ...(reset === undefined ? {} : { reset }),
    ...origin,
  });

  it("streams partial article text and narration pieces, and replays the writing so far", async () => {
    const hub = createHub({ ids: { next: () => "id" }, log: { write: () => undefined } });
    const early = listener();
    void hub.subscribe("p", early.stream, early.controller.signal);
    hub.emit("p", preview("", true));
    hub.emit("p", preview("The Library "));
    hub.emit("p", preview("of Alexandria"));
    hub.emit("p", {
      type: "narration.piece",
      projectId: "p",
      key: "audio:body:1",
      durationMs: 4200,
      ...origin,
    });
    await Promise.resolve();
    expect(early.frames.map((frame) => frame.event)).toEqual([
      "llm.preview",
      "llm.preview",
      "llm.preview",
      "narration.piece",
    ]);
    expect(JSON.parse(early.frames[3]?.data ?? "{}")).toMatchObject({
      key: "audio:body:1",
      durationMs: 4200,
    });
    // A page opened mid-article gets everything written so far in one frame.
    const late = listener();
    void hub.subscribe("p", late.stream, late.controller.signal);
    await Promise.resolve();
    expect(late.frames.map((frame) => JSON.parse(frame.data))).toEqual([
      expect.objectContaining({ text: "The Library of Alexandria", reset: true }),
    ]);
    early.controller.abort();
    late.controller.abort();
  });

  it("keeps a narration piece of an old version off the page", async () => {
    const hub = createHub({
      ids: { next: () => "id" },
      log: { write: () => undefined },
      acceptEvent: (event) => event.revisionId === "current",
    });
    const page = listener();
    void hub.subscribe("p", page.stream, page.controller.signal);
    hub.emit("p", {
      type: "narration.piece",
      projectId: "p",
      key: "a",
      durationMs: null,
      ...origin,
    });
    await Promise.resolve();
    expect(page.frames).toEqual([]);
    page.controller.abort();
  });
});
