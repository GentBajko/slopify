import { expect, it } from "vitest";
import { createAudioPreviewStore } from "../../kernel/audio-preview.js";
import { observeNarration } from "./live.js";

it("labels each narration part and replaces an interrupted attempt without mixing its bytes", async () => {
  const store = createAudioPreviewStore();
  const observe = observeNarration(store, "project", "piece", "Body part 2 of 3");
  observe?.({ type: "start" });
  observe?.({ type: "chunk", bytes: new TextEncoder().encode("failed") });
  const old = store.list("project")[0]?.id;
  observe?.({ type: "interrupted" });
  expect(store.list("project")[0]).toMatchObject({ state: "interrupted", bytes: 0 });
  observe?.({ type: "start" });
  observe?.({ type: "chunk", bytes: new TextEncoder().encode("replacement") });
  observe?.({ type: "complete" });
  const current = store.list("project")[0];
  expect(current).toMatchObject({ label: "Body part 2 of 3", state: "ready" });
  expect(current?.id).not.toBe(old);
  expect(
    await new Response(
      store.stream("project", current?.id ?? "", new AbortController().signal),
    ).text(),
  ).toBe("replacement");
});

it("does not require a preview service in an isolated narration run", () => {
  expect(observeNarration(undefined, "p1", "piece", "Intro")).toBeUndefined();
});
