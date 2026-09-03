import { describe, expect, it } from "vitest";
import { payloadSchema } from "./model.js";

// The privacy surface, written out rather than derived: adding a key to the schema fails
// this test until someone edits the list below on purpose, having read logic/16 step 4
// and the promise in mockup/02-first-run-notice.md.
const allowed = [
  "appVersion",
  "stage",
  "segment",
  "provider",
  "model",
  "tokensIn",
  "tokensOut",
  "audioSeconds",
  "images",
  "thumbnails",
];

describe("the telemetry payload schema", () => {
  it("allows exactly the counters logic/16 names", () => {
    expect(Object.keys(payloadSchema.shape).toSorted()).toEqual(allowed.toSorted());
  });

  // logic/16 step 4, the never-list. Each of these is a real field the app holds and a
  // future stage could reach for without thinking.
  it.each([
    ["apiKey", "sk-live-0123456789abcdef"],
    ["key", "sk-live-0123456789abcdef"],
    ["prompt", "Write 900 words about rope tricks"],
    ["keywords", "rope tricks"],
    ["title", "Rope Tricks"],
    ["article", "Everything you never wanted to know about rope."],
    ["research", "notes"],
    ["filename", "body.mp3"],
    ["path", "/home/someone/.slopify/projects/p1/video.mp4"],
    ["os", "linux"],
    ["locale", "en-GB"],
    ["cpu", "x86_64"],
    ["projectId", "01K4B0"],
  ])("refuses %s", (key, value) => {
    expect(payloadSchema.safeParse({ appVersion: "1.2.3", [key]: value }).success).toBe(false);
  });

  it("requires the app version", () => {
    expect(payloadSchema.safeParse({}).success).toBe(false);
  });

  it("refuses a counter that is not a number", () => {
    expect(payloadSchema.safeParse({ appVersion: "1.2.3", images: "3" }).success).toBe(false);
  });

  it("refuses a stage kind that is not one of the six", () => {
    expect(payloadSchema.safeParse({ appVersion: "1.2.3", stage: "sorcery" }).success).toBe(false);
  });

  it("caps the model id so prose cannot ride in it", () => {
    expect(payloadSchema.safeParse({ appVersion: "1.2.3", model: "m".repeat(121) }).success).toBe(
      false,
    );
  });

  it("accepts a full set of counters", () => {
    expect(
      payloadSchema.parse({
        appVersion: "1.2.3",
        stage: "audio",
        segment: "body",
        provider: "elevenlabs",
        model: "eleven_v3",
        tokensIn: 10,
        tokensOut: 20,
        audioSeconds: 12.5,
        images: 3,
        thumbnails: 1,
      }),
    ).toEqual({
      appVersion: "1.2.3",
      stage: "audio",
      segment: "body",
      provider: "elevenlabs",
      model: "eleven_v3",
      tokensIn: 10,
      tokensOut: 20,
      audioSeconds: 12.5,
      images: 3,
      thumbnails: 1,
    });
  });
});
