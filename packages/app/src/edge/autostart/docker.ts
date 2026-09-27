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
  })
  .strict();
export type LoginStart = z.infer<typeof loginStartSchema>;

export function dockerHowTo(manager: LoginStart["manager"]): string {
  return manager === "rootless"
    ? "Turn on Docker's start at login in a terminal: systemctl --user enable docker (rootless Docker). Slopify then starts with it."
    : "Turn on Docker's start with the computer in a terminal: sudo systemctl enable docker. Slopify then starts with it.";
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

// The terminal line the installer prints after its question.
export function loginStartReport(record: LoginStart): string {
  if (record.docker === "yes")
    return record.manager === "rootless"
      ? "Slopify starts when you log in: rootless Docker starts with your login and restarts Slopify."
      : "Slopify starts with this computer: Docker starts at boot and restarts Slopify.";
  if (record.docker === "no")
    return `Docker doesn't start by itself on this computer, so neither does Slopify. ${dockerHowTo(record.manager)}`;
  return `Slopify couldn't tell whether Docker starts by itself here (systemctl didn't answer). ${dockerHowTo(record.manager)}`;
}
