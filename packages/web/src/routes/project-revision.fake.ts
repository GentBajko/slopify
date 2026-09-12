import type { RevisionView } from "@app/slices/revisions/model.js";
import { revisionViewSchema, saveRevisionSchema } from "@app/slices/revisions/schema.js";
import { vi } from "vitest";
import { revisionView } from "@/project/revision-fixture";
import { type Answer, jsonAnswer } from "@/test-app";
import { type body, deps } from "./project-fixtures.js";

export function revisionRouteFixture(original: ReturnType<typeof body>): {
  readonly app: ReturnType<typeof deps>;
  readonly routes: Readonly<Record<string, Answer>>;
  readonly save: ReturnType<typeof vi.fn<Answer>>;
  readonly start: ReturnType<typeof vi.fn<Answer>>;
  readonly view: () => RevisionView;
} {
  const base = revisionView();
  let view = revisionViewSchema.parse({
    ...base,
    revision: {
      ...base.revision,
      config: original.project.config,
      content: { ...base.revision.content, promptTemplates: { article: null } },
    },
  });
  const save = vi.fn<Answer>(async (request) => {
    const input = saveRevisionSchema.parse(await request.json());
    view = {
      ...view,
      revision: {
        ...view.revision,
        id: "r2",
        parentId: view.revision.id,
        config: input.edit.config,
        content: input.edit.content,
      },
    };
    return jsonAnswer({ ok: true, view, duplicate: false })(request);
  });
  const start = vi.fn<Answer>(jsonAnswer({ title: "Not expected", status: 409 }, 409));
  const routes: Readonly<Record<string, Answer>> = {
    "GET /api/projects/p1": (request) =>
      jsonAnswer({
        ...original,
        revisionId: view.revision.id,
        project: {
          ...original.project,
          title: view.revision.config.title,
          config: view.revision.config,
        },
      })(request),
    "GET /api/projects/p1/revisions/r1": (request) => jsonAnswer({ view })(request),
    "GET /api/projects/p1/revisions/r2": (request) => jsonAnswer({ view })(request),
    "POST /api/projects/p1/revisions/prepare": (request) =>
      jsonAnswer({ ok: true, view, created: false })(request),
    "POST /api/projects/p1/revisions": save,
    "POST /api/projects/p1/rebuild": start,
    "GET /api/entries": jsonAnswer({ entries: [] }),
    ...Object.fromEntries(
      ["openrouter", "elevenlabs", "fal", "cartesia", "claude-code", "google-image"].map((id) => [
        `GET /api/providers/${id}/models`,
        jsonAnswer({ models: [], allowsCustom: true }),
      ]),
    ),
  };
  return { app: deps(routes), routes, save, start, view: () => view };
}
