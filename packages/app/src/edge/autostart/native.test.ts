import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cmdLauncher,
  desktopEntry,
  desktopExecArg,
  launchAgent,
  shellLauncher,
  windowsRunCommand,
} from "./launcher.js";
import {
  type AutostartExec,
  type AutostartFs,
  createNativeAutostart,
  type ExecResult,
  type NativeAutostartOptions,
  nodeAutostartExec,
  nodeAutostartFs,
} from "./native.js";

// An in-memory disk and registry: what enable writes, and what disable must take away again.
function fakes() {
  const files = new Map<string, { text: string; mode: number }>();
  const dirs = new Set<string>();
  const registry = new Map<string, string>();
  const calls: string[][] = [];
  const fs: AutostartFs = {
    read: async (path) => files.get(path)?.text,
    write: async (path, text, mode) => {
      dirs.add(path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))));
      files.set(path, { text, mode });
    },
    remove: async (path) => {
      files.delete(path);
    },
    removeEmptyDir: async (path) => {
      const prefix = path.includes("\\") ? `${path}\\` : `${path}/`;
      if (![...files.keys()].some((file) => file.startsWith(prefix))) dirs.delete(path);
    },
  };
  const exec: AutostartExec = async (file, args): Promise<ExecResult> => {
    calls.push([file, ...args]);
    const name = args[3] as string;
    if (file !== "reg") return { code: 127, stdout: "", stderr: "not found" };
    if (args[0] === "query") {
      const data = registry.get(name);
      return data === undefined
        ? {
            code: 1,
            stdout: "",
            stderr: "ERROR: The system was unable to find the specified registry key or value.",
          }
        : {
            code: 0,
            stdout: `\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n    ${name}    REG_SZ    ${data}\r\n\r\n`,
            stderr: "",
          };
    }
    if (args[0] === "add") {
      registry.set(name, args[7] as string);
      return { code: 0, stdout: "The operation completed successfully.", stderr: "" };
    }
    registry.delete(name);
    return { code: 0, stdout: "", stderr: "" };
  };
  return { files, dirs, registry, calls, fs, exec };
}

const base = {
  env: {},
  wsl: false,
  version: "3.0.0",
  port: 6969,
  host: "127.0.0.1",
  npxCli: null,
};

function linux(fake: ReturnType<typeof fakes>, extra: Partial<NativeAutostartOptions> = {}) {
  return createNativeAutostart({
    ...base,
    platform: "linux",
    home: "/home/Ann Lee",
    dataDir: "/home/Ann Lee/.slopify",
    log: "/home/Ann Lee/.slopify/logs/autostart.log",
    node: "/usr/bin/node",
    entry: "/usr/lib/node_modules/@gentbajko/slopify/dist/edge/cli.js",
    fs: fake.fs,
    exec: fake.exec,
    ...extra,
  });
}

describe("Linux: XDG autostart", () => {
  it("adds a .desktop entry and a launcher, and removes exactly those again", async () => {
    const fake = fakes();
    const autostart = linux(fake);
    expect((await autostart.status()).enabled).toBe(false);
    const on = await autostart.enable();
    expect(on).toMatchObject({
      enabled: true,
      where: "/home/Ann Lee/.config/autostart/slopify.desktop",
    });
    expect([...fake.files.keys()].sort()).toEqual([
      "/home/Ann Lee/.config/autostart/slopify.desktop",
      "/home/Ann Lee/.slopify/autostart/start-slopify.sh",
    ]);
    const desktop = fake.files.get("/home/Ann Lee/.config/autostart/slopify.desktop")?.text ?? "";
    expect(desktop).toContain('Exec=/bin/sh "/home/Ann Lee/.slopify/autostart/start-slopify.sh"\n');
    expect(desktop).toContain("X-GNOME-Autostart-enabled=true\n");
    expect(desktop).toContain("Hidden=false\n");
    expect(fake.files.get("/home/Ann Lee/.slopify/autostart/start-slopify.sh")?.mode).toBe(0o700);
    expect((await autostart.status()).enabled).toBe(true);
    expect(fake.calls).toEqual([]);

    await autostart.disable();
    expect(fake.files.size).toBe(0);
    expect(fake.dirs.has("/home/Ann Lee/.slopify/autostart")).toBe(false);
    expect((await autostart.status()).enabled).toBe(false);
  });

  it("is idempotent both ways", async () => {
    const fake = fakes();
    const autostart = linux(fake);
    await autostart.enable();
    const first = new Map(fake.files);
    await autostart.enable();
    expect(fake.files).toEqual(first);
    await autostart.disable();
    await autostart.disable();
    expect(fake.files.size).toBe(0);
  });

  it("follows XDG_CONFIG_HOME", async () => {
    const fake = fakes();
    await linux(fake, { env: { XDG_CONFIG_HOME: "/cfg" } }).enable();
    expect(fake.files.has("/cfg/autostart/slopify.desktop")).toBe(true);
  });

  it("leaves a slopify.desktop it didn't write alone", async () => {
    const fake = fakes();
    fake.files.set("/home/Ann Lee/.config/autostart/slopify.desktop", {
      text: "[Desktop Entry]\nExec=mine\n",
      mode: 0o644,
    });
    const autostart = linux(fake);
    expect((await autostart.status()).enabled).toBe(false);
    await expect(autostart.enable()).rejects.toThrow(/wasn't made by Slopify/u);
    await autostart.disable();
    expect(fake.files.get("/home/Ann Lee/.config/autostart/slopify.desktop")?.text).toBe(
      "[Desktop Entry]\nExec=mine\n",
    );
  });

  it("refreshes the launcher for a new version, but not from another data folder", async () => {
    const fake = fakes();
    await linux(fake).enable();
    await linux(fake, { version: "3.1.0", entry: null }).refresh();
    const launcher = fake.files.get("/home/Ann Lee/.slopify/autostart/start-slopify.sh")?.text;
    expect(launcher).toContain("'@gentbajko/slopify@3.1.0'");
    await linux(fake, { dataDir: "/tmp/other", log: "/tmp/other/logs/autostart.log" }).refresh();
    expect(fake.files.has("/tmp/other/autostart/start-slopify.sh")).toBe(false);
    expect(fake.files.get("/home/Ann Lee/.config/autostart/slopify.desktop")?.text).toContain(
      "/home/Ann Lee/.slopify/autostart",
    );
  });

  it("does nothing on refresh while the switch is off", async () => {
    const fake = fakes();
    await linux(fake).refresh();
    expect(fake.files.size).toBe(0);
  });

  it("says WSL can't start at Windows login", async () => {
    const fake = fakes();
    const autostart = linux(fake, { wsl: true });
    expect(await autostart.status()).toMatchObject({ available: false, enabled: false });
    await expect(autostart.enable()).rejects.toThrow(/WSL/u);
    expect(fake.files.size).toBe(0);
  });
});

describe("macOS: LaunchAgent", () => {
  const mac = (fake: ReturnType<typeof fakes>) =>
    createNativeAutostart({
      ...base,
      platform: "darwin",
      home: "/Users/ann & co",
      dataDir: "/Users/ann & co/.slopify",
      log: "/Users/ann & co/.slopify/logs/autostart.log",
      node: "/opt/homebrew/bin/node",
      entry: null,
      npxCli: "/opt/homebrew/lib/node_modules/npm/bin/npx-cli.js",
      fs: fake.fs,
      exec: fake.exec,
    });

  it("writes stream.slopify.app.plist with RunAtLoad and logs in the data folder", async () => {
    const fake = fakes();
    const autostart = mac(fake);
    expect((await autostart.enable()).where).toBe(
      "/Users/ann & co/Library/LaunchAgents/stream.slopify.app.plist",
    );
    const plist =
      fake.files.get("/Users/ann & co/Library/LaunchAgents/stream.slopify.app.plist")?.text ?? "";
    expect(plist).toContain("<string>stream.slopify.app</string>");
    expect(plist).toContain("<key>RunAtLoad</key>\n  <true/>");
    expect(plist).toContain(
      "<string>/Users/ann &amp; co/.slopify/autostart/start-slopify.sh</string>",
    );
    expect(plist).toContain(
      "<key>StandardOutPath</key>\n  <string>/Users/ann &amp; co/.slopify/logs/autostart.log</string>",
    );
    // launchd loads it at the next login; loading it now would start a second Slopify.
    expect(fake.calls).toEqual([]);
    expect((await autostart.status()).enabled).toBe(true);
    await autostart.enable();
    await autostart.disable();
    await autostart.disable();
    expect(fake.files.size).toBe(0);
  });
});

describe("Windows: the Run registry value", () => {
  const windows = (fake: ReturnType<typeof fakes>, dataDir = "C:\\Users\\Ann Lee\\.slopify") =>
    createNativeAutostart({
      ...base,
      platform: "win32",
      home: "C:\\Users\\Ann Lee",
      dataDir,
      log: `${dataDir}\\logs\\autostart.log`,
      node: "C:\\Program Files\\nodejs\\node.exe",
      entry: null,
      npxCli: "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js",
      fs: fake.fs,
      exec: fake.exec,
    });

  it("adds HKCU Run → Slopify running the launcher minimised, then deletes it", async () => {
    const fake = fakes();
    const autostart = windows(fake);
    await autostart.enable();
    const run =
      'cmd.exe /d /c start "Slopify" /min "C:\\Users\\Ann Lee\\.slopify\\autostart\\start-slopify.cmd"';
    expect(fake.registry.get("Slopify")).toBe(run);
    expect(fake.calls).toContainEqual([
      "reg",
      "add",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
      "/v",
      "Slopify",
      "/t",
      "REG_SZ",
      "/d",
      run,
      "/f",
    ]);
    expect(fake.files.has("C:\\Users\\Ann Lee\\.slopify\\autostart\\start-slopify.cmd")).toBe(true);
    expect((await autostart.status()).enabled).toBe(true);

    fake.calls.length = 0;
    await autostart.enable();
    expect(fake.calls.map((call) => call[1])).toEqual(["query"]);

    await autostart.disable();
    expect(fake.registry.size).toBe(0);
    expect(fake.files.size).toBe(0);
    await autostart.disable();
    expect(fake.calls.filter((call) => call[1] === "delete")).toHaveLength(1);
  });

  it("leaves a Slopify value it didn't make", async () => {
    const fake = fakes();
    fake.registry.set("Slopify", "C:\\Tools\\my-slopify.exe");
    const autostart = windows(fake);
    await expect(autostart.enable()).rejects.toThrow(/didn't make/u);
    await autostart.disable();
    expect(fake.registry.get("Slopify")).toBe("C:\\Tools\\my-slopify.exe");
  });

  it("refuses a data folder with a % sign before writing anything", async () => {
    const fake = fakes();
    await expect(windows(fake, "C:\\100%\\.slopify").enable()).rejects.toThrow(/% sign/u);
    expect(fake.files.size + fake.registry.size).toBe(0);
  });
});

describe("the generated files", () => {
  const spec = {
    node: "/home/o'brien/.nvm/versions/node/v26.0.0/bin/node",
    entry: null,
    npxCli: "/home/o'brien/.nvm/versions/node/v26.0.0/lib/node_modules/npm/bin/npx-cli.js",
    version: "3.0.0",
    dataDir: "/home/o'brien/My Stuff/.slopify",
    port: 7070,
    host: "127.0.0.1",
    log: "/home/o'brien/My Stuff/.slopify/logs/autostart.log",
  };

  it("quotes every path in the shell launcher and pins the version", () => {
    const text = shellLauncher({ ...spec, platform: "linux" });
    expect(text.startsWith("#!/bin/sh\n")).toBe(true);
    expect(text).toContain("exec >>'/home/o'\\''brien/My Stuff/.slopify/logs/autostart.log' 2>&1");
    expect(text).toContain(
      "exec \"$NODE\" '/home/o'\\''brien/.nvm/versions/node/v26.0.0/lib/node_modules/npm/bin/npx-cli.js' --yes '@gentbajko/slopify@3.0.0' '--no-open' '--data-dir' '/home/o'\\''brien/My Stuff/.slopify' '--port' '7070'; fi",
    );
    expect(text).toContain("exec npx --yes '@gentbajko/slopify@3.0.0' '--no-open'");
    expect(text).not.toContain("--host");
  });

  it("starts the installed entry first when there is one, and passes a non-default host", () => {
    const text = shellLauncher({
      ...spec,
      platform: "darwin",
      entry: "/usr/local/lib/node_modules/@gentbajko/slopify/dist/edge/cli.js",
      host: "0.0.0.0",
    });
    const entryLine = text.indexOf("/dist/edge/cli.js");
    expect(entryLine).toBeGreaterThan(0);
    expect(entryLine).toBeLessThan(text.indexOf("npx-cli.js"));
    expect(text).toContain("'--host' '0.0.0.0'");
  });

  it("writes a cmd launcher with quoted paths and doubled % signs", () => {
    const text = cmdLauncher({
      ...spec,
      platform: "win32",
      node: "C:\\Program Files\\nodejs\\node.exe",
      npxCli: "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js",
      dataDir: "C:\\Users\\Ann (Home)\\.slopify",
      log: "C:\\Users\\Ann (Home)\\.slopify\\logs\\autostart.log",
      entry: "C:\\50%\\cli.js",
    });
    expect(text.split("\r\n")).toContain('set "NODE=C:\\Program Files\\nodejs\\node.exe"');
    expect(text.split("\r\n")).toContain('set "PATH=C:\\Program Files\\nodejs;%PATH%"');
    expect(text).toContain(
      '"%NODE%" "C:\\50%%\\cli.js" --no-open --data-dir "C:\\Users\\Ann (Home)\\.slopify" --port 7070 >>"C:\\Users\\Ann (Home)\\.slopify\\logs\\autostart.log" 2>&1',
    );
    expect(text).toContain(
      '"%NODE%" "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js" --yes @gentbajko/slopify@3.0.0 --no-open',
    );
    expect(text).toContain("call npx --yes @gentbajko/slopify@3.0.0 --no-open");
  });

  it("quotes the Run value's launcher for spaces", () => {
    expect(windowsRunCommand("C:\\Users\\Ann Lee\\x.cmd")).toBe(
      'cmd.exe /d /c start "Slopify" /min "C:\\Users\\Ann Lee\\x.cmd"',
    );
  });

  it("escapes Exec arguments the way the Desktop Entry spec reads them", () => {
    expect(desktopExecArg("/home/ann/.slopify/autostart/start-slopify.sh")).toBe(
      "/home/ann/.slopify/autostart/start-slopify.sh",
    );
    expect(desktopExecArg("/home/Ann Lee/a")).toBe('"/home/Ann Lee/a"');
    expect(desktopExecArg('/x/$HOME "q" `b` 100%')).toBe(
      '"/x/\\\\$HOME \\\\"q\\\\" \\\\`b\\\\` 100%%"',
    );
    expect(desktopExecArg("/x\\y z")).toBe('"/x\\\\\\\\y z"');
    expect(desktopEntry("/a b/s.sh")).toContain('Exec=/bin/sh "/a b/s.sh"\n');
  });

  it("escapes XML in the plist", () => {
    expect(launchAgent("/Users/a<b>/s.sh", "/l")).toContain(
      "<string>/Users/a&lt;b&gt;/s.sh</string>",
    );
  });
});

// The real disk, in a scratch HOME: never the machine's own ~/.config/autostart.
describe.skipIf(process.platform !== "linux")("Linux, on a real disk in a scratch HOME", () => {
  it("writes a valid .desktop entry and a launcher sh accepts, then removes both", async () => {
    const home = mkdtempSync(join(tmpdir(), "slopify-home-"));
    const config = join(home, "config dir");
    const dataDir = join(home, "My Data", ".slopify");
    const autostart = createNativeAutostart({
      ...base,
      platform: "linux",
      home,
      env: { XDG_CONFIG_HOME: config },
      dataDir,
      log: join(dataDir, "logs", "autostart.log"),
      node: process.execPath,
      entry: null,
      fs: nodeAutostartFs,
      exec: nodeAutostartExec,
    });
    await autostart.enable();
    const desktop = join(config, "autostart", "slopify.desktop");
    const launcher = join(dataDir, "autostart", "start-slopify.sh");
    expect(readFileSync(desktop, "utf8")).toContain(`Exec=/bin/sh "${launcher}"`);
    expect(statSync(launcher).mode & 0o777).toBe(0o700);
    // The launcher parses as sh; it is not run, which would start Slopify.
    expect(spawnSync("sh", ["-n", launcher]).status).toBe(0);
    const validate = spawnSync("desktop-file-validate", [desktop], { encoding: "utf8" });
    if (validate.error === undefined) expect(validate.stdout + validate.stderr).toBe("");
    expect((await autostart.status()).enabled).toBe(true);

    await autostart.disable();
    expect(existsSync(desktop)).toBe(false);
    expect(existsSync(join(dataDir, "autostart"))).toBe(false);
    expect(existsSync(join(config, "autostart"))).toBe(true);
  });
});
