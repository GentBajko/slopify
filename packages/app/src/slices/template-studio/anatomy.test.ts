import { describe, expect, it } from "vitest";
import { promptAnatomy, sentValues } from "./anatomy.js";

const body = "Write about {{Topic}} for {{Audience}}. Picture: {{Scene}}.";

describe("promptAnatomy", () => {
  it("covers the body once, in order: your words, your keywords, Slopify's", () => {
    const segments = promptAnatomy({
      body,
      sent: "Write about Salt roads for curious adults. Picture: a caravan at dusk.",
      values: {},
    });
    expect(segments).toEqual([
      { origin: "yours", text: "Write about " },
      { origin: "keyword", name: "Topic", text: "Salt roads" },
      { origin: "yours", text: " for " },
      { origin: "keyword", name: "Audience", text: "curious adults" },
      { origin: "yours", text: ". Picture: " },
      { origin: "slopify", name: "Scene", text: "a caravan at dusk" },
      { origin: "yours", text: "." },
    ]);
    expect(segments.map((segment) => segment.text).join("")).toBe(
      "Write about Salt roads for curious adults. Picture: a caravan at dusk.",
    );
  });

  it("treats any name the keyword list fills as Slopify's, so new built-in keywords need no change", () => {
    const segments = promptAnatomy({
      body: "{{Slopify_Title}} by {{Host}}",
      sent: "The Salt Road by Ana",
      values: {},
      filled: ["Slopify_Title"],
    });
    expect(segments[0]).toEqual({
      origin: "slopify",
      name: "Slopify_Title",
      text: "The Salt Road",
    });
    expect(segments[2]).toEqual({ origin: "keyword", name: "Host", text: "Ana" });
  });

  it("marks a keyword still to fill, and falls back to the run's values with no sent prompt", () => {
    const segments = promptAnatomy({ body, values: { Topic: "Salt roads", Audience: "" } });
    expect(segments[1]).toEqual({ origin: "keyword", name: "Topic", text: "Salt roads" });
    expect(segments[3]).toMatchObject({ name: "Audience", unfilled: true, text: "{{Audience}}" });
    expect(segments[5]).toMatchObject({ origin: "slopify", name: "Scene", unfilled: true });
  });

  it("shows what a setting or the sample adds after the prompt", () => {
    const segments = promptAnatomy({
      body: "Write.",
      values: {},
      appended: [{ text: "This is a short sample.", by: "slopify" }],
    });
    expect(segments.at(-1)).toEqual({ origin: "slopify", text: "\n\nThis is a short sample." });
  });
});

describe("sentValues", () => {
  it("reads each keyword back from the sent prompt, and nothing from a hand-edited one", () => {
    expect(sentValues("Hi {{Name}}!", "Hi Ana!")).toEqual({ Name: "Ana" });
    expect(sentValues("Hi {{Name}}!", "Hello Ana")).toBeUndefined();
    expect(sentValues("Cost: $ {{N}} (est.)", "Cost: $ 4 (est.)")).toEqual({ N: "4" });
  });
});
