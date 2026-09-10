import { describe, expect, it } from "vitest";
import { buildRegistry } from "./adapter-registry.js";
import type { CliRun } from "./adapters/llm/run-cli.js";
import { fixedClock } from "./kernel/clock.fake.js";
import { openDb } from "./kernel/db/index.js";
import { migrate } from "./kernel/db/migrate.js";
import { writeSetting } from "./slices/settings/repo.js";

const clock = fixedClock("2026-09-10T00:00:00.000Z");

describe("registry CLI paths", () => {
  it.each([
    ["codex", "codex"],
    ["claude-code", "claude"],
    ["gemini", "gemini"],
  ] as const)(
    "uses the latest saved %s path without rebuilding the registry",
    async (id, fallback) => {
      const db = openDb(":memory:");
      migrate(db, clock);
      const launched: string[] = [];
      const registry = buildRegistry({
        db,
        clock,
        fetch: () => {
          throw new Error("No network calls are allowed in this test");
        },
        probe: () => Promise.resolve({ ran: false, stdout: "" }),
        spawn: (binary): CliRun => {
          launched.push(binary);
          throw new Error("Stopped at the injected process boundary");
        },
      });
      const attempt = async (): Promise<void> => {
        await expect(
          registry
            .llm(id)
            .complete({
              model: "",
              messages: [{ role: "user", content: "A harmless test prompt" }],
              signal: new AbortController().signal,
            })
            [Symbol.asyncIterator]()
            .next(),
        ).rejects.toThrow("Stopped at the injected process boundary");
      };
      try {
        await attempt();
        writeSetting(db, `cli.path.${id}`, JSON.stringify(`/a folder/${fallback}`));
        await attempt();
        writeSetting(db, `cli.path.${id}`, JSON.stringify(`/another folder/${fallback}`));
        await attempt();
        writeSetting(db, `cli.path.${id}`, "null");
        await attempt();
        expect(launched).toEqual([
          fallback,
          `/a folder/${fallback}`,
          `/another folder/${fallback}`,
          fallback,
        ]);
      } finally {
        db.close();
      }
    },
  );
});
