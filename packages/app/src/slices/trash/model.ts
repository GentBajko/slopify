import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";

// Settings → Trash. Deleting a project, a Library prompt or intro/outro, a template or a
// schedule stamps it instead of removing it; it stays here this long, then the daily purge
// removes it for good (a project's folder with it).
export const trashDays = 30;
export const trashMs = trashDays * 24 * 60 * 60_000;

export const trashKinds = ["project", "prompt", "entry", "template", "schedule"] as const;
export type TrashKind = (typeof trashKinds)[number];

export const trashItemSchema = z.object({
  kind: z.enum(trashKinds),
  id: z.string(),
  name: z.string(),
  // What sort of prompt ("article", "image"…) or entry ("intro", "outro"); null otherwise.
  detail: z.string().nullable(),
  deletedAt: z.string(),
  // When the daily purge removes it for good.
  purgeAt: z.string(),
  daysLeft: z.number().int().nonnegative(),
});
export type TrashItem = z.infer<typeof trashItemSchema>;

export const restoredSchema = z.object({
  kind: z.enum(trashKinds),
  id: z.string(),
  name: z.string(),
  // The name it came back under when a live item had taken the old one meanwhile.
  renamedFrom: z.string().nullable(),
});
export type Restored = z.infer<typeof restoredSchema>;

export interface TrashDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly clock: Clock;
  readonly log: Log;
  // A project with a provider call in flight is never trashed or removed.
  readonly hasInflight?: ((projectId: string) => boolean) | undefined;
}

export type TrashRefusal =
  | "not-found"
  // A project whose run is still going: Cancel run first, as Delete always asked.
  | "running"
  // A project folder the OS would not let go of.
  | "files"
  // A schedule whose template is itself in the trash, or already removed for good.
  | "template-in-trash"
  | "template-gone";

export type TrashResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: TrashRefusal; readonly detail?: string };
