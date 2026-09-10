import { describe, expect, it } from "vitest";
import { appendWriting } from "./live-writing";

const event = {
  type: "llm.preview",
  projectId: "p1",
  stage: "research",
  callId: "one",
  text: "Hello",
} as const;
describe("live writing", () => {
  it("keeps parallel calls separate and replaces a retried attempt", () => {
    const first = appendWriting([], event);
    const second = appendWriting(first, { ...event, callId: "two", text: "Other" });
    expect(
      appendWriting(second, { ...event, text: " again" }).find((one) => one.callId === "one")?.text,
    ).toBe("Hello again");
    expect(appendWriting(second, { ...event, text: " again" }).map((one) => one.callId)).toEqual([
      "one",
      "two",
    ]);
    const reset = appendWriting(second, { ...event, reset: true, text: "New attempt" });
    expect(reset.find((one) => one.callId === "one")?.text).toBe("New attempt");
    expect(reset.find((one) => one.callId === "two")?.text).toBe("Other");
  });
  it("bounds the visible preview without altering saved output", () => {
    expect(appendWriting([], { ...event, text: "x".repeat(100_000) })[0]?.text.length).toBe(
      64 * 1024,
    );
  });
});
