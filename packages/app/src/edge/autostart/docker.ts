import { posix, win32 } from "node:path";
import { z } from "zod";
import type { AutostartExec } from "./native.js";

// Slopify in Docker restarts with Docker (`restart: unless-stopped` in compose.yaml), so it
// starts at login exactly when Docker does. Slopify never changes Docker's own setting; the
// installer looks once, on this machine, and leaves the answer where the container can read
// it (the read-only /opt/slopify-install folder), because a container can't see its host.

export const loginStartFile = "login-start.json";
export const containerLoginStart = `/opt/slopify-install/${loginStartFile}`;

export const loginStartSchema = z
  .object({
    version: z.literal(1),
    checkedAt: z.string().max(40),
    // yes: Docker starts by itself; no: it doesn't; unknown: this machine couldn't say.
    docker: z.enum(["yes", "no", "unknown"]),
    // Which Docker the installation uses: the system one, or rootless Docker in your account.
    manager: z.enum(["system", "rootless"]),
    // The installer's "Start Slopify when you log in?" answer, or null when it wasn't asked.
    wanted: z.boolean().nullable(),
    // The system the installer ran on, and whether its Docker is Docker Desktop, which has its
    // own sign-in setting instead of a systemd service. Absent in records from before 3.0.1.
    platform: z.enum(["linux", "darwin", "win32", "other"]).optional(),
    desktop: z.boolean().optional(),
  })
  .strict();
export type LoginStart = z.infer<typeof loginStartSchema>;

export function dockerHowTo(manager: LoginStart["manager"]): string {
  return manager === "rootless"
    ? "Turn on Docker's start at login in a terminal: systemctl --user enable docker (rootless Docker). Slopify then starts with it."
    : "Turn on Docker's start with the computer in a terminal: sudo systemctl enable docker. Slopify then starts with it.";
}

export const dockerDesktopHowTo =
  "Turn on Docker Desktop → Settings → General → Start Docker Desktop when you sign in to your computer. Slopify then starts with it.";

// Where to turn Docker's start at login on, for the Docker this installation uses. A record
// from before the installer noted the system can't tell Docker Desktop from Docker Engine
// when systemctl didn't answer (macOS and Windows have none), so it names both.
export function howToFor(record: LoginStart): string {
  if (record.desktop === true) return dockerDesktopHowTo;
  if (record.platform === undefined && record.docker === "unknown") return desktopHowTo;
  return dockerHowTo(record.manager);
}

export const desktopHowTo =
  "With Docker Desktop: Docker Desktop → Settings → General → Start Docker Desktop when you sign in. With Docker Engine on Linux: sudo systemctl enable docker. Slopify starts whenever Docker does.";

/**
 * Reads, never changes, whether Docker starts by itself. `systemctl is-enabled` only reports;
 * it answers "enabled" or "disabled" (exit code 1), and fails without systemd.
 */
export async function checkDockerStart(
  exec: AutostartExec,
  manager: LoginStart["manager"],
): Promise<LoginStart["docker"]> {
  const result = await exec(
    "systemctl",
    manager === "rootless"
      ? ["--user", "is-enabled", "docker.service"]
      : ["is-enabled", "docker.service"],
  );
  const answer = result.stdout.trim().split("\n")[0]?.trim() ?? "";
  if (["enabled", "enabled-runtime", "alias"].includes(answer)) return "yes";
  if (["disabled", "masked", "masked-runtime"].includes(answer)) return "no";
  return "unknown";
}

// What the installer needs to look at Docker Desktop's own settings, handed in so a test can
// play any system.
export interface DockerHost {
  readonly platform: NodeJS.Platform;
  readonly home: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  // A text file's contents, or undefined when it can't be read.
  readonly read: (path: string) => Promise<string | undefined>;
}

// Docker Desktop's settings files, newest name first: settings-store.json in current
// versions, settings.json before it.
export function desktopSettingsPaths(host: DockerHost): readonly string[] {
  const names = ["settings-store.json", "settings.json"];
  if (host.platform === "win32") {
    const appData = host.env.APPDATA?.trim() || win32.join(host.home, "AppData", "Roaming");
    return names.map((name) => win32.join(appData, "Docker", name));
  }
  if (host.platform === "darwin")
    return names.map((name) =>
      posix.join(host.home, "Library", "Group Containers", "group.com.docker", name),
    );
  return names.map((name) => posix.join(host.home, ".docker", "desktop", name));
}

// `AutoStart` in settings-store.json, `autoStart` in the older settings.json: Start Docker
// Desktop when you sign in to your computer.
export function desktopAutoStart(text: string): LoginStart["docker"] {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null) return "unknown";
    const record = value as Record<string, unknown>;
    const start = record.AutoStart ?? record.autoStart;
    return start === true ? "yes" : start === false ? "no" : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Reads, never changes, whether Docker starts by itself on this machine. macOS and Windows run
 * Docker Desktop, whose settings file says; on Linux, Docker Desktop's settings file when it
 * is there, otherwise the system or rootless docker service through systemctl.
 */
export async function inspectDockerStart(o: {
  readonly exec: AutostartExec;
  readonly manager: LoginStart["manager"];
  readonly host: DockerHost;
}): Promise<Required<Pick<LoginStart, "docker" | "desktop" | "platform">>> {
  const platform =
    o.host.platform === "linux" || o.host.platform === "darwin" || o.host.platform === "win32"
      ? o.host.platform
      : "other";
  for (const path of desktopSettingsPaths(o.host)) {
    const text = await o.host.read(path);
    if (text !== undefined) return { docker: desktopAutoStart(text), desktop: true, platform };
  }
  if (platform === "darwin" || platform === "win32")
    return { docker: "unknown", desktop: true, platform };
  return { docker: await checkDockerStart(o.exec, o.manager), desktop: false, platform };
}

// The terminal line the installer prints after its question.
export function loginStartReport(record: LoginStart): string {
  if (record.desktop === true) {
    if (record.docker === "yes")
      return "Slopify starts when you sign in: Docker Desktop starts at sign-in and restarts Slopify.";
    if (record.docker === "no")
      return `Docker Desktop doesn't start when you sign in, so neither does Slopify. ${dockerDesktopHowTo}`;
    return `Slopify couldn't tell whether Docker Desktop starts when you sign in (its settings file didn't say). ${dockerDesktopHowTo}`;
  }
  if (record.docker === "yes")
    return record.manager === "rootless"
      ? "Slopify starts when you log in: rootless Docker starts with your login and restarts Slopify."
      : "Slopify starts with this computer: Docker starts at boot and restarts Slopify.";
  if (record.docker === "no")
    return `Docker doesn't start by itself on this computer, so neither does Slopify. ${dockerHowTo(record.manager)}`;
  return `Slopify couldn't tell whether Docker starts by itself here (systemctl didn't answer). ${dockerHowTo(record.manager)}`;
}
