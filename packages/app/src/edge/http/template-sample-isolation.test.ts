import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ulidIds } from "../../kernel/ids.js";
import { attachSamples } from "../../kernel/paths.js";
import { insertProject } from "../../slices/admission/repo.js";
import { weeklyReport } from "../../slices/autopilot/weekly.js";
import { keywordFactsFor } from "../../slices/keywords/facts.js";
import { draftFixture } from "../../slices/play-drafts/draft.fake.js";
import { createTemplate } from "../../slices/project-templates/service.js";
import { weekSummary } from "../../slices/run-cost/week.js";
import { calendarRange } from "../../slices/schedules/agenda.js";
import { knownTitles } from "../../slices/schedules/topics.js";
import { makePaidSample } from "../../slices/template-studio/paid.js";
import { sampleOf, sampleProjects } from "../../slices/template-studio/repo.js";
import { paidDocument, paidSampleDeps } from "../../slices/template-studio/studio.fake.js";
import { connectAgent, mcpFixture } from "../mcp/mcp.fake.js";

// A template's hidden sample project is the studio's alone: no list, count or feed the user
// sees may name it. Every GET route of the API is asked, so a route added later that lists
// projects fails here until it leaves the samples out (`notTemplateSample`).

const sampleId = "tsample0zebrakite";
const sampleTitle = "Zebra kite lantern sample";
// A model bake-off's copy of the sample is hidden the same way.
const cloneId = "tclone00zebrakite";
const cloneTitle = "Zebra kite lantern bake-off copy";
const leaksIn = (body: string): boolean =>
  body.includes(sampleId) ||
  body.includes(sampleTitle) ||
  body.includes(cloneId) ||
  body.includes(cloneTitle);
const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

function withSample() {
  // Library → Designs too, so its routes are asked as well.
  const h = mcpFixture({ designs: true });
  open.push(h);
  const drafts = draftFixture();
  open.push(drafts);
  const templateId = randomUUID();
  const created = createTemplate(
    { ...h.deps, uuid: randomUUID },
    { id: templateId, name: "Show", document: drafts.document },
  );
  if (!created.ok) throw new Error(created.reason);
  const at = h.deps.clock.now().toISOString();
  const db = h.deps.db;
  for (const [id, title] of [
    [sampleId, sampleTitle],
    [cloneId, cloneTitle],
    ["visible0control", "Visible control project"],
  ] as const) {
    insertProject(db, {
      id,
      title,
      format: "16:9",
      config: {
        title,
        format: "16:9",
        sources: {
          research: "off",
          article: "generate",
          audio: "off",
          images: "off",
          thumbnail: "off",
          video: "off",
        },
        imagePrompts: [],
        values: {},
        provided: {},
        silenceGapSeconds: 0,
        imageSeconds: 15,
        zoomPercent: 22.5,
        motionStyle: "zoom",
        edgeSilenceSeconds: 0,
        rendered: {},
      },
      createdAt: at,
      updatedAt: at,
    });
    mkdirSync(join(h.deps.paths.projects, id), { recursive: true });
    db.prepare(
      "INSERT INTO stages (id,project_id,kind,source,state,failure_reason,finished_at) VALUES (?,?,'article','generate','failed','The model refused.','2026-09-10T00:00:00.000Z')",
    ).run(`${id}-article`, id);
    db.prepare(
      "INSERT INTO provider_usage (id,project_id,stage,kind,provider,model,wall_ms,cost,created_at) VALUES (?,?,'article','llm','openrouter','m',10,0.5,?)",
    ).run(`${id}-usage`, id, at);
  }
  db.prepare(
    "INSERT INTO template_samples (template_id,project_id,topic,topic_source,full_script,created_at) VALUES (?,?,'The history of the lighthouse','fixed',0,?)",
  ).run(templateId, sampleId, at);
  db.prepare(
    "INSERT INTO template_bakeoffs (id,template_id,template_version,section,ack_high,state,created_at,updated_at) VALUES ('bake1',?,1,'script',1,'done',?,?)",
  ).run(templateId, at, at);
  db.prepare(
    "INSERT INTO template_bakeoff_clones (bakeoff_id,slot,provider,model,project_id,state) VALUES ('bake1',0,'openrouter','m',?,'done')",
  ).run(cloneId);
  return { ...h, templateId };
}

function getRoutes(app: ReturnType<typeof mcpFixture>["app"]): readonly string[] {
  return [
    ...new Set(
      app.routes
        .filter(
          (row) =>
            row.method === "GET" &&
            row.path.startsWith("/api/") &&
            !row.path.includes(":") &&
            !row.path.includes("*") &&
            !row.path.startsWith("/api/events/"),
        )
        .map((row) => row.path),
    ),
    // Routes that answer only with a query or an id, asked with one.
    `/api/home/week?since=${encodeURIComponent("2026-01-01T00:00:00.000Z")}`,
    "/api/keywords/facts/visible0control",
  ];
}

describe("the template studio's sample project", () => {
  it("is named by no GET route of the API", async () => {
    const h = withSample();
    const routes = getRoutes(h.app);
    expect(routes.length).toBeGreaterThan(40);
    const leaks: string[] = [];
    for (const route of routes) {
      const body = await (await h.app.request(route)).text();
      if (leaksIn(body)) leaks.push(route);
    }
    expect(leaks).toEqual([]);
    const listed = await (await h.app.request("/api/projects")).text();
    expect(listed).toContain("visible0control");
  });

  it("is left out of the calendar, the weekly report, topic scoring and keyword facts", () => {
    const h = withSample();
    const { db } = h.deps;
    // Both projects made a video this week, so a count that took the sample would say 2.
    for (const id of [sampleId, cloneId, "visible0control"])
      db.prepare(
        "INSERT INTO outputs (id,project_id,stage_kind,role,path,bytes,created_at) VALUES (?,?,'video','video','v.mp4',1,'2026-09-10T00:00:00.000Z')",
      ).run(`${id}-video`, id);
    const calendar = calendarRange(
      { db, clock: h.deps.clock, template: () => undefined },
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-10-01T00:00:00.000Z"),
    );
    if (!calendar.ok) throw new Error(calendar.reason);
    const shown = calendar.value.projects.map((one) => one.id);
    expect(shown).toContain("visible0control");
    expect(shown).not.toContain(sampleId);
    expect(shown).not.toContain(cloneId);
    const failed = weeklyReport(db, "2026-01-01T00:00:00.000Z", "2026-12-31T00:00:00.000Z").failed;
    expect(failed.map((one) => one.projectId)).toContain("visible0control");
    expect(failed.map((one) => one.projectId)).not.toContain(sampleId);
    expect(failed.map((one) => one.projectId)).not.toContain(cloneId);
    expect(weekSummary(db, "2026-01-01T00:00:00.000Z").videos).toBe(1);
    const covered = knownTitles(h.deps, randomUUID()).projects;
    expect(covered).toContain("Visible control project");
    expect(covered).not.toContain(sampleTitle);
    expect(covered).not.toContain(cloneTitle);
    const factsNow = () =>
      keywordFactsFor(
        h.deps,
        { channelId: undefined, useBrandKit: false, title: "Next one" },
        h.deps.clock.now(),
      );
    const facts = factsNow();
    expect(facts.coveredBefore).toContain("Visible control project");
    expect(facts.coveredBefore).not.toContain(sampleTitle);
    expect(facts.coveredBefore).not.toContain(cloneTitle);
    expect(facts.previousVideo?.title).not.toBe(sampleTitle);
    // The episode number is the same as with no sample at all.
    db.prepare("DELETE FROM template_samples WHERE project_id=?").run(sampleId);
    db.prepare("DELETE FROM template_bakeoff_clones WHERE project_id=?").run(cloneId);
    for (const id of [sampleId, cloneId])
      db.prepare("INSERT INTO project_trash (project_id,deleted_at) VALUES (?,?)").run(
        id,
        "2026-09-10T00:00:00.000Z",
      );
    expect(factsNow().episode).toBe(facts.episode);
  });

  it("is named by no GET route once it is in the trash either", async () => {
    const h = withSample();
    h.deps.db
      .prepare(
        "INSERT INTO project_trash (project_id,deleted_at) VALUES (?,'2026-09-10T00:00:00.000Z'),('visible0control','2026-09-10T00:00:00.000Z')",
      )
      .run(sampleId);
    h.deps.db
      .prepare(
        "INSERT INTO project_trash (project_id,deleted_at) VALUES (?,'2026-09-10T00:00:00.000Z')",
      )
      .run(cloneId);
    const leaks: string[] = [];
    for (const route of getRoutes(h.app)) {
      const body = await (await h.app.request(route)).text();
      if (leaksIn(body)) leaks.push(route);
    }
    expect(leaks).toEqual([]);
    expect(await (await h.app.request("/api/trash")).text()).toContain("visible0control");
  });

  it("is named by no GET route, and has no folder in Projects, once the studio made it for real", async () => {
    const h = mcpFixture();
    open.push(h);
    attachSamples(h.deps.paths, sampleProjects(h.deps.db, h.deps.paths.dataDir));
    // Ids as long as a real install's, so a match is the sample and never a short counter.
    const { review, paid } = paidSampleDeps({ ...h.deps, ids: ulidIds });
    const templateId = randomUUID();
    const created = createTemplate(
      { ...h.deps, uuid: randomUUID },
      { id: templateId, name: "Show", document: paidDocument(review) },
    );
    if (!created.ok) throw new Error(created.reason);
    const before = readdirSync(h.deps.paths.projects).sort();
    await makePaidSample(
      paid,
      { templateId, templateVersion: 1, ackHigh: 5, kind: "save", requestedAt: "a" },
      new AbortController().signal,
    );
    const sample = sampleOf(h.deps.db, templateId);
    if (sample === undefined) throw new Error("The studio made no sample.");
    const title = "History: The history of the lighthouse";
    expect(
      h.deps.db.prepare("SELECT title FROM projects WHERE id=?").get(sample.projectId),
    ).toEqual({
      title,
    });
    const leaks: string[] = [];
    for (const route of getRoutes(h.app)) {
      const body = await (await h.app.request(route)).text();
      if (body.includes(sample.projectId) || body.includes(title)) leaks.push(route);
    }
    expect(leaks).toEqual([]);
    expect(readdirSync(h.deps.paths.projects).sort()).toEqual(before);
    const agent = await connectAgent(h.app);
    const attention = await agent.callTool({ name: "needs_attention", arguments: {} });
    expect(JSON.stringify(attention.content)).not.toContain(sample.projectId);
  });

  it("refuses every change through the project routes, naming the studio to use instead", async () => {
    const h = withSample();
    for (const [method, path] of [
      ["POST", `/api/projects/${sampleId}/pause`],
      ["PUT", `/api/projects/${sampleId}/title`],
      ["DELETE", `/api/projects/${sampleId}`],
      ["POST", `/api/projects/${sampleId}/rebuild`],
      ["POST", `/api/projects/${cloneId}/pause`],
      ["DELETE", `/api/projects/${cloneId}`],
    ] as const) {
      const reply = await h.app.request(path, {
        method,
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect([method, path, reply.status]).toEqual([method, path, 409]);
      expect(await reply.json()).toMatchObject({
        reason: "template-sample",
        detail:
          "This is the studio sample of Show. Change the template in its studio instead: Library → Templates → Show → Open studio.",
      });
    }
    const visible = await h.app.request("/api/projects/visible0control/pause", { method: "POST" });
    expect(visible.status).not.toBe(409);
  });
});
