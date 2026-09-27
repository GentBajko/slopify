import type { DatabaseSync } from "node:sqlite";
import { readSetting, writeSetting } from "../settings/repo.js";
import type { Prompt } from "./model.js";
import { promptById, promptByName } from "./repo.js";

// An Image prompt's "Draws photorealistic pictures" tick (Library → Prompts → the prompt).
// Pictures an image model draws in such a style can pass for real scenes, which is YouTube's
// third AI use case (`slices/studio/disclosure.ts`); a stylised, painterly or illustrated
// style can't, so the tick is off unless the person sets it. One row of the key/value
// `settings` table holds the ticked prompts' ids, so the flag needs no column of its own, keeps
// through edits and renames, and travels with a backup. A prompt in the trash keeps its tick
// for when it is restored.

export const photorealisticPromptsKey = "library.photorealisticPrompts";

export function photorealisticPromptIds(db: DatabaseSync): ReadonlySet<string> {
  const stored = readSetting(db, photorealisticPromptsKey);
  if (stored === undefined) return new Set();
  try {
    const value: unknown = JSON.parse(stored);
    return new Set(
      Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : [],
    );
  } catch {
    return new Set();
  }
}

// The prompts as the Library lists them, the ticked ones marked.
export function withPhotorealistic(
  db: DatabaseSync,
  prompts: readonly Prompt[],
): readonly (Prompt & { readonly photorealistic?: true })[] {
  const ticked = photorealisticPromptIds(db);
  return prompts.map((prompt) =>
    ticked.has(prompt.id) ? { ...prompt, photorealistic: true } : prompt,
  );
}

export type PhotorealisticResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "not-found" | "not-an-image-prompt" };

export function setPromptPhotorealistic(
  db: DatabaseSync,
  id: string,
  on: boolean,
): PhotorealisticResult {
  const prompt = promptById(db, id);
  if (prompt === undefined) return { ok: false, reason: "not-found" };
  if (prompt.kind !== "image") return { ok: false, reason: "not-an-image-prompt" };
  const others = [...photorealisticPromptIds(db)].filter((one) => one !== id);
  const next = on ? [...others, id].sort() : others;
  if (next.length === 0)
    db.prepare("DELETE FROM settings WHERE key = ?").run(photorealisticPromptsKey);
  else writeSetting(db, photorealisticPromptsKey, JSON.stringify(next));
  return { ok: true };
}

// Whether the Image prompt a project names draws photorealistic pictures. A name the Library
// no longer has (deleted or renamed since) is not ticked.
export function namesPhotorealisticPrompt(db: DatabaseSync, name: string | undefined): boolean {
  if (name === undefined || name.trim() === "") return false;
  const prompt = promptByName(db, "image", name.trim());
  return prompt !== undefined && photorealisticPromptIds(db).has(prompt.id);
}
