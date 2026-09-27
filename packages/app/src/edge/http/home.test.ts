import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { defaultChannelId } from "../../slices/channels/model.js";
import { uploadedProjects } from "../../slices/uploads/repo.js";
import type { AppDeps } from "./app.js";
import { homeRoutes, uploadedRoutes } from "./home.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const other = "11111111-1111-4111-8111-111111111111";

function harness() {
  const db = openDb(":memory:");
  cleanups.push(() => db.close());
  const clock = fixedClock("2026-09-27T10:00:00.000Z");
  migrate(db, clock);
  db.exec(
    `INSERT INTO channels (id,name,is_default,created_at,updated_at) VALUES ('${other}','Other',0,'x','x')`,
  );
  for (const id of ["p1", "p2", "p3"])
    db.exec(
      `INSERT INTO projects VALUES ('${id}','Run ${id}','16:9','{}','2026-09-20','2026-09-20')`,
    );
  db.exec(`INSERT INTO project_channels VALUES ('p1','${defaultChannelId}'),('p2','${other}')`);
  const usage = (
    id: string,
    project: string,
    onPlan: number,
    cost: string,
    api: string,
    at: string,
  ) =>
    db.exec(
      `INSERT INTO provider_usage (id, project_id, stage, kind, provider, model, wall_ms, on_plan, cost, api_cost, created_at)
       VALUES ('${id}','${project}','article','llm','x','y',1,${String(onPlan)},${cost},${api},'${at}')`,
    );
  usage("u1", "p1", 0, "1.5", "NULL", "2026-09-22T10:00:00.000Z");
  usage("u2", "p1", 1, "0", "2.25", "2026-09-23T10:00:00.000Z");
  usage("u3", "p2", 0, "NULL", "NULL", "2026-09-23T11:00:00.000Z");
  // Before the week: not counted.
  usage("u4", "p1", 0, "9", "NULL", "2026-09-10T10:00:00.000Z");
  db.exec(
    `INSERT INTO outputs (id, project_id, stage_kind, role, path, bytes, created_at) VALUES
     ('o1','p1','video','video','v.mp4',1,'2026-09-24T10:00:00.000Z'),
     ('o2','p2','video','video','v.mp4',1,'2026-09-25T10:00:00.000Z'),
     ('o3','p3','video','video','v.mp4',1,'2026-09-01T10:00:00.000Z')`,
  );
  db.exec(
    `INSERT INTO plan_limit_readings VALUES
     ('r1','p1','codex','{"after":[{"kind":"weekly","usedPercent":12,"resetsAt":null}]}','2026-09-22T10:00:00.000Z'),
     ('r2','p1','codex','{"before":[{"kind":"five_hour","usedPercent":30,"resetsAt":null},{"kind":"weekly","usedPercent":41,"resetsAt":"2026-09-29T00:00:00.000Z"}]}','2026-09-23T10:00:00.000Z')`,
  );
  const deps = { db, clock } as unknown as AppDeps;
  const app = new Hono()
    .route("/api/home", homeRoutes(deps))
    .route("/api/projects", uploadedRoutes(deps));
  return { app, db };
}

describe("GET /api/home/week", () => {
  it("sums the week's videos, spend and API equivalent, and reads each plan's last standing", async () => {
    const { app } = harness();
    const response = await app.request(
      `/api/home/week?since=${encodeURIComponent("2026-09-21T00:00:00.000Z")}`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      since: "2026-09-21T00:00:00.000Z",
      videos: 2,
      calls: 3,
      cost: 1.5,
      unpriced: 1,
      apiEquivalent: 2.25,
      plans: [
        {
          account: "codex",
          name: "Codex",
          weeklyPercent: 41,
          fiveHourPercent: 30,
          weeklyResetsAt: "2026-09-29T00:00:00.000Z",
          readAt: "2026-09-23T10:00:00.000Z",
        },
      ],
    });
  });

  it("narrows the counts to one channel, a project without a channel row being the default's", async () => {
    const { app } = harness();
    const since = encodeURIComponent("2026-09-21T00:00:00.000Z");
    const mine = await (
      await app.request(`/api/home/week?since=${since}&channelId=${other}`)
    ).json();
    expect(mine).toMatchObject({ videos: 1, calls: 1, cost: 0, unpriced: 1, apiEquivalent: null });
    const fallback = await (
      await app.request(`/api/home/week?since=${since}&channelId=${defaultChannelId}`)
    ).json();
    expect(fallback).toMatchObject({ videos: 1, calls: 2, cost: 1.5, apiEquivalent: 2.25 });
  });

  it("counts calls made for a schedule or channel, under the channel they were made for", async () => {
    const { app, db } = harness();
    const standalone = (
      id: string,
      owner: string,
      channel: string,
      onPlan: number,
      cost: string,
      api: string,
      reading: string | null,
    ) =>
      db
        .prepare(
          `INSERT INTO standalone_usage (id, owner_kind, owner_id, channel_id, purpose, kind, provider, model, wall_ms, on_plan, cost, api_cost, account, reading_json, created_at)
           VALUES (?,?,?,?,'topics','llm','codex','gpt',1,?,${cost},${api},?,?,'2026-09-24T10:00:00.000Z')`,
        )
        .run(
          id,
          owner.split(":")[0] ?? "",
          owner.split(":")[1] ?? "",
          channel,
          onPlan,
          reading === null ? null : "codex",
          reading,
        );
    standalone(
      "s1",
      "schedule:sch1",
      other,
      1,
      "0",
      "0.75",
      '{"after":[{"kind":"weekly","usedPercent":55,"resetsAt":null}]}',
    );
    standalone("s2", "channel:gone", "a-deleted-channel", 0, "0.5", "NULL", null);
    const since = encodeURIComponent("2026-09-21T00:00:00.000Z");
    const all = await (await app.request(`/api/home/week?since=${since}`)).json();
    expect(all).toMatchObject({
      calls: 5,
      cost: 2,
      unpriced: 1,
      apiEquivalent: 3,
      plans: [{ account: "codex", weeklyPercent: 55, readAt: "2026-09-24T10:00:00.000Z" }],
    });
    const mine = await (
      await app.request(`/api/home/week?since=${since}&channelId=${other}`)
    ).json();
    expect(mine).toMatchObject({ videos: 1, calls: 2, cost: 0, unpriced: 1, apiEquivalent: 0.75 });
    // A deleted channel's calls count under the default channel, as its projects do.
    const fallback = await (
      await app.request(`/api/home/week?since=${since}&channelId=${defaultChannelId}`)
    ).json();
    expect(fallback).toMatchObject({ videos: 1, calls: 3, cost: 2, apiEquivalent: 2.25 });
  });

  it("refuses a request without a start", async () => {
    const { app } = harness();
    expect((await app.request("/api/home/week")).status).toBe(400);
  });
});

describe("PUT /api/projects/:id/uploaded", () => {
  const put = (app: Hono, id: string, uploaded: boolean) =>
    app.request(`/api/projects/${id}/uploaded`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploaded }),
    });

  it("marks a project uploaded once, keeps the first time, and undoes it", async () => {
    const { app, db } = harness();
    const first = await put(app, "p1", true);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ uploadedAt: "2026-09-27T10:00:00.000Z" });
    expect(await (await put(app, "p1", true)).json()).toEqual({
      uploadedAt: "2026-09-27T10:00:00.000Z",
    });
    expect(uploadedProjects(db).get("p1")).toBe("2026-09-27T10:00:00.000Z");
    expect(await (await put(app, "p1", false)).json()).toEqual({ uploadedAt: null });
    expect(uploadedProjects(db).has("p1")).toBe(false);
  });

  it("says a missing project no longer exists", async () => {
    const { app } = harness();
    const response = await put(app, "gone", true);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      detail: "This project no longer exists. Go back to Projects to pick another.",
    });
  });

  it("goes with its project", async () => {
    const { app, db } = harness();
    await put(app, "p1", true);
    db.exec("DELETE FROM projects WHERE id='p1'");
    expect(uploadedProjects(db).size).toBe(0);
  });
});
