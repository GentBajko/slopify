import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { deleteSetting, readSetting, writeSetting } from "../../slices/settings/repo.js";
import { defaultHttpsPort, remoteAccessAppliedKey, remoteAccessKey } from "./model.js";

// The two settings rows remote access keeps: the switch as the person set it, and the exact
// serve handler Slopify added (removed again only when it is still exactly that).

const savedShape = z.object({
  enabled: z.boolean(),
  httpsPort: z.number().int().min(1).max(65535),
});
export type Saved = z.infer<typeof savedShape>;
const appliedShape = z.object({
  dnsName: z.string(),
  httpsPort: z.number().int(),
  target: z.string(),
});
export type Applied = z.infer<typeof appliedShape>;

function readJson<T>(db: DatabaseSync, key: string, shape: z.ZodType<T>): T | undefined {
  const raw = readSetting(db, key);
  if (raw === undefined) return undefined;
  try {
    const parsed = shape.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export interface RemoteAccessStore {
  readonly saved: () => Saved;
  readonly applied: () => Applied | undefined;
  readonly record: (next: Applied | undefined) => void;
  readonly save: (next: Saved) => void;
}

export function remoteAccessStore(db: DatabaseSync): RemoteAccessStore {
  let applied: Applied | undefined = readJson(db, remoteAccessAppliedKey, appliedShape);
  return {
    saved: () =>
      readJson(db, remoteAccessKey, savedShape) ?? { enabled: false, httpsPort: defaultHttpsPort },
    applied: () => applied,
    record: (next) => {
      applied = next;
      if (next === undefined) deleteSetting(db, remoteAccessAppliedKey);
      else writeSetting(db, remoteAccessAppliedKey, JSON.stringify(next));
    },
    save: (next) => writeSetting(db, remoteAccessKey, JSON.stringify(next)),
  };
}
