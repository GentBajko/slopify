import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { notReadySentence } from "../template-studio/schedule-gate.js";
import type { AttentionEntry } from "./attention.js";
import { rowsOf, type SkipRow } from "./attention-work.js";

const scheduleRow = z.object({ id: z.string(), name: z.string(), template_id: z.string() });

// An active schedule whose gated template has no version it may run skips every run until the
// person marks one ready: the agent reports it. The gate keeps no time it began, so it is dated
// when it is read.
export function templatesNotReady(
  db: DatabaseSync,
  now: Date,
  skip: SkipRow,
  notReady: (templateId: string) => string | undefined = (id) => notReadySentence(db, id),
): readonly AttentionEntry[] {
  const rows = db
    .prepare(
      "SELECT id, name, template_id FROM schedules WHERE deleted_at IS NULL AND status='active' AND template_kind='project' ORDER BY lower(name), id",
    )
    .all();
  return rowsOf(rows, "schedules", skip, (value) => {
    const row = scheduleRow.parse(value);
    const sentence = notReady(row.template_id);
    return sentence === undefined
      ? []
      : [
          {
            kind: "template-not-ready",
            since: now.toISOString(),
            projectId: null,
            title: row.name,
            stage: null,
            itemKey: null,
            reason: `${sentence} Marking a version ready is the person's: report it.`,
            autoRetryInFlight: false,
            agentCanAct: false,
            ids: { id: row.id, templateId: row.template_id },
            tools: ["get_schedule", "get_template_checks"],
          } satisfies AttentionEntry,
        ];
  });
}
