import type { DatabaseSync } from "node:sqlite";
import { readSetting, writeSetting } from "../../slices/settings/repo.js";
import { desktopHowTo, howToFor, type LoginStart } from "./docker.js";
import { type AutostartView, autostartAnsweredKey } from "./model.js";
import type { NativeAutostart } from "./native.js";

// Settings → General's switch and the first-run offer, over either kind of installation.
export interface AutostartService {
  view(): Promise<AutostartView>;
  // Turns the native login entry on or off and marks the question answered. Throws a plain
  // sentence when it can't; in Docker it always throws, with where Docker's setting is.
  set(enabled: boolean): Promise<AutostartView>;
  // Marks the question answered without changing anything (the first-run screen's No thanks).
  answer(): Promise<AutostartView>;
  // Whether the question is still open (the terminal asks it once, like the first-run screen).
  unanswered(): Promise<boolean>;
  // Native: keeps an existing login entry pointing at the Node and version in use.
  refresh(): Promise<void>;
}

export type AutostartSource =
  | { readonly kind: "native"; readonly native: NativeAutostart }
  | {
      readonly kind: "docker";
      // The installer's record, null when there is none (a compose file run by hand).
      readonly record: () => Promise<LoginStart | null>;
    };

export class AutostartRefusal extends Error {}

export function createAutostartService(
  db: DatabaseSync,
  source: AutostartSource,
): AutostartService {
  const answered = () => readSetting(db, autostartAnsweredKey) === "1";
  const markAnswered = () => writeSetting(db, autostartAnsweredKey, "1");

  async function view(): Promise<AutostartView> {
    if (source.kind === "docker") {
      const record = await source.record();
      return {
        kind: "docker",
        available: false,
        enabled: record === null || record.docker === "unknown" ? null : record.docker === "yes",
        summary:
          record === null
            ? "Slopify runs in Docker and starts whenever Docker starts. From inside the container it can't see whether Docker starts when you log in."
            : record.desktop === true
              ? desktopSummary(record.docker)
              : record.docker === "yes"
                ? record.manager === "rootless"
                  ? "Slopify runs in Docker and starts when you log in: rootless Docker starts with your login and restarts Slopify."
                  : "Slopify runs in Docker and starts with this computer: Docker starts at boot and restarts Slopify."
                : record.docker === "no"
                  ? "Slopify runs in Docker, and Docker doesn't start by itself on this computer, so Slopify doesn't either."
                  : "Slopify runs in Docker and starts whenever Docker starts. The installer couldn't tell whether Docker starts by itself here.",
        where: null,
        howTo:
          record === null
            ? desktopHowTo
            : `${howToFor(record)} To check again after changing it, run npx @gentbajko/slopify --docker.`,
        checkedAt: record?.checkedAt ?? null,
        offer: false,
      };
    }
    const state = await source.native.status();
    return {
      kind: "native",
      available: state.available,
      enabled: state.enabled,
      summary: state.summary,
      where: state.where,
      howTo: null,
      checkedAt: null,
      offer: state.available && !state.enabled && !answered(),
    };
  }

  return {
    view,
    set: async (enabled) => {
      if (source.kind === "docker") {
        const current = await view();
        throw new AutostartRefusal(
          `Slopify in Docker starts whenever Docker starts, so this switch can't change it. ${current.howTo ?? desktopHowTo}`,
        );
      }
      try {
        await (enabled ? source.native.enable() : source.native.disable());
      } catch (error) {
        throw new AutostartRefusal(plain(error, enabled));
      }
      markAnswered();
      return view();
    },
    answer: async () => {
      markAnswered();
      return view();
    },
    unanswered: async () => (await view()).offer,
    refresh: () => (source.kind === "native" ? source.native.refresh() : Promise.resolve()),
  };
}

function desktopSummary(docker: LoginStart["docker"]): string {
  return docker === "yes"
    ? "Slopify runs in Docker Desktop and starts when you sign in: Docker Desktop starts at sign-in and restarts Slopify."
    : docker === "no"
      ? "Slopify runs in Docker Desktop, and Docker Desktop doesn't start when you sign in, so Slopify doesn't either."
      : "Slopify runs in Docker Desktop and starts whenever it does. The installer couldn't read whether Docker Desktop starts when you sign in.";
}

// The native steps already speak in sentences; a file error from the disk doesn't.
function plain(error: unknown, enabled: boolean): string {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error instanceof Error && "code" in error && typeof error.code === "string"
      ? error.code
      : undefined;
  if (code === undefined) return message;
  const path =
    error instanceof Error && "path" in error && typeof error.path === "string"
      ? ` ${error.path}`
      : "";
  return `Slopify couldn't ${enabled ? "add" : "remove"} its login entry: writing${path} failed (${message}). Make sure your user owns that folder and can write to it, then press Start Slopify when I log in in Settings → General again.`;
}
