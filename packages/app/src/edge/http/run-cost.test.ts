import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { AppDeps } from "./app.js";
import { runCostRoutes } from "./run-cost.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function harness() {
  const db = openDb(":memory:");
  cleanups.push(() => db.close());
  migrate(db, fixedClock("2026-09-27T10:00:00.000Z"));
  db.exec("INSERT INTO projects VALUES ('p1','Run','16:9','{}','2026-09-27','2026-09-27')");
  db.exec(
    "INSERT INTO stages (id, project_id, kind, source, state, started_at) VALUES ('s1','p1','images','generate','running','2026-09-27T10:00:00.000Z')",
  );
  db.exec(
    `INSERT INTO provider_usage (id, project_id, stage, kind, provider, model, images, size, wall_ms, on_plan, cost, created_at)
     VALUES ('u1','p1','images','image','google-image','gemini-3.1-flash-image',1,'16:9',9000,0,0.101,'2026-09-27T10:01:00.000Z')`,
  );
  db.exec(
    "INSERT INTO plan_limit_waits VALUES ('codex','2026-09-27T14:00:00.000Z','2026-09-27T14:02:00.000Z','2026-09-27T10:02:00.000Z')",
  );
  db.exec(
    "INSERT INTO plan_limit_waiters VALUES ('p1','images','codex','2026-09-27T10:02:00.000Z')",
  );
  const app = new Hono().route("/api/projects", runCostRoutes({ db } as unknown as AppDeps));
  return { app };
}

describe("GET /api/projects/:id/run-cost", () => {
  it("answers the Run cost tab and any plan-limit wait", async () => {
    const { app } = harness();
    const response = await app.request("/api/projects/p1/run-cost");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      currency: "USD",
      calls: 1,
      cost: 0.101,
      totals: { images: 1 },
      byModel: [{ provider: "google-image", images: 1, onPlan: false }],
      waits: [
        {
          account: "codex",
          name: "Codex",
          stage: "images",
          resetsAt: "2026-09-27T14:00:00.000Z",
          retryAt: "2026-09-27T14:02:00.000Z",
        },
      ],
    });
  });

  it("says plainly when the project is gone", async () => {
    const { app } = harness();
    const response = await app.request("/api/projects/nope/run-cost");
    expect(response.status).toBe(404);
    expect(((await response.json()) as { detail: string }).detail).toContain("Go back to Projects");
  });
});
