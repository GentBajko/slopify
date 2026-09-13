import { stageKinds } from "@app/kernel/pipeline.js";
import type { CheckpointStatus as ServerCheckpointStatus } from "@app/slices/checkpoints/change.js";
import type { CheckpointRefusal } from "@app/slices/checkpoints/model.js";
import { checkpointApprovalSchema, checkpointRowSchema } from "@app/slices/checkpoints/schema.js";
import { z } from "zod";
import type { Api } from "@/api";
import { errorOf } from "@/http";

const statusSchema = z.object({
  revisionId: z.string(),
  checkpoints: z.array(
    checkpointRowSchema.unwrap().extend({
      currentFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      dependents: z.array(z.enum(stageKinds)),
      workKeys: z.array(z.string()),
    }),
  ),
}) satisfies z.ZodType<ServerCheckpointStatus>;
export type CheckpointStatus = z.infer<typeof statusSchema>;
export type CheckpointGate = CheckpointStatus["checkpoints"][number];
export interface ApprovalIdentity {
  readonly revisionId: string;
  readonly fingerprint: string;
  readonly idempotencyKey: string;
}
export type CheckpointReply<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: CheckpointRefusal; readonly message: string };
const problemSchema = z.object({
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  reason: z.enum(["duplicate", "not-found", "conflict", "invalid-input"]).optional(),
});
const approvalSchema = checkpointApprovalSchema
  .unwrap()
  .omit({ projectId: true, checkpointId: true, approvedAt: true });
export const checkpointKey = (projectId: string): readonly string[] => ["checkpoints", projectId];
export const checkpointRevisionKey = (projectId: string, revisionId: string): readonly string[] => [
  ...checkpointKey(projectId),
  revisionId,
];

async function reply<T>(response: Response, schema: z.ZodType<T>): Promise<CheckpointReply<T>> {
  const raw: unknown = await response.json();
  if (response.ok) return { ok: true, value: schema.parse(raw) };
  const problem = problemSchema.safeParse(raw);
  if (!problem.success) throw errorOf(response, undefined);
  if (![400, 404, 409].includes(response.status))
    throw new Error(problem.data.detail ?? problem.data.title);
  return {
    ok: false,
    reason: problem.data.reason ?? "invalid-input",
    message: problem.data.detail ?? problem.data.title,
  };
}
export async function checkpointStatus(api: Api, projectId: string) {
  return reply(
    await api.fetch(`${api.origin}/api/projects/${encodeURIComponent(projectId)}/checkpoints`),
    statusSchema,
  );
}
export async function approveCheckpoint(
  api: Api,
  projectId: string,
  checkpointId: string,
  identity: ApprovalIdentity,
) {
  return reply(
    await api.fetch(
      `${api.origin}/api/projects/${encodeURIComponent(projectId)}/checkpoints/${encodeURIComponent(checkpointId)}/approve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(approvalSchema.parse(identity)),
      },
    ),
    z.object({ checkpoint: checkpointRowSchema, replayed: z.boolean() }),
  );
}
