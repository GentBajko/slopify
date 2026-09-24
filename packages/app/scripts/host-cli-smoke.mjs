import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { installHostPackage, nodeHostSetupRunner } from "../dist/host-cli/install.js";
import { helperHealth } from "../dist/host-cli/service.js";

if (process.platform !== "linux") throw new Error("The host/container smoke requires Linux.");
const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "sb-pack-"));
const name = `slopify-host-smoke-${process.pid}`;
const volume = name;
const home = join(root, "home");
const state = join(root, "state");
const bin = join(home, "bin");
const npm = join(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js");
const signal = AbortSignal.timeout(15 * 60_000);
let child;
let childExit;
let childError;
const run = async (file, args) =>
  (await exec(file, args, { signal, maxBuffer: 2 * 1024 * 1024 })).stdout.trim();
async function until(read, check, seconds = 30) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const value = await read();
    if (check(value)) return value;
    await delay(100);
  }
  throw new Error("Smoke condition did not become ready.");
}
async function startHelper(entry) {
  child = spawn(process.execPath, [entry, "--state-dir", state], {
    env: { HOME: home, PATH: bin, CODEX_HOME: join(home, ".codex") },
    stdio: "ignore",
  });
  child.on("error", (error) => {
    childError = error;
  });
  childExit = once(child, "close");
  await until(
    () => helperHealth(state, signal),
    (health) => health?.accepting,
  );
  if (childError) throw childError;
}
async function stopHelper() {
  if (!child) return;
  const stopping = child;
  stopping.kill("SIGTERM");
  const timer = setTimeout(() => stopping.kill("SIGKILL"), 7000);
  try {
    await childExit;
  } finally {
    clearTimeout(timer);
    child = undefined;
  }
}
try {
  console.log("Packing and installing the candidate host helper without install scripts...");
  await mkdir(bin, { recursive: true });
  await mkdir(state, { mode: 0o700 });
  await writeFile(join(home, "fixture-only"), "test-owned home");
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082",
    "hex",
  );
  await writeFile(join(home, "image.png"), png);
  const fake = await readFile(new URL("../test/fixtures/host-cli.cjs", import.meta.url), "utf8");
  for (const provider of ["claude", "codex", "gemini"]) {
    const path = join(bin, provider);
    await writeFile(path, `#!${process.execPath}\n${fake}`);
    await chmod(path, 0o700);
  }
  await mkdir(join(home, ".codex"));
  await writeFile(
    join(home, ".codex/models_cache.json"),
    JSON.stringify({
      models: [{ slug: "gpt-test", display_name: "GPT Test", visibility: "list" }],
    }),
  );
  const modelDir = join(bin, "node_modules/@google/gemini-cli-core/dist/src/config");
  await mkdir(modelDir, { recursive: true });
  await writeFile(
    join(modelDir, "models.js"),
    'export const DEFAULT_GEMINI_FLASH_MODEL = "gemini-3.8-flash";',
  );
  await writeFile(
    join(state, "host-environment.json"),
    JSON.stringify({
      HOME: home,
      PATH: bin,
      CODEX_HOME: join(home, ".codex"),
    }),
    { mode: 0o600 },
  );
  const pack = JSON.parse(
    await run(process.execPath, [
      npm,
      "pack",
      "--workspace",
      "@gentbajko/slopify",
      "--pack-destination",
      root,
      "--json",
    ]),
  );
  const version = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ).version;
  const { entry } = await installHostPackage({
    root: state,
    version,
    runner: nodeHostSetupRunner,
    signal,
    packageSource: join(root, pack[0].filename),
  });
  await startHelper(entry);
  await run("docker", ["volume", "create", volume]);
  await run("docker", [
    "run",
    "-d",
    "--name",
    name,
    "-p",
    "127.0.0.1::6969",
    "--mount",
    `type=volume,source=${volume},target=/data`,
    "--mount",
    `type=bind,source=${join(state, "share")},target=/opt/slopify-host,readonly`,
    "-e",
    "SLOPIFY_HOST_CLI_DIR=/opt/slopify-host",
    "slopify:smoke",
  ]);
  const inspected = JSON.parse(await run("docker", ["inspect", name]))[0];
  assert.deepEqual(inspected.Mounts.map((mount) => mount.Destination).sort(), [
    "/data",
    "/opt/slopify-host",
  ]);
  assert.equal(
    inspected.Mounts.find((mount) => mount.Type === "bind").Source,
    join(state, "share"),
  );
  const url = `http://${await run("docker", ["port", name, "6969/tcp"])}`;
  const api = async (path, body) => {
    const response = await fetch(
      `${url}${path}`,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    assert(response.ok, `${path}: ${response.status} ${response.ok ? "" : await response.text()}`);
    return response.json();
  };
  await until(
    async () =>
      fetch(`${url}/api/health`).then(
        (res) => res.ok,
        () => false,
      ),
    Boolean,
    90,
  );
  console.log("Checking metadata through Docker with only the socket directory mounted...");
  await run("docker", [
    "exec",
    "--user",
    "65534:65534",
    name,
    "node",
    "--input-type=module",
    "-e",
    'import {createHostCliClient} from "./packages/app/dist/adapters/host-cli/index.js"; const s=await createHostCliClient({directory:"/opt/slopify-host"}).status("codex"); if(!s.installed) process.exit(1);',
  ]);
  const providers = (await api("/api/providers")).providers;
  for (const id of ["claude-code", "codex", "gemini", "codex-image"]) {
    const provider = providers.find((row) => row.id === id);
    assert.equal(provider.readiness.installed, true);
    assert.equal(provider.cliPath.managedOnHost, true);
    assert((await api(`/api/providers/${id}/models`)).models.length > 0);
  }
  await api("/api/prompts", {
    kind: "image",
    name: "Host fixture image",
    body: "A test-only image.",
  });
  const draft = {
    title: "Host fixture",
    format: "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "off",
      images: "generate",
      thumbnail: "off",
      video: "off",
    },
    images: { provider: "codex-image", model: "codex-imagegen" },
    imagePrompts: [{ name: "Host fixture image", number: 1 }],
    provided: { article: "Supplied fixture article." },
    values: {},
    silenceGapSeconds: 3,
  };
  const imageRun = async () => {
    const id = (await api("/api/projects", draft)).project.id;
    const view = await until(
      () => api(`/api/projects/${id}`),
      (view) => {
        assert.notEqual(view.project.status, "failed", JSON.stringify(view.stages));
        return view.project.status === "done";
      },
    );
    const output = view.outputs.find((row) => row.role === "image");
    assert(output?.path.endsWith(".png"));
    const response = await fetch(`${url}/files/${id}/image-1`);
    assert(response.ok);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    const stored = await run("docker", [
      "exec",
      name,
      "node",
      "-e",
      `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(`/data/projects/${id}/${output.path}`)}).toString('hex'))`,
    ]);
    assert.equal(stored, png.toString("hex"));
  };
  await imageRun();
  console.log(
    "Restarting the helper without recreating the container; verifying a new image request...",
  );
  await stopHelper();
  await startHelper(entry);
  await imageRun();
  console.log("Reading independent documents through all three packaged host CLI adapters...");
  await run("docker", [
    "exec",
    name,
    "node",
    "--input-type=module",
    "-e",
    `import assert from "node:assert/strict";
     import {createHostCliClient} from "./packages/app/dist/adapters/host-cli/index.js";
     const client=createHostCliClient({directory:"/opt/slopify-host"});
     for(const id of ["claude-code","codex","gemini"]) {
       let text="";
       for await(const event of client.llm(id).complete({
         model:"fixture",messages:[{role:"user",content:"Read the supplied original report."}],
         documents:[{id:"research-1",title:"Original report",content:"ç🌊".repeat(50000)}],
         signal:AbortSignal.timeout(30000)
       })) if(event.type==="delta") text+=event.text;
       assert.equal(text,"Host fixture answer.");
     }`,
  ]);
  const calls = (await readFile(join(home, "calls.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(calls.length, 5);
  for (const call of calls.slice(2))
    assert.deepEqual(call.documents, [
      {
        id: "research-1",
        sha256: createHash("sha256").update("ç🌊".repeat(50000)).digest("hex"),
      },
    ]);
  assert(
    calls.every(
      (row) => row.home === home && row.uid === process.getuid() && row.cwd !== resolve("."),
    ),
  );
  console.log(
    "Packaged host bridge smoke passed: host processes, image publication, complete document reads, stable socket mount, no real credentials or paid calls.",
  );
} finally {
  await exec("docker", ["rm", "-f", name]).catch(() => {});
  await exec("docker", ["volume", "rm", volume]).catch(() => {});
  await stopHelper();
  await rm(root, { recursive: true, force: true });
}
