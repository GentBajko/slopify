import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeState } from "../docker-install/state.js";
import { checkDockerStart } from "./docker.js";
import { recordLoginStart } from "./docker-record.js";
import { readLoginStart } from "./index.js";
import type { AutostartExec } from "./native.js";

const answering =
  (stdout: string, code = 0, calls: string[][] = []): AutostartExec =>
  async (file, args) => {
    calls.push([file, ...args]);
    return { code, stdout, stderr: "" };
  };

describe("checkDockerStart", () => {
  it("only asks systemctl is-enabled, for the system or the rootless Docker", async () => {
    const calls: string[][] = [];
    expect(await checkDockerStart(answering("enabled\n", 0, calls), "system")).toBe("yes");
    expect(await checkDockerStart(answering("disabled\n", 1, calls), "rootless")).toBe("no");
    expect(calls).toEqual([
      ["systemctl", "is-enabled", "docker.service"],
      ["systemctl", "--user", "is-enabled", "docker.service"],
    ]);
  });

  it("doesn't guess when systemd can't say", async () => {
    expect(await checkDockerStart(answering("", 127), "system")).toBe("unknown");
    expect(await checkDockerStart(answering("static\n"), "system")).toBe("unknown");
    expect(await checkDockerStart(answering("masked\n", 1), "system")).toBe("no");
  });
});

describe.skipIf(process.getuid === undefined)("recordLoginStart", () => {
  const uid = process.getuid?.() ?? 0;
  const setup = async (user = `${uid}:1000`) => {
    const directory = mkdtempSync(join(tmpdir(), "slopify-login-start-"));
    mkdirSync(join(directory, "activation"), { mode: 0o700 });
    await writeState(join(directory, "install.json"), {
      version: 2,
      name: "slopify",
      volume: "slopify-data",
      daemon: "d",
      image: "ghcr.io/gentbajko/slopify:3.0.0",
      appVersion: "3.0.0",
      user,
      port: 6969,
      projects: "/home/ann/Slopify",
      projectsIdentity: { dev: "1", ino: "2" },
      hostCli: false,
      token: "a".repeat(64),
      recovery: null,
    });
    return directory;
  };
  const options = (directory: string, extra: Partial<Parameters<typeof recordLoginStart>[0]>) => ({
    directory,
    name: "slopify",
    uid,
    flag: undefined,
    interactive: false,
    ask: async () => true,
    exec: answering("enabled\n"),
    now: () => new Date("2026-09-27T10:00:00.000Z"),
    report: () => {},
    ...extra,
  });

  it("asks once, checks Docker, and leaves the answer for the container", async () => {
    const directory = await setup();
    const asked: string[] = [];
    const lines: string[] = [];
    await recordLoginStart(
      options(directory, {
        interactive: true,
        ask: async (question) => {
          asked.push(question);
          return true;
        },
        report: (line) => lines.push(line),
      }),
    );
    expect(asked).toEqual(["Start Slopify when you log in? (Y/n) "]);
    expect(lines[0]).toMatch(/Docker starts at boot/u);
    const path = join(directory, "activation", "login-start.json");
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      version: 1,
      checkedAt: "2026-09-27T10:00:00.000Z",
      docker: "yes",
      manager: "system",
      wanted: true,
    });
    expect(await readLoginStart(path)).toMatchObject({ docker: "yes", wanted: true });

    // The next update keeps the answer and doesn't ask again.
    await recordLoginStart(
      options(directory, {
        interactive: true,
        ask: async (question) => {
          asked.push(question);
          return false;
        },
        exec: answering("disabled\n", 1),
      }),
    );
    expect(asked).toHaveLength(1);
    expect(await readLoginStart(path)).toMatchObject({ docker: "no", wanted: true });
  });

  it("takes --no-autostart without asking, and says the container still follows Docker", async () => {
    const directory = await setup("0:0");
    const lines: string[] = [];
    const record = await recordLoginStart(
      options(directory, {
        flag: false,
        interactive: true,
        ask: () => Promise.reject(new Error("asked")),
        report: (line) => lines.push(line),
      }),
    );
    expect(record).toMatchObject({ manager: "rootless", wanted: false });
    expect(lines[0]).toMatch(/docker stop slopify/u);
  });

  it("reads a missing or damaged record as unknown", async () => {
    const directory = await setup();
    expect(await readLoginStart(join(directory, "activation", "login-start.json"))).toBeNull();
    await writeState(join(directory, "activation", "login-start.json"), { version: 9 });
    expect(await readLoginStart(join(directory, "activation", "login-start.json"))).toBeNull();
  });
});
