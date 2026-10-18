import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { insertProject } from "../../slices/admission/repo.js";
import { draftFixture } from "../../slices/play-drafts/draft.fake.js";
import { createTemplate } from "../../slices/project-templates/service.js";
import { mcpFixture } from "../mcp/mcp.fake.js";

// A template's hidden sample project is the studio's alone: no list, count or feed the user
// sees may name it. Every GET route of the API is asked, so a route added later that lists
// projects fails here until it leaves the samples out (`notTemplateSample`).

const sampleId = "tsample0zebrakite";
const sampleTitle = "Zebra kite lantern sample";
const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

function withSample() {
  const h = mcpFixture();
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
      if (body.includes(sampleId) || body.includes(sampleTitle)) leaks.push(route);
    }
    expect(leaks).toEqual([]);
    const listed = await (await h.app.request("/api/projects")).text();
    expect(listed).toContain("visible0control");
  });

  it("is named by no GET route once it is in the trash either", async () => {
    const h = withSample();
    h.deps.db
      .prepare(
        "INSERT INTO project_trash (project_id,deleted_at) VALUES (?,'2026-09-10T00:00:00.000Z'),('visible0control','2026-09-10T00:00:00.000Z')",
      )
      .run(sampleId);
    const leaks: string[] = [];
    for (const route of getRoutes(h.app)) {
      const body = await (await h.app.request(route)).text();
      if (body.includes(sampleId) || body.includes(sampleTitle)) leaks.push(route);
    }
    expect(leaks).toEqual([]);
    expect(await (await h.app.request("/api/trash")).text()).toContain("visible0control");
  });

  it("refuses every change through the project routes, naming the studio to use instead", async () => {
    const h = withSample();
    for (const [method, path] of [
      ["POST", `/api/projects/${sampleId}/pause`],
      ["PUT", `/api/projects/${sampleId}/title`],
      ["DELETE", `/api/projects/${sampleId}`],
      ["POST", `/api/projects/${sampleId}/rebuild`],
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
