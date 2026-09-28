import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
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
  // The two global installs run side by side, each with its own npm cache: sharing one, two
  // installs at once collided on Windows (one's package.json went missing mid-install). The
  // starts and checks run side by side too, each with its own data folder and port.
  const globalPrefix = join(root, "global");
  const skippedPrefix = join(root, "skipped-scripts");
  await Promise.all([
    run(npm, [
      npmCli,
      "install",
      "--global",
      "--cache",
      join(root, "npm-cache-global"),
      "--prefix",
      globalPrefix,
      archive,
    ]),
    run(npm, [
      npmCli,
      "install",
      "--global",
      "--ignore-scripts",
      "--cache",
      join(root, "npm-cache-skipped"),
      "--prefix",
      skippedPrefix,
      archive,
    ]),
  ]);
  const viaGlobal = async () => {
    const globalBin = join(
      globalPrefix,
      process.platform === "win32" ? "slopify.cmd" : "bin/slopify",
    );
    await smoke(
      process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : globalBin,
      "global",
      process.platform === "win32" ? ["/d", "/s", "/c", "call", globalBin] : [],
      {},
      true,
    );
  };
  const viaNpx = () =>
    smoke(npm, "npx", [npmCli, "exec", "--yes", "--package", archive, "--", "slopify"]);
  const withScriptsSkipped = async () => {
    const skippedPackage = join(
      skippedPrefix,
      process.platform === "win32" ? "node_modules" : "lib/node_modules",
      "@gentbajko/slopify",
    );
    const skippedCli = join(skippedPackage, "dist/edge/cli.js");
    await smoke(npm, "skipped-scripts", [skippedCli]);
    const cached = join(root, "skipped-scripts-data/bin");
    const [build] = await readdir(cached);
    if (!build?.startsWith("ffmpeg-static-"))
      throw new Error("FFmpeg was not installed automatically.");
    const binary = join(cached, build, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
    for (const path of [binary, `${binary}.LICENSE`, `${binary}.README`]) {
      if (!(await exists(path))) throw new Error(`Missing FFmpeg installation file: ${path}`);
    }
    await run(binary, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=s=64x64:d=0.1",
      "-c:v",
      "libx264",
      "-f",
      "null",
      "-",
    ]);
    await smoke(npm, "skipped-scripts", [skippedCli], {
      FFMPEG_BINARIES_URL: "http://127.0.0.1:1",
    });
  };
  // npx is then the only npm install running, beside the two starts.
  await Promise.all([viaGlobal(), withScriptsSkipped(), viaNpx()]);
} finally {
  // Windows releases a killed process's file handles a moment after taskkill returns, so
  // the database can still be locked here; rm retries EBUSY for this long.
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
}

async function smoke(command, label, prefix = [], extraEnv = {}, checkUpdate = false) {
  const port = await freePort();
  const dataDir = join(root, `${label}-data`);
  const healthTimeoutMs = 210_000;
  const child = spawn(
    command,
    [...prefix, "--port", String(port), "--data-dir", dataDir, "--no-open"],
    {
      cwd: repo,
      env: {
        ...process.env,
        SLOPIFY_FFMPEG: "",
        FFMPEG_BIN: "",
        SLOPIFY_SKIP_MANAGED_UPDATE: "1",
        SLOPIFY_NO_MODEL_PREFETCH: "1",
        // The registry is not asked: the running version counts as the newest.
        SLOPIFY_DISABLE_UPDATES: "1",
        ...extraEnv,
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  try {
    await waitForHealth(port, child, healthTimeoutMs);
    // `slopify update` drives the running app's own updater, the same path as the Update button.
    if (checkUpdate) {
      const output = await capture(command, [...prefix, "update", "--port", String(port)]);
      if (!/already the newest version/.test(output))
        throw new Error(`slopify update did not reach the running app: ${output}`);
    }
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

async function waitForHealth(port, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
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
  throw new Error(`Slopify did not become healthy within ${timeoutMs / 1_000} seconds.`);
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

function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repo,
      env: { ...process.env, SLOPIFY_DOCKER_NAME: "slopify-install-smoke-none" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(`${command} update exited with ${code}: ${output}`)),
    );
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
