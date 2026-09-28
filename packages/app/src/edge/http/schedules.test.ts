import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { expect, it } from "vitest";
import { startFixture } from "../../slices/play-drafts/draft.fake.js";
import { templateById } from "../../slices/project-templates/repo.js";
import { createTemplate } from "../../slices/project-templates/service.js";
import { scheduleRoutes } from "./schedules.js";

it("refuses a topic naming a keyword the template doesn't use with a 400 naming it", async () => {
  const h = startFixture();
  try {
    const templateId = randomUUID();
    const document = {
      ...h.document,
      form: { ...h.document.form, title: "Lore: {{Topic}}", values: { Topic: "" } },
    };
    expect(createTemplate(h.deps, { id: templateId, name: "Lore", document }).ok).toBe(true);
    const deps = {
      ...h.deps,
      template: (id: string) => templateById(h.deps.db, id),
    };
    const response = await scheduleRoutes(deps).request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: randomUUID(),
        name: "Nightly lore",
        templateId,
        templateVersion: 1,
        cadence: { kind: "daily", time: "09:00" },
        timezone: "UTC",
        items: [{ title: "Hypatia", values: { Colour: "red" } }],
        topicKeyword: "Topic",
      }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { detail: string; reason: string };
    expect(body.reason).toBe("invalid-topics");
    expect(body.detail).toBe(
      "The schedule wasn't saved. Topic 1 (Hypatia): “Colour” is not a keyword of this template (its keywords are “Topic”). Rename it to one of them or remove it.",
    );
  } finally {
    h.close();
  }
});

it("creates, reads and pauses a schedule through the HTTP contract", async () => {
  const h = startFixture();
  try {
    const templateId = randomUUID();
    expect(
      createTemplate(h.deps, { id: templateId, name: "Stories", document: h.document }).ok,
    ).toBe(true);
    const deps = {
      ...h.deps,
      template: (id: string) => templateById(h.deps.db, id),
    };
    const app = new Hono().route("/api/schedules", scheduleRoutes(deps));
    const id = randomUUID();
    const body = {
      id,
      name: "Weekday stories",
      templateId,
      templateVersion: 1,
      cadence: { kind: "daily", time: "00:01" },
      timezone: "UTC",
      missedPolicy: "skip",
      overlapPolicy: "skip",
      spendLimitCents: null,
      items: [],
    };
    const created = await app.request("/api/schedules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      id,
      nextRunAt: "2026-09-12T00:01:00.000Z",
      deletedAt: null,
    });
    expect((await app.request("/api/schedules")).status).toBe(200);
    expect((await app.request(`/api/schedules/${id}`)).status).toBe(200);
    const paused = await app.request(`/api/schedules/${id}/pause`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseVersion: 1 }),
    });
    expect(paused.status).toBe(200);
    expect(await paused.json()).toMatchObject({ id, status: "paused", version: 2 });
    const stale = await app.request(`/api/schedules/${id}/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseVersion: 1 }),
    });
    expect(stale.status).toBe(409);
  } finally {
    h.close();
  }
});
