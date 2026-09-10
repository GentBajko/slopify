import { describe, expect, it } from "vitest";
import { createPreviewCache } from "./preview-cache.js";

const delta = {
  type: "llm.preview",
  projectId: "p1",
  stage: "research",
  callId: "one",
  text: "First",
} as const;
describe("live preview replay", () => {
  it("replays the current attempt and isolates parallel tasks", () => {
    const cache = createPreviewCache();
    cache.observe(delta);
    cache.observe({ ...delta, text: " response" });
    cache.observe({ ...delta, callId: "two", text: "Second" });
    expect(cache.snapshot("p1").map((one) => one.text)).toEqual(["First response", "Second"]);
    cache.observe({ ...delta, reset: true, text: "Retry" });
    expect(cache.snapshot("p1").find((one) => one.callId === "one")?.text).toBe("Retry");
    expect(cache.snapshot("another")).toEqual([]);
  });
  it("clears the stage on lifecycle transitions and bounds stored text", () => {
    const cache = createPreviewCache();
    cache.observe({ ...delta, text: "x".repeat(100_000) });
    expect(cache.snapshot("p1")[0]?.text.length).toBe(64 * 1024);
    cache.observe({ type: "stage.state", projectId: "p1", stage: "research", state: "done" });
    expect(cache.snapshot("p1")).toEqual([]);
  });
  it("bounds concurrent projects and calls", () => {
    const cache = createPreviewCache();
    for (let p = 0; p < 20; p++)
      for (let c = 0; c < 12; c++) cache.observe({ ...delta, projectId: `p${p}`, callId: `c${c}` });
    expect(cache.snapshot("p0")).toEqual([]);
    expect(cache.snapshot("p19")).toHaveLength(8);
  });
});
