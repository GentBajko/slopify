import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { fingerprint } from "../../kernel/runner/work.js";
import { readSetting, writeSetting } from "./repo.js";

export const tutorialSessionSchema = z
  .object({
    schemaVersion: z.literal(1),
    active: z.boolean(),
    stepId: z.enum([
      "text-key",
      "audio-key",
      "image-key",
      "voice",
      "article-name",
      "article-body",
      "article-keywords",
      "article-save",
      "image-prompt",
      "image-save",
      "play-options",
      "play-article",
      "play-keywords",
      "play-audio",
      "play-images",
      "play-video",
      "play-subtitles",
      "play-start",
      "project",
      "download",
    ]),
    articleId: z.string().optional(),
    imageId: z.string().optional(),
    projectId: z.string().optional(),
  })
  .strict();
export const tutorialWriteSchema = z
  .object({
    baseVersion: z.number().int().nonnegative(),
    mutationId: z.uuid(),
    session: tutorialSessionSchema,
  })
  .strict();
export type TutorialSession = Readonly<z.infer<typeof tutorialSessionSchema>>;
export type TutorialWrite = Readonly<z.infer<typeof tutorialWriteSchema>>;
export type TutorialView = {
  readonly version: number;
  readonly session: TutorialSession;
  readonly readable: boolean;
};
export type TutorialSaveResult =
  | { readonly ok: true; readonly value: TutorialView }
  | { readonly ok: false; readonly reason: "conflict" | "unreadable" };

const recordSchema = z
  .object({
    version: z.number().int().positive(),
    session: tutorialSessionSchema,
    mutationId: z.uuid(),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

function readRecord(db: DatabaseSync) {
  const raw = readSetting(db, "tutorial.session");
  if (raw === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
  const result = recordSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function readTutorial(db: DatabaseSync): TutorialView {
  const record = readRecord(db);
  return {
    version: record?.version ?? 0,
    session: record?.session ?? { schemaVersion: 1, active: false, stepId: "text-key" },
    readable: record !== null,
  };
}

export function saveTutorial(db: DatabaseSync, input: TutorialWrite): TutorialSaveResult {
  const parsed = tutorialWriteSchema.parse(input);
  const { baseVersion, session, mutationId } = parsed;
  const requestHash = fingerprint(z.json().parse(JSON.parse(JSON.stringify(parsed))));
  return transact(db, () => {
    const current = readRecord(db);
    if (current === null) return { ok: false, reason: "unreadable" };
    if (current?.mutationId === mutationId) {
      return current.requestHash === requestHash
        ? {
            ok: true,
            value: { version: current.version, session: current.session, readable: true },
          }
        : { ok: false, reason: "conflict" };
    }
    if ((current?.version ?? 0) !== baseVersion || baseVersion === Number.MAX_SAFE_INTEGER)
      return { ok: false, reason: "conflict" };
    const next = { version: baseVersion + 1, session, mutationId, requestHash };
    writeSetting(db, "tutorial.session", JSON.stringify(next));
    return { ok: true, value: { version: next.version, session, readable: true } };
  });
}

export function resetTutorial(db: DatabaseSync): void {
  transact(db, () => {
    db.prepare("DELETE FROM settings WHERE key = ?").run("tutorial.session");
  });
}
