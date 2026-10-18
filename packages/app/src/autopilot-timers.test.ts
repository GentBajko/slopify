import { afterEach, expect, it, vi } from "vitest";
import { startAutopilot } from "./autopilot-timers.js";
import { fixedClock } from "./kernel/clock.fake.js";
import { openDb } from "./kernel/db/index.js";
import { migrate } from "./kernel/db/migrate.js";
import { catalogue } from "./slices/rebuild/recipe-fixture.js";

afterEach(() => {
  vi.useRealTimers();
});

it("checks 30 seconds after a start and then hourly, never at once, and stops with the server", async () => {
  vi.useFakeTimers();
  const db = openDb(":memory:");
  const clock = fixedClock("2026-10-18T10:00:00.000Z");
  migrate(db, clock);
  const fetched: string[] = [];
  const autopilot = startAutopilot({
    db,
    clock,
    log: { write: () => undefined },
    dataDir: "/",
    template: () => undefined,
    catalogue: () => catalogue,
    fetch: async (input) => {
      fetched.push(String(input));
      return new Response("{}");
    },
    send: async () => ({ ok: true }),
    readLogin: async () => "signed-in",
  });
  expect(autopilot.latest()).toBeUndefined();
  await vi.advanceTimersByTimeAsync(30_000);
  await vi.waitFor(() => expect(autopilot.latest()).toBeDefined());
  expect(autopilot.latest()?.checkedAt).toBe("2026-10-18T10:00:00.000Z");
  // No OpenRouter key: nothing was asked of it.
  expect(fetched).toEqual([]);
  autopilot.stop();
  expect(vi.getTimerCount()).toBe(0);
  db.close();
});
