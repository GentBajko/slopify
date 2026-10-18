import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { draftFixture } from "../../slices/play-drafts/draft.fake.js";
import { createTemplate } from "../../slices/project-templates/service.js";
import { studioViewSchema } from "../../slices/template-studio/schema.js";
import { mcpFixture } from "../mcp/mcp.fake.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

it("answers a template's studio, and a plain 404 for one that doesn't exist", async () => {
  const h = mcpFixture();
  open.push(h);
  const drafts = draftFixture();
  open.push(drafts);
  const id = randomUUID();
  const created = createTemplate(
    { ...h.deps, uuid: randomUUID },
    { id, name: "Show", document: drafts.document },
  );
  expect(created.ok).toBe(true);
  const reply = await h.app.request(`/api/template-studio/${id}`);
  expect(reply.status).toBe(200);
  const view = studioViewSchema.parse(await reply.json());
  expect(view.template.name).toBe("Show");
  expect(view.gate).toBe("unchecked");

  const missing = await h.app.request(`/api/template-studio/${randomUUID()}`);
  expect(missing.status).toBe(404);
  expect(await missing.json()).toMatchObject({
    reason: "not-found",
    detail:
      "This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates.",
  });
  expect((await h.app.request("/api/template-studio/not-a-uuid")).status).toBe(400);
});
