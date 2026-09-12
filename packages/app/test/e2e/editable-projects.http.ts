import { DatabaseSync } from "node:sqlite";
import { expect } from "vitest";
import { z } from "zod";
import { projectStates, stageKinds, stageStates } from "../../src/kernel/pipeline.js";
import type { Boot } from "../../src/main.js";
import { runConfigSchema } from "../../src/slices/admission/schema.js";
import { rebuildAdmissionSchema, rebuildPreviewSchema } from "../../src/slices/rebuild/model.js";
import type { BaselineResult, RevisionView } from "../../src/slices/revisions/model.js";
import { baselineSuccessSchema, revisionViewSchema } from "../../src/slices/revisions/schema.js";
import { outputSchema, stagedFileSchema } from "../../src/slices/storage/schema.js";
import { projectId } from "./editable-projects.fixture.js";

export const projectPath = `/api/projects/${projectId}`;
export const currentPath = `/files/${projectId}/audio-export`;
export const projectBodySchema = z.object({
  project: z.object({ title: z.string(), config: runConfigSchema, status: z.enum(projectStates) }),
  revisionId: z.string().nullable(),
  stages: z.array(
    z.object({
      kind: z.enum(stageKinds),
      state: z.enum(stageStates),
      failureReason: z.string().nullable(),
    }),
  ),
  outputs: z.array(outputSchema),
});
export const previewSuccessSchema = z.object({ ok: z.literal(true), value: rebuildPreviewSchema });
export const admissionSuccessSchema = z.object({
  ok: z.literal(true),
  value: rebuildAdmissionSchema,
});
export const stagingListSchema = z.object({ files: z.array(stagedFileSchema) });

export async function request<T>(
  app: Boot,
  path: string,
  schema: z.ZodType<T>,
  options: RequestInit = {},
  status = 200,
): Promise<T> {
  const response = await fetch(app.url + path, options);
  const raw: unknown = await response.json();
  expect(response.status, JSON.stringify(raw)).toBe(status);
  return schema.parse(raw);
}

export function post<T>(
  app: Boot,
  path: string,
  schema: z.ZodType<T>,
  body: unknown,
  status = 200,
): Promise<T> {
  return request(
    app,
    path,
    schema,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    status,
  );
}

export function prepare(app: Boot): Promise<Extract<BaselineResult, { ok: true }>> {
  return post(app, `${projectPath}/revisions/prepare`, baselineSuccessSchema, {});
}

export async function revision(app: Boot, id: string): Promise<RevisionView> {
  return (
    await request(app, `${projectPath}/revisions/${id}`, z.object({ view: revisionViewSchema }))
  ).view;
}

export function wav(view: RevisionView): RevisionView["outputs"][number] {
  const selected = view.outputs.filter((one) => one.selected && one.output.role === "audio_export");
  expect(selected).toHaveLength(1);
  const output = selected[0];
  if (output === undefined) throw new Error("The revision has no selected WAV.");
  return output;
}

export function historyPath(view: RevisionView): string {
  return `/files/${projectId}/revisions/${view.revision.id}/${wav(view).recordId}`;
}

export async function download(app: Boot, path: string, filename: string): Promise<Buffer> {
  const response = await fetch(app.url + path);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("audio/wav");
  expect(response.headers.get("content-disposition")).toBe(`attachment; filename="${filename}"`);
  const bytes = Buffer.from(await response.arrayBuffer());
  expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
  expect(bytes.subarray(8, 12).toString()).toBe("WAVE");
  return bytes;
}

export function executionCounts(app: Boot): {
  readonly admissions: number;
  readonly attempts: number;
} {
  const db = new DatabaseSync(app.paths.db, { readOnly: true });
  try {
    return {
      admissions: Number(
        db.prepare("SELECT COUNT(*) AS n FROM rebuild_admissions WHERE project_id=?").get(projectId)
          ?.n,
      ),
      attempts: Number(
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM attempts JOIN stages ON stages.id=attempts.stage_id " +
              "WHERE stages.project_id=?",
          )
          .get(projectId)?.n,
      ),
    };
  } finally {
    db.close();
  }
}
