import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const npm = process.execPath;
const npmCli =
  process.platform === "win32"
    ? join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js")
    : join(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js");
const root = await mkdtemp(join(tmpdir(), "slopify-install-smoke-"));

try {
  const packageJson = JSON.parse(await readFile(join(repo, "packages/app/package.json"), "utf8"));
  const archive = join(root, `gentbajko-slopify-${packageJson.version}.tgz`);
  await run(npm, [npmCli, "pack", "--workspace", "@gentbajko/slopify", "--pack-destination", root]);
  if (!(await exists(archive))) throw new Error("npm pack did not produce a package archive.");
  const globalPrefix = join(root, "global");
  await run(npm, [npmCli, "install", "--global", "--prefix", globalPrefix, archive]);
  const globalBin = join(
    globalPrefix,
    process.platform === "win32" ? "slopify.cmd" : "bin/slopify",
  );
  await smoke(globalBin, "global");
  await smoke(npm, "npx", [npmCli, "exec", "--yes", "--package", archive, "--", "slopify"]);
} finally {
  await rm(root, { recursive: true, force: true });
}

async function smoke(command, label, prefix = []) {
  const port = await freePort();
  const dataDir = join(root, `${label}-data`);
  const child = spawn(
    command,
    [...prefix, "--port", String(port), "--data-dir", dataDir, "--no-open"],
    {
      cwd: repo,
      env: { ...process.env, SLOPIFY_SKIP_MANAGED_UPDATE: "1" },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  try {
    await waitForHealth(port, child);
  } finally {
    await stop(child);
  }
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Could not reserve a port.");
  const port = address.port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(port, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Slopify exited before health check (${child.exitCode}).`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // The process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Slopify did not become healthy within 30 seconds.");
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && child.pid !== undefined) {
    await run("taskkill", ["/pid", String(child.pid), "/t", "/f"], { allowFailure: true });
    return;
  }
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repo, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0 && options.allowFailure !== true)
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}.`));
      else resolve();
    });
  });
}

async function exists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}
