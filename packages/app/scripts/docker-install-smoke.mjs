// Adopting an older installation with the packaged install command, on throwaway names only:
// a plain `docker run` container that keeps project files inside its data volume is taken over,
// a failing image is rolled back to the untouched original, and the data volume is reused by name.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { treeDigest } from "../dist/edge/docker-install/tree.js";

assert.equal(process.platform, "linux");
assert.notEqual(process.getuid(), 0);
const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "slopify-docker-projects-"));
const id = randomUUID();
const name = `slopify-install-test-${id}`;
const volume = `${name}-data`;
const seedContainer = `${name}-seed`;
const badSeed = `${name}-bad-seed`;
const badImage = `${name}:bad`;
const image = process.env.SLOPIFY_SMOKE_IMAGE || "slopify:smoke";
const state = join(root, "state");
const seed = join(root, "seed");
const projects = join(root, "Project files");
const installDir = join(state, "slopify/docker", name);
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
};
let launcher;
let succeeded = false;
async function launch(extra = {}, args = ["--docker", "--host-cli=off"]) {
  return run(process.execPath, [launcher, ...args], { ...env, ...extra });
}
async function ready(target) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const ok = await exec(
      "docker",
      [
        "exec",
        target,
        "node",
        "-e",
        "fetch('http://127.0.0.1:6969/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
      ],
      { timeout: 5000 },
    ).then(
      () => true,
      () => false,
    );
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Disposable app failed health verification");
}
async function verify(expected) {
  await ready(name);
  const c = await inspect(name);
  const url = `http://127.0.0.1:${c.NetworkSettings.Ports["6969/tcp"][0].HostPort}`;
  for (const file of expected.files) {
    const route = `/files/${expected.project}/revisions/${file.revision}/${file.record}`;
    assert.equal(await (await fetch(`${url}${route}`)).text(), file.body);
    const reply = await (
      await fetch(
        `${url}/api/projects/${expected.project}/revisions/${file.revision}/${file.record}/open-folder`,
        { method: "POST" },
      )
    ).json();
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
      // Only the seeded project counts: 3.0 adds bundled sample projects, which arrive with
      // their own recorded build history.
      `import {DatabaseSync} from 'node:sqlite'; const p=${JSON.stringify(expected.project)}; const db=new DatabaseSync('/data/slopify.db'); console.log(JSON.stringify({attempts:db.prepare('SELECT count(*) AS n FROM attempts a JOIN stages s ON s.id=a.stage_id WHERE s.project_id=?').get(p).n,paused:db.prepare('SELECT paused FROM project_controls WHERE project_id=?').get(p).paused,state:db.prepare("SELECT state FROM stages WHERE kind='article' AND project_id=?").get(p).state})); db.close();`,
    ]),
  );
  assert.deepEqual(proof, { attempts: 0, paused: 1, state: "failed" });
}
try {
  console.log("Disposable Docker install resources:", root, name, volume);
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
  await run("npm", [
    "install",
    "--prefix",
    join(root, "package"),
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    join(root, packed[0].filename),
  ]);
  const pkg = join(root, "package/node_modules/@gentbajko/slopify");
  launcher = join(pkg, "dist/edge/cli.js");
  for (const path of [
    "dist/compose.yaml",
    "dist/edge/docker-install/run.js",
    "dist/edge/docker-install/apply.js",
    "dist/edge/docker-install/volume.js",
  ])
    assert((await stat(join(pkg, path))).isFile());
  await run(
    "npx",
    ["--no-install", "vitest", "run", "packages/app/test/docker-projects-fixture.test.ts"],
    {
      ...process.env,
      SLOPIFY_DOCKER_FIXTURE_OUT: seed,
    },
  );
  const expected = JSON.parse(await readFile(join(seed, "expected.json"), "utf8"));
  // The user's own project folders, each compared on its own: 3.0 adds the bundled sample
  // projects beside them on first start, which is new content, not a change to theirs.
  const originals = await readdir(join(seed, "projects"));
  const digestsOf = async (root) =>
    Object.fromEntries(
      await Promise.all(originals.map(async (entry) => [entry, await treeDigest(join(root, entry))])),
    );
  const ownBefore = await digestsOf(join(seed, "projects"));

  // An old-style install: plain docker run, project files inside the volume, image's own user.
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

  // A new version that never becomes healthy: the original container comes back untouched.
  await docker(["create", "--name", badSeed, "--tmpfs", "/data", image]);
  await docker(["commit", "--change", 'CMD ["node","-e","process.exit(1)"]', badSeed, badImage]);
  await docker(["rm", badSeed]);
  await assert.rejects(launch({ SLOPIFY_DOCKER_IMAGE: badImage }), /put the previous version back/);
  const restored = await inspect(name);
  assert.equal(restored.Id, original.Id);
  assert.equal(restored.State.Running, true);
  assert.deepEqual(restored.HostConfig.RestartPolicy, original.HostConfig.RestartPolicy);
  await ready(name);
  await assert.rejects(stat(join(installDir, "install.json")));
  await assert.rejects(stat(join(installDir, "update.json")));

  // Adoption: the volume is reused by name, project files are copied out and verified.
  await launch();
  const installed = await inspect(name);
  assert.notEqual(installed.Id, original.Id);
  assert.equal(installed.Config.Labels["com.docker.compose.project"], name);
  assert.equal(installed.HostConfig.RestartPolicy.Name, "unless-stopped");
  assert.equal(installed.Mounts.find((m) => m.Destination === "/data").Name, volume);
  assert.equal(installed.Mounts.find((m) => m.Destination === "/data/projects").Source, projects);
  assert.deepEqual(await digestsOf(projects), ownBefore);
  await verify(expected);
  const mode = JSON.parse(await docker(["info", "--format", "{{json .SecurityOptions}}"]));
  assert.equal(
    installed.Config.User,
    mode.includes("name=rootless") ? "0:0" : `${process.getuid()}:${process.getgid()}`,
  );
  // The adopted original container is gone; its data lives on in the volume.
  assert.equal(
    await docker(["container", "ls", "-a", "--filter", `name=^/${name}-previous-`, "-q"]),
    "",
  );
  assert.equal(
    (await docker(["volume", "ls", "-q", "--filter", `name=^${volume}-recovery-`])).split("\n")
      .length,
    1,
  );

  // Same version again: nothing is recreated. Update on the same version: also nothing.
  await launch({ SLOPIFY_DOCKER_PROJECTS_DIR: "" });
  await launch({ SLOPIFY_DOCKER_PROJECTS_DIR: "" }, ["update", "--host-cli=off"]);
  assert.equal((await inspect(name)).Id, installed.Id);
  // A removed container is recreated from the remembered settings with the same data.
  await docker(["rm", "-f", name]);
  await launch({ SLOPIFY_DOCKER_PROJECTS_DIR: "" });
  await verify(expected);
  assert.deepEqual(await digestsOf(projects), ownBefore);
  succeeded = true;
  console.log(
    `Disposable Docker install smoke passed (${mode.includes("name=rootless") ? "rootless" : "rootful"}, host UID ${process.getuid()}). No provider attempts.`,
  );
} finally {
  if (succeeded || process.env.SLOPIFY_SMOKE_KEEP !== "1") {
    await exec("docker", [
      "compose",
      "--project-directory",
      installDir,
      "--env-file",
      join(installDir, ".env"),
      "--project-name",
      name,
      "down",
    ]).catch(() => {});
    const containers = (
      await docker([
        "container",
        "ls",
        "-a",
        "--filter",
        `name=^/${name}`,
        "--format",
        "{{.Names}}",
      ])
    )
      .split(/\s+/)
      .filter((c) => c === name || c.startsWith(`${name}-`));
    for (const target of containers) await docker(["rm", "-f", target]);
    for (const target of (await docker(["volume", "ls", "--format", "{{.Name}}"])).split(/\s+/))
      if (target === volume || target.startsWith(`${volume}-recovery-`))
        await docker(["volume", "rm", target]);
    if (await docker(["image", "ls", "-q", badImage])) await docker(["image", "rm", badImage]);
    await rm(root, { recursive: true, force: true });
  } else console.error("Disposable smoke material retained:", root, name, volume);
}
