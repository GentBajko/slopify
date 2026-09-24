import { expect, it } from "vitest";
import { buildRegistry } from "./adapter-registry.js";
import { fixedClock } from "./kernel/clock.fake.js";
import { openDb } from "./kernel/db/index.js";
import { migrate } from "./kernel/db/migrate.js";
import { type HostCliPorts, hostLlmIds } from "./kernel/ports/host-cli.js";

it("uses host ports for every CLI and never probes or spawns a container CLI", async () => {
  const clock = fixedClock("2026-09-24T00:00:00Z");
  const db = openDb(":memory:");
  migrate(db, clock);
  const calls: string[] = [];
  const hostCli: HostCliPorts = {
    status: async (id) => {
      calls.push(`status:${id}`);
      return { id, command: "/host/cli", installed: true, login: "signed-in" };
    },
    llm: (id) => ({
      id,
      capabilities: { streams: true, reportsUsage: true, webSearch: true },
      models: async () => [{ id: "host", name: "Host" }],
      complete: async function* () {
        calls.push(id);
        yield { type: "done", usage: null, finishReason: null };
      },
    }),
    image: {
      id: "codex-image",
      models: async () => [{ id: "codex-imagegen", name: "Host image" }],
      generate: async () => {
        calls.push("image");
        return { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), mime: "image/jpeg" };
      },
    },
  };
  const registry = buildRegistry({
    db,
    clock,
    hostCli,
    fetch: async () => {
      throw new Error("Unexpected network");
    },
    spawn: () => {
      throw new Error("Container spawn");
    },
    probe: async () => {
      throw new Error("Container probe");
    },
  });
  try {
    for (const id of hostLlmIds) {
      expect(await registry.llm(id).models()).toEqual([{ id: "host", name: "Host" }]);
      for await (const _ of registry
        .llm(id)
        .complete({
          model: "host",
          messages: [{ role: "user", content: "test" }],
          signal: AbortSignal.timeout(1000),
        })) {
      }
    }
    await registry
      .image("codex-image")
      .generate({
        model: "codex-imagegen",
        prompt: "test",
        aspect: "16:9",
        signal: AbortSignal.timeout(1000),
      });
    const list = await registry.list();
    expect(list.find((p) => p.id === "codex")?.readiness).toMatchObject({ installed: true });
    expect(registry.llm("openrouter").id).toBe("openrouter");
    expect(calls).toEqual(
      expect.arrayContaining(["claude-code", "codex", "gemini", "image", "status:codex-image"]),
    );
  } finally {
    db.close();
  }
});
