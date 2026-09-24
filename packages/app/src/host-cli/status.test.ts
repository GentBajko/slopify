import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHostStatus, parseHostLogin, readHostLogin, resolveHostCommand } from "./status.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
it("reads only documented login status", () => {
  expect(parseHostLogin("claude-code", '{"loggedIn":true,"ignored":"private"}', "")).toBe(
    "signed-in",
  );
  expect(parseHostLogin("claude-code", '{"loggedIn":false}', "")).toBe("signed-out");
  expect(parseHostLogin("claude-code", "bad", "failure")).toBe("unknown");
  expect(parseHostLogin("codex", "", "Logged in using ChatGPT\n")).toBe("signed-in");
  expect(parseHostLogin("codex", "Not logged in\n", "")).toBe("signed-out");
  expect(parseHostLogin("codex", "", "permission denied")).toBe("unknown");
  expect(parseHostLogin("gemini", "", "")).toBe("unknown");
});
it.skipIf(process.platform === "win32")(
  "resolves the current PATH launcher without pinning a symlink",
  async () => {
    const path = await mkdtemp(join(tmpdir(), "slopify-status-"));
    directories.push(path);
    await writeFile(join(path, "entry"), "#!/bin/sh\nexit 0\n");
    await chmod(join(path, "entry"), 0o700);
    await symlink(join(path, "entry"), join(path, "codex"));
    expect(await resolveHostCommand("codex", { PATH: path })).toBe(join(path, "codex"));
    await expect(resolveHostCommand("gemini", { PATH: path })).rejects.toMatchObject({
      code: "ENOENT",
    });
  },
);
it.skipIf(process.platform === "win32")(
  "retains logged-out JSON on a nonzero auth exit",
  async () => {
    const path = await mkdtemp(join(tmpdir(), "slopify-auth-"));
    directories.push(path);
    const file = join(path, "cli.cjs");
    await writeFile(
      file,
      "process.stdout.write(JSON.stringify({loggedIn:false}));process.exitCode=1;",
    );
    expect(await readHostLogin(file, "claude-code", AbortSignal.timeout(2000))).toBe("signed-out");
  },
);
it("coalesces and caches shared Codex probes for five seconds", async () => {
  let now = 0;
  let probes = 0;
  let logins = 0;
  const status = createHostStatus({
    resolve: async () => "/host/codex",
    probe: async () => {
      probes++;
      return { ran: true, stdout: "codex-cli 0.149.1" };
    },
    login: async () => {
      logins++;
      return "signed-in";
    },
    now: () => now,
  });
  const values = await Promise.all([status("codex"), status("codex-image")]);
  expect(values.map((v) => v.id)).toEqual(["codex", "codex-image"]);
  expect(probes).toBe(1);
  expect(logins).toBe(1);
  now = 4999;
  await status("codex");
  expect(probes).toBe(1);
  now = 5000;
  await status("codex");
  expect(probes).toBe(2);
});
it("distinguishes known sign-out, version, missing and unknown Gemini login", async () => {
  const deps = {
    resolve: async () => "/host/cli",
    probe: async () => ({ ran: true, stdout: "0.149.1" }),
    now: () => 0,
  };
  expect(
    await createHostStatus({ ...deps, login: async () => "signed-out" })("claude-code"),
  ).toMatchObject({ installed: true, issueKind: "login" });
  expect(await createHostStatus({ ...deps, login: async () => "unknown" })("gemini")).toMatchObject(
    { installed: true, login: "unknown" },
  );
  expect(
    (
      await createHostStatus({ ...deps, probe: async () => ({ ran: true, stdout: "0.1.0" }) })(
        "codex",
      )
    ).issueKind,
  ).toBe("version");
  expect(
    (
      await createHostStatus({
        ...deps,
        resolve: async () => {
          throw Object.assign(new Error(), { code: "ENOENT" });
        },
      })("codex")
    ).issueKind,
  ).toBe("missing");
});
