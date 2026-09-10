import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { fingerprint } from "./work.js";

it("ignores object insertion order but retains output order and request settings", () => {
  expect(fingerprint({ text: "A", voice: "v1" })).toBe(fingerprint({ voice: "v1", text: "A" }));
  expect(fingerprint(["a", "b"])).not.toBe(fingerprint(["b", "a"]));
  expect(fingerprint({ text: "A", voice: "v1" })).not.toBe(fingerprint({ text: "A", voice: "v2" }));
});

it("canonicalizes nested objects and hashes their exact JSON with SHA-256", () => {
  const input = {
    version: 1,
    request: [{ voice: "voice", text: "Words.\nMore words.", context: { before: null } }],
  };
  const canonical =
    '{"request":[{"context":{"before":null},"text":"Words.\\nMore words.","voice":"voice"}],"version":1}';
  expect(fingerprint(input)).toBe(createHash("sha256").update(canonical).digest("hex"));
  expect(fingerprint(input)).toBe(
    fingerprint({
      request: [{ context: { before: null }, text: "Words.\nMore words.", voice: "voice" }],
      version: 1,
    }),
  );
  expect(Object.keys(input)).toEqual(["version", "request"]);
  expect(Object.keys(input.request[0] ?? {})).toEqual(["voice", "text", "context"]);
});

it.each(["provider", "model", "voice", "text", "context"])(
  "distinguishes requests with different %s",
  (setting) => {
    const request = { provider: "tts", model: "v1", voice: "one", text: "Hello", context: "" };
    expect(fingerprint(request)).not.toBe(fingerprint({ ...request, [setting]: "different" }));
  },
);

it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
  "rejects nonfinite fingerprint values including nested values: %s",
  (value) => {
    expect(() => fingerprint(value)).toThrow();
    expect(() => fingerprint({ settings: [value] })).toThrow();
    expect(fingerprint(null)).toBe(createHash("sha256").update("null").digest("hex"));
  },
);

it("changes work identity for explicit regeneration without changing the request identity", () => {
  const request = { text: "A whole narration request.", voice: "v1" };
  const requestFingerprint = fingerprint(request);
  expect(fingerprint([requestFingerprint, "regeneration-1"])).not.toBe(
    fingerprint([requestFingerprint, null]),
  );
  expect(fingerprint([requestFingerprint, "regeneration-1"])).not.toBe(
    fingerprint([requestFingerprint, "regeneration-2"]),
  );
  expect(fingerprint(request)).toBe(requestFingerprint);
});
