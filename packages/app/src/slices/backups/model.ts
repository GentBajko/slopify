import { z } from "zod";
import { validTimeZone } from "../schedules/calendar.js";

// Scheduled backups write the same archive Export everything downloads (storage/backup-export)
// into a folder on disk, once a day, keeping the newest few. The settings table holds the
// configuration and the last result under two keys no backup carries: exportableSettings
// only lets known portable keys through, and a folder path belongs to this machine alone.
export const configKey = "backups.config";
export const statusKey = "backups.status";

export const keepMin = 1;
export const keepMax = 30;
export const folderMax = 1024;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time as HH:MM, 00:00 to 23:59.");

export const backupConfigInputSchema = z
  .object({
    enabled: z.boolean(),
    time,
    timeZone: z
      .string()
      .min(1)
      .max(64)
      .refine(validTimeZone, "This time zone is not one Slopify knows."),
    keep: z
      .number()
      .int()
      .min(keepMin)
      .max(keepMax, `Keep between ${keepMin} and ${keepMax} backups.`),
    // null is the default folder, so moving the projects folder moves the backups with it.
    folder: z.string().trim().min(1).max(folderMax).nullable(),
  })
  .strict();
export type BackupConfigInput = z.infer<typeof backupConfigInputSchema>;

export const storedConfigSchema = backupConfigInputSchema.extend({
  // When the toggle was last turned on. A slot before it does not count, so turning backups on
  // at 14:00 waits for tonight's 03:00 instead of starting a multi-gigabyte copy at once.
  enabledAt: z.string().nullable(),
});
export type BackupConfig = z.infer<typeof storedConfigSchema>;

// Off by default, for new and existing installs alike: an archive holds every project's video
// and can be many gigabytes, so filling a disk with copies is something the user asks for.
export function defaultConfig(timeZone: string): BackupConfig {
  return { enabled: false, time: "03:00", timeZone, keep: 5, folder: null, enabledAt: null };
}

export const triggers = ["scheduled", "catch-up", "manual"] as const;
export type BackupTrigger = (typeof triggers)[number];

export const backupStatusSchema = z.object({
  lastAttemptAt: z.string().nullable(),
  // "waiting": projects were being made, so the backup is held until they finish.
  lastResult: z.enum(["succeeded", "failed", "waiting"]).nullable(),
  lastTrigger: z.enum(triggers).nullable(),
  // The slot the last attempt was for, so a failure is retried for that slot, not repeated.
  lastSlot: z.string().nullable(),
  detail: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  lastSuccessFile: z.string().nullable(),
  lastSuccessBytes: z.number().int().min(0).nullable(),
  lastDurationMs: z.number().int().min(0).nullable(),
});
export type BackupStatus = z.infer<typeof backupStatusSchema>;

export const emptyStatus: BackupStatus = {
  lastAttemptAt: null,
  lastResult: null,
  lastTrigger: null,
  lastSlot: null,
  detail: null,
  lastSuccessAt: null,
  lastSuccessFile: null,
  lastSuccessBytes: null,
  lastDurationMs: null,
};

export interface BackupFile {
  readonly name: string;
  readonly bytes: number;
  readonly createdAt: string;
}

export interface BackupView {
  readonly config: BackupConfigInput;
  readonly folder: string;
  readonly defaultFolder: string;
  // Where the folder is on the user's computer: the folder itself on a native install; in
  // Docker the host path when it is inside the shared projects folder, otherwise null (it is
  // then only in the container's private volume).
  readonly hostFolder: string | null;
  readonly container: boolean;
  readonly running: boolean;
  readonly nextRunAt: string | null;
  // A slot has passed without a successful backup; one runs shortly (after a start, a
  // failure's retry, or once busy projects finish).
  readonly overdue: boolean;
  readonly status: BackupStatus;
  readonly files: readonly BackupFile[];
}
