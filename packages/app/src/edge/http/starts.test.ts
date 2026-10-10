import { Hono } from "hono";
import { afterEach, expect, it } from "vitest";
import { lastStarter } from "../../slices/agents/repo.js";
import { revisionFixture } from "../../slices/revisions/revision.fake.js";
import { agentBindings } from "./actor.js";
import { startRecorder } from "./starts.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

it("records whether the person or an agent started a project's work, and nothing for a pause", async () => {
  const h = revisionFixture();
  open.push(h);
  const app = new Hono()
    .use("/api/*", startRecorder(h.deps))
    .post("/api/projects/:id/resume", (c) => c.json({ ok: true }, 202))
    .post("/api/projects/:id/pause", (c) => c.json({ ok: true }))
    .post("/api/schedules/:id/topics/prepare", (c) =>
      c.json({ projectId: h.projectId, title: "Saved" }, 201),
    )
    .post("/api/drafts/:id/start", (c) =>
      c.json({ projectIds: [h.projectId], queue: [], replayed: false }, 201),
    );
  await app.request(`/api/projects/${h.projectId}/resume`, { method: "POST" }, agentBindings);
  expect(lastStarter(h.deps.db, h.projectId)).toBe("agent");
  await app.request(`/api/projects/${h.projectId}/pause`, { method: "POST" });
  expect(lastStarter(h.deps.db, h.projectId)).toBe("agent");
  await app.request("/api/drafts/d1/start", { method: "POST" });
  expect(lastStarter(h.deps.db, h.projectId)).toBe("person");
  await app.request("/api/schedules/s1/topics/prepare", { method: "POST" }, agentBindings);
  expect(lastStarter(h.deps.db, h.projectId)).toBe("agent");
});

it("logs a start it couldn't record with the project it was for, and still answers", async () => {
  const h = revisionFixture();
  open.push(h);
  const written: { readonly event: string; readonly fields: unknown }[] = [];
  h.deps.db.exec("DROP TABLE project_starts");
  const app = new Hono()
    .use(
      "/api/*",
      startRecorder({
        ...h.deps,
        log: { write: (_level, event, fields) => void written.push({ event, fields }) },
      }),
    )
    .post("/api/projects/:id/resume", (c) => c.json({ ok: true }, 202));
  const answer = await app.request(`/api/projects/${h.projectId}/resume`, { method: "POST" });
  expect(answer.status).toBe(202);
  expect(written).toEqual([
    {
      event: "project.start",
      fields: expect.objectContaining({ projectId: h.projectId }),
    },
  ]);
});
