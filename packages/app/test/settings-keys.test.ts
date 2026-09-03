import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Config } from "../src/kernel/config/index.js";
import { boot } from "../src/main.js";
import { keyMask } from "../src/slices/settings/keys.js";

// Not a key: no provider prefix, no length, and nothing about it resembles a credential
// any provider issues. It only has to be a string this test can hunt for afterwards.
const standIn = "slopify-integration-stand-in-value";

const open: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const stop of open.splice(0)) {
    await stop();
  }
});

function config(dataDir: string): Config {
  return { port: 0, host: "127.0.0.1", dataDir, open: false };
}

async function started(): Promise<{ url: string; logsDir: string }> {
  const { url, paths, stop } = await boot(config(mkdtempSync(join(tmpdir(), "slopify-keys-"))));
  open.push(stop);
  return { url, logsDir: paths.logs };
}

function logText(logsDir: string): string {
  return readdirSync(logsDir)
    .map((name) => readFileSync(join(logsDir, name), "utf8"))
    .join("");
}

async function saveKey(url: string, provider: string, key: string): Promise<Response> {
  return await fetch(`${url}/api/providers/${provider}/key`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key }),
  });
}

describe("a provider key on a booted app", () => {
  it("is saved, masked in the answer, and removed again", async () => {
    const { url } = await started();

    const saved = await saveKey(url, "openrouter", standIn);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({
      provider: "openrouter",
      hasKey: true,
      masked: keyMask,
    });

    const listed = await fetch(`${url}/api/providers`);
    expect(listed.status).toBe(200);

    const removed = await fetch(`${url}/api/providers/openrouter/key`, { method: "DELETE" });
    expect(removed.status).toBe(204);

    const after = await fetch(`${url}/api/providers`);
    expect(await after.text()).toContain('"hasKey":false');
  });

  // The guard for the one rule this slice cannot get wrong (`logic/02` invariants): a key
  // reaches the provider it belongs to and nowhere else. Every surface the save touches
  // is read back and searched for the value that was sent.
  it("never appears in a response body or a log line", async () => {
    const { url, logsDir } = await started();
    const bodies: string[] = [];

    bodies.push(await (await saveKey(url, "openrouter", standIn)).text());
    bodies.push(await (await saveKey(url, "elevenlabs", standIn)).text());
    // The refusals, too: a message about a key must not quote it.
    bodies.push(await (await saveKey(url, "claude-code", standIn)).text());
    bodies.push(await (await saveKey(url, "not-a-provider", standIn)).text());
    bodies.push(await (await fetch(`${url}/api/providers`)).text());
    bodies.push(await (await fetch(`${url}/api/settings`)).text());
    bodies.push(await (await fetch(`${url}/api/settings/voices`)).text());
    bodies.push(await (await fetch(`${url}/api/health`)).text());
    bodies.push(await (await fetch(`${url}/api/projects`)).text());
    bodies.push(await (await fetch(`${url}/api/telemetry/notice`)).text());
    bodies.push(
      await (await fetch(`${url}/api/providers/openrouter/key`, { method: "DELETE" })).text(),
    );

    for (const body of bodies) {
      expect(body).not.toContain(standIn);
      // Not even a tail of it: the mask is a constant, so no run of the key's own
      // characters may be legible anywhere.
      expect(body).not.toContain(standIn.slice(-4));
    }
    expect(logText(logsDir)).not.toContain(standIn);
    expect(logText(logsDir)).not.toContain(standIn.slice(-4));
  });
});
