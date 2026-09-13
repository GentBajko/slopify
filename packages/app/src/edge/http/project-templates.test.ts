import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { expect, it } from "vitest";
import { draftFixture } from "../../slices/play-drafts/draft.fake.js";
import { projectTemplateRoutes } from "./project-templates.js";

it("exposes versioned CRUD and creates a draft without starting work", async () => {
  const h = draftFixture();
  try {
    const app = new Hono().route("/api/project-templates", projectTemplateRoutes(h.deps));
    const send = (path: string, method: string, body: unknown) =>
      app.request(`/api/project-templates${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const id = randomUUID();
    expect((await send("", "POST", { id, name: "Show", document: h.document })).status).toBe(201);
    expect((await app.request("/api/project-templates")).status).toBe(200);
    expect(await (await app.request(`/api/project-templates/${id}`)).json()).toMatchObject({
      id,
      version: 1,
    });
    expect(
      (
        await send(`/${id}`, "PUT", {
          baseVersion: 1,
          mutationId: randomUUID(),
          name: "New",
          document: h.document,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await send(`/${id}`, "PUT", {
          baseVersion: 1,
          mutationId: randomUUID(),
          name: "Stale",
          document: h.document,
        })
      ).status,
    ).toBe(409);
    const draft = await send(`/${id}/instantiate`, "POST", { id: randomUUID(), version: 1 });
    expect(draft.status).toBe(201);
    expect(await draft.json()).toMatchObject({
      review: null,
      start: null,
      draft: { document: { templateSource: { id, version: 1 } } },
    });
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM projects").get()?.n).toBe(0);
    expect((await send(`/${id}`, "DELETE", { baseVersion: 2 })).status).toBe(200);
    expect((await app.request(`/api/project-templates/${id}`)).status).toBe(404);
    expect(
      (
        await send("", "POST", {
          id: randomUUID(),
          name: "Invalid",
          document: h.document,
          credentials: {},
        })
      ).status,
    ).toBe(400);
  } finally {
    h.close();
  }
});
