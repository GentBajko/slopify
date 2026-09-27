// `waiting`: the update was asked for while work was running; it installs by itself as soon
// as nothing is.
export type UpdateStatus = "idle" | "checking" | "waiting" | "installing" | "restarting" | "error";

export interface UpdateInfo {
  readonly currentVersion: string;
  readonly latestVersion: string | null;
  readonly available: boolean;
  readonly busy: boolean;
  readonly canUpdate: boolean;
  readonly blockedReason?: string;
  readonly status: UpdateStatus;
  readonly error?: string;
  // While `waiting`: the version that will install.
  readonly pendingVersion?: string;
  // While work runs: the project it belongs to, which an update waits on. The Docker
  // launcher reads it too, before it replaces the container.
  readonly waitingFor?: string;
}

export interface UpdateResult {
  readonly ok: boolean;
  readonly info: UpdateInfo;
  readonly code?: 400 | 409 | 503;
}

export interface AppUpdater {
  readonly ready: (token: string) => boolean;
  readonly activate: (token: string) => Promise<boolean>;
  readonly check: (refresh?: boolean) => Promise<UpdateInfo>;
  readonly start: () => Promise<UpdateResult>;
  // Drops an update that is waiting for running work. False when none was waiting.
  readonly cancelWaiting: () => boolean;
  readonly locked: () => boolean;
  readonly beginMutation: () => (() => void) | undefined;
}

export const updatePackage = "@gentbajko/slopify";
export const npmRegistry = "https://registry.npmjs.org/";
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function isStableVersion(value: string): boolean {
  return value.length <= 50 && stableVersion.test(value);
}

export function newerVersion(candidate: string, current: string): boolean {
  if (!isStableVersion(candidate) || !isStableVersion(current)) return false;
  const left = candidate.split(".").map(BigInt);
  const right = current.split(".").map(BigInt);
  for (let index = 0; index < 3; index++) {
    const a = left[index];
    const b = right[index];
    if (a === undefined || b === undefined) return false;
    if (a !== b) return a > b;
  }
  return false;
}

export function isUpdateToken(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
