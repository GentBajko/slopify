import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { treeDigest } from "../dist/edge/docker-projects/tree.js";

assert.equal(process.platform, "linux");
assert.notEqual(process.getuid(), 0);
const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "slopify-docker-projects-"));
const id = randomUUID();
const name = `slopify-projects-test-${id}`;
const volume = `${name}-data`;
const seedContainer = `${name}-seed`;
const badSeed = `${name}-bad-seed`;
const badImage = `${name}:bad`;
const image = process.env.SLOPIFY_SMOKE_IMAGE || "slopify:smoke";
const state = join(root, "state");
const seed = join(root, "seed");
const projects = join(root, "Project files");
const installRoot = join(state, "slopify/docker", name);
const run = async (file, args, env = process.env) =>
  (await exec(file, args, { env, timeout: 20 * 60_000, maxBuffer: 4 * 1024 * 1024 })).stdout.trim();
const docker = (args) => run("docker", args);
const inspect = async (target) => JSON.parse(await docker(["inspect", target]))[0];
const env = {
  ...process.env,
  XDG_DATA_HOME: state,
  SLOPIFY_DOCKER_NAME: name,
  SLOPIFY_DOCKER_VOLUME: volume,
  SLOPIFY_DOCKER_IMAGE: image,
  SLOPIFY_DOCKER_HOST_PORT: "0",
  SLOPIFY_DOCKER_PROJECTS_DIR: projects,
  SLOPIFY_HOST_CLI_DIR: "",
};
let launcher;
let succeeded = false;
let url;
async function launch(extra = {}) {
  return run(process.execPath, [launcher, "--docker", "--host-cli=off"], { ...env, ...extra });
}
async function ready(target, activated = false) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const result = await exec(
      "docker",
      [
        "exec",
        target,
        "node",
        "-e",
        "fetch('http://127.0.0.1:6969/api/health').then(r=>process.exit(r.ok && (process.argv[1] !== 'active' || r.headers.has('X-Slopify-Version'))?0:1)).catch(()=>process.exit(1))",
        activated ? "active" : "health",
      ],
      { timeout: Math.max(1, Math.min(2000, deadline - Date.now())) },
    ).then(
      () => true,
      () => false,
    );
    if (result) return;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, Math.min(1000, deadline - Date.now()))),
    );
  }
  throw new Error("Disposable app failed health verification");
}
async function verify(expected) {
  await ready(name, true);
  const c = await inspect(name);
  const port = c.NetworkSettings.Ports["6969/tcp"][0].HostPort;
  url = `http://127.0.0.1:${port}`;
  for (const file of expected.files) {
    const route = `/files/${expected.project}/revisions/${file.revision}/${file.record}`;
    assert.equal(await (await fetch(`${url}${route}`)).text(), file.body);
    const located = await fetch(
      `${url}/api/projects/${expected.project}/revisions/${file.revision}/${file.record}/open-folder`,
      { method: "POST" },
    );
    const reply = await located.json();
    assert.equal(reply.opened, false);
    assert.equal(reply.location, "docker-host");
    assert(reply.path.startsWith(`${projects}/`));
  }
  const proof = JSON.parse(
    await docker([
      "exec",
      name,
      "node",
      "--input-type=module",
      "-e",
      "import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync('/data/slopify.db'); console.log(JSON.stringify({attempts:db.prepare('SELECT count(*) AS n FROM attempts').get().n,paused:db.prepare('SELECT paused FROM project_controls').get().paused,state:db.prepare(\"SELECT state FROM stages WHERE kind='article'\").get().state,assets:db.prepare('SELECT id,path FROM project_assets ORDER BY id').all()})); db.close();",
    ]),
  );
  assert.equal(proof.attempts, 0);
  assert.equal(proof.paused, 1);
  assert.equal(proof.state, "failed");
  return proof.assets;
}
try {
  console.log("Disposable Docker project-folder resources:", root, name, volume);
  await mkdir(seed);
  await mkdir(state, { mode: 0o700 });
  const packed = JSON.parse(
    await run("npm", [
      "pack",
      "--workspace",
      "@gentbajko/slopify",
      "--pack-destination",
      root,
      "--json",
    ]),
  );
  const archive = join(root, packed[0].filename);
  await run("npm", [
    "install",
    "--prefix",
    join(root, "package"),
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    archive,
  ]);
  const pkg = join(root, "package/node_modules/@gentbajko/slopify");
  launcher = join(pkg, "dist/edge/cli.js");
  for (const path of [
    "scripts/docker-run.sh",
    "dist/edge/docker-launch.js",
    "dist/edge/docker-projects/install.js",
    "dist/edge/docker-projects/volume.js",
    "dist/edge/docker-projects/activation.js",
  ])
    assert((await stat(join(pkg, path))).isFile());
  await run(
    "npx",
    ["--no-install", "vitest", "run", "packages/app/test/docker-projects-fixture.test.ts"],
    { ...process.env, SLOPIFY_DOCKER_FIXTURE_OUT: seed },
  );
  const expected = JSON.parse(await readFile(join(seed, "expected.json"), "utf8"));
  const before = await treeDigest(join(seed, "projects"));
  await docker(["volume", "create", "--label", `io.slopify.test=${id}`, volume]);
  await docker([
    "create",
    "--name",
    seedContainer,
    "--mount",
    `type=volume,source=${volume},target=/data`,
    "--entrypoint",
    "true",
    image,
  ]);
  await docker(["cp", `${seed}/.`, `${seedContainer}:/data`]);
  await docker([
    "run",
    "--rm",
    "--network",
    "none",
    "--user",
    "0:0",
    "--mount",
    `type=volume,source=${volume},target=/data`,
    "--entrypoint",
    "sh",
    image,
    "-c",
    "chown -R 1000:1000 /data && chmod 700 /data && chmod 600 /data/slopify.db",
  ]);
  await docker(["rm", seedContainer]);
  await docker([
    "run",
    "-d",
    "--name",
    name,
    "--restart",
    "on-failure:7",
    "-p",
    "127.0.0.1::6969",
    "--mount",
    `type=volume,source=${volume},target=/data`,
    image,
  ]);
  await ready(name);
  const original = await inspect(name);
  await docker(["create", "--name", badSeed, "--tmpfs", "/data", image]);
  await docker(["commit", "--change", 'CMD ["node","-e","process.exit(1)"]', badSeed, badImage]);
  await assert.rejects(
    launch({ SLOPIFY_DOCKER_IMAGE: badImage }),
    /Previous installation restored/,
  );
  const restored = await inspect(name);
  assert.equal(restored.Id, original.Id);
  assert.equal(restored.Config.User, original.Config.User);
  assert.deepEqual(restored.HostConfig.RestartPolicy, original.HostConfig.RestartPolicy);
  await ready(name);
  const interrupted = JSON.parse(await readFile(join(installRoot, "journal.json"), "utf8"));
  assert.equal(interrupted.volume, volume);
  assert.equal(interrupted.name, name);
  assert.match(interrupted.id, /^[a-f0-9-]{36}$/);
  const reader = `slopify-reader-${interrupted.id}`;
  await docker([
    "create",
    "--name",
    reader,
    "--label",
    `io.slopify.reader=${interrupted.id}`,
    "--network",
    "none",
    "--read-only",
    "--tmpfs",
    "/data",
    "--mount",
    `type=volume,source=${volume},target=/source,readonly,volume-nocopy`,
    "--entrypoint",
    "true",
    interrupted.image,
  ]);
  await launch();
  assert.equal(
    await docker(["container", "ls", "-a", "--filter", `name=^/${reader}$`, "--format", "{{.ID}}"]),
    "",
  );
  assert.deepEqual(await treeDigest(projects), before);
  const assets = await verify(expected);
  const installed = await inspect(name);
  assert.equal(installed.HostConfig.RestartPolicy.Name, "always");
  assert.equal(installed.Mounts.find((m) => m.Destination === "/data").Name, volume);
  assert.equal(installed.Mounts.find((m) => m.Destination === "/data/projects").Source, projects);
  const mode = JSON.parse(await docker(["info", "--format", "{{json .SecurityOptions}}"]));
  assert.equal(
    installed.Config.User,
    mode.includes("name=rootless") ? "0:0" : `${process.getuid()}:${process.getgid()}`,
  );
  await docker([
    "exec",
    name,
    "node",
    "-e",
    "require('node:fs').writeFileSync('/data/projects/ownership-proof','host readable',{mode:0o600})",
  ]);
  assert.equal((await stat(join(projects, "ownership-proof"))).uid, process.getuid());
  assert.equal(await readFile(join(projects, "ownership-proof"), "utf8"), "host readable");
  await rm(join(projects, "ownership-proof"));
  await launch({ SLOPIFY_DOCKER_PROJECTS_DIR: "" });
  assert.equal((await inspect(name)).Id, installed.Id);
  await docker(["stop", name]);
  await docker(["rm", name]);
  await launch({ SLOPIFY_DOCKER_PROJECTS_DIR: "" });
  assert.deepEqual(await verify(expected), assets);
  assert.deepEqual(await treeDigest(projects), before);
  assert.equal(
    await stat(join(projects, "slopify.db")).then(
      () => true,
      () => false,
    ),
    false,
  );
  succeeded = true;
  console.log(
    `Disposable Docker project-folder smoke passed (${mode.includes("name=rootless") ? "rootless" : "rootful"}, host UID ${process.getuid()}). No provider attempts.`,
  );
} finally {
  if (succeeded && process.env.SLOPIFY_DOCKER_SMOKE_KEEP !== "1") {
    const candidates = (
      await docker([
        "container",
        "ls",
        "-a",
        "--filter",
        `name=^/${name}($|-)`,
        "--format",
        "{{.ID}}",
      ])
    )
      .split(/\s+/)
      .filter(Boolean);
    for (const target of candidates) await docker(["rm", "-f", target]);
    const backups = new Set();
    for (const entry of await readdir(installRoot).catch(() => [])) {
      if (!/^[a-f0-9-]{36}$/.test(entry)) continue;
      const journal = JSON.parse(await readFile(join(installRoot, entry, "journal.json"), "utf8"));
      assert.equal(journal.volume, volume);
      assert.equal(journal.backup, `${volume}-recovery-${journal.id}`);
      backups.add(journal.backup);
    }
    const existingVolumes = new Set(
      (await docker(["volume", "ls", "--format", "{{.Name}}"])).split(/\s+/),
    );
    for (const target of [volume, ...backups])
      if (existingVolumes.has(target)) await docker(["volume", "rm", target]);
    const images = await docker(["image", "ls", "-q", badImage]);
    if (images) await docker(["image", "rm", badImage]);
    await rm(root, { recursive: true, force: true });
  } else {
    console.error("Disposable recovery material retained:", root, name, volume);
    console.error("Disposable seed containers and image:", seedContainer, badSeed, badImage);
    console.error("Disposable journals:", installRoot);
    if (url) console.error("Disposable browser QA URL:", url);
    for (const entry of await readdir(installRoot).catch(() => [])) {
      if (!/^[a-f0-9-]{36}$/.test(entry)) continue;
      const journal = JSON.parse(await readFile(join(installRoot, entry, "journal.json"), "utf8"));
      assert.equal(journal.volume, volume);
      assert.equal(journal.backup, `${volume}-recovery-${journal.id}`);
      console.error("Recorded disposable recovery volume:", journal.backup);
      console.error("Recorded disposable container IDs:", journal.previous?.id, journal.candidate);
    }
  }
}
