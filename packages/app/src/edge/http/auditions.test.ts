import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { providerError } from "../../kernel/ports/model.js";
import type { TtsCall } from "../../kernel/runner/providers.js";
import { catalogue } from "../../slices/rebuild/recipe-fixture.js";
import type { AppDeps } from "./app.js";
import { type Audition, auditionRoutes } from "./auditions.js";

function app(audition?: Audition) {
  const deps = {
    catalogue: { read: () => catalogue },
    ids: { next: () => "id" },
    log: { write: () => {} },
    ...(audition === undefined ? {} : { audition }),
  } as unknown as AppDeps & { audition?: Audition };
  return new Hono().route("/api/auditions", auditionRoutes(deps));
}
const post = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const line = { provider: "voice", model: "tts", voice: "v1", text: "Hello, I'm Alex." };

describe("voice auditions", () => {
  it("prices every speaker's line without speaking", async () => {
    const calls: TtsCall[] = [];
    const response = await app(async (call) => {
      calls.push(call);
      return { ok: true, value: { bytes: new Uint8Array([1]), container: "mp3" } };
    }).request("/api/auditions/quote", post({ lines: [{ ...line, speaker: "Alex" }] }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { estimate: { rows: { stage: string }[] } };
    expect(body.estimate.rows.map((row) => row.stage)).toEqual(["Alex"]);
    expect(calls).toEqual([]);
  });

  it("speaks only a confirmed audition and answers with the audio", async () => {
    const calls: TtsCall[] = [];
    const routes = app(async (call) => {
      calls.push(call);
      return { ok: true, value: { bytes: new Uint8Array([0xff, 0xfb]), container: "mp3" } };
    });
    expect((await routes.request("/api/auditions", post(line))).status).toBe(400);
    const response = await routes.request("/api/auditions", post({ ...line, confirmed: true }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xfb]));
    expect(calls).toEqual([
      { provider: "voice", model: "tts", voiceId: "v1", text: "Hello, I'm Alex." },
    ]);
  });

  it("says why the provider could not speak it", async () => {
    const response = await app(async () => {
      throw providerError({ kind: "auth", message: "The voice provider rejected the key." });
    }).request("/api/auditions", post({ ...line, confirmed: true }));
    expect(response.status).toBe(502);
    expect(((await response.json()) as { detail: string }).detail).toBe(
      "The audition couldn't be spoken: The voice provider rejected the key.",
    );
  });
});
