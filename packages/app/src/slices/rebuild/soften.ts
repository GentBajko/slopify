import type { DatabaseSync } from "node:sqlite";
import type { StageKind } from "../../kernel/pipeline.js";
import type { Message } from "../../kernel/ports/llm.js";

// Soften and retry: an image prompt a content filter refused is reworded by the project's
// AI model, inside the image step's own run (so the call goes through the retry policy and
// the new wording streams onto the step's live panel), then drawn again. A request is kept
// per step until an image is made from the softened prompt.

// The steps of a stage whose last attempt a content filter refused, on the current run.
export function refusedKeys(db: DatabaseSync, projectId: string, stage: StageKind): string[] {
  return db
    .prepare(
      `SELECT DISTINCT p.work_key FROM revision_work_pieces p
       JOIN revision_work w ON w.id=p.work_id
       JOIN revision_work_reservations r ON r.work_id=w.id
       JOIN project_heads h ON h.project_id=r.project_id AND h.revision_id=r.revision_id
       WHERE w.project_id=? AND w.kind=? AND w.state='failed' AND p.state!='done'
       AND (SELECT a.outcome FROM attempts a WHERE a.work_piece_id=p.id ORDER BY a.rowid DESC LIMIT 1)='refusal'
       ORDER BY p.work_key`,
    )
    .all(projectId, stage)
    .map((row) => String(row.work_key));
}

export function requestSoftening(
  db: DatabaseSync,
  projectId: string,
  keys: readonly string[],
  at: string,
): void {
  for (const key of keys)
    db.prepare(
      "INSERT INTO prompt_softening(project_id,work_key,requested_at) VALUES (?,?,?) ON CONFLICT(project_id,work_key) DO UPDATE SET requested_at=excluded.requested_at",
    ).run(projectId, key, at);
}

export function softeningRequested(db: DatabaseSync, projectId: string, key: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM prompt_softening WHERE project_id=? AND work_key=?")
      .get(projectId, key) !== undefined
  );
}

export function clearSoftening(db: DatabaseSync, projectId: string, keys: readonly string[]): void {
  for (const key of keys)
    db.prepare("DELETE FROM prompt_softening WHERE project_id=? AND work_key=?").run(
      projectId,
      key,
    );
}

export function softenMessages(prompt: string): readonly Message[] {
  return [
    {
      role: "user",
      content: `An image generator's content filter refused the image prompt below. Rewrite it so it keeps the same scene, subject, composition and style but leaves out whatever a filter could flag: graphic violence, gore, nudity or sexual content, real people's names, weapons aimed at people, self-harm and hateful symbols. Describe such things indirectly or leave them out. Answer with the rewritten prompt only, no preamble and no quotes.

Prompt:
${prompt}`,
    },
  ];
}

// The model's answer, trimmed of the quotes and labels models add anyway.
export function softenedPrompt(answer: string): string {
  return answer
    .trim()
    .replace(/^(?:rewritten prompt|prompt)\s*:\s*/i, "")
    .replace(/^["“](.*)["”]$/s, "$1")
    .trim();
}
