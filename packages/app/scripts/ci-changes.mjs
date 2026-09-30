// Which of CI's slow checks a push needs (.github/workflows/ci.yml, job `changes`).
//
// Windows and the Docker smoke tests run only on the way to a release (the app's version has
// no tag yet), and then only when something they check changed since they last passed: the
// newest commit on main where that job succeeded since the last release, or the last release
// tag when none has. So the push that bumps the version runs them, and a docs push after it
// doesn't run them again. Every release bumps the version in package.json and
// package-lock.json, so a version-only change doesn't count. Writes `release`, `windows` and
// `docker` to $GITHUB_OUTPUT (or prints them).

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const tagged = (name) => {
  try {
    git("rev-parse", "-q", "--verify", `refs/tags/${name}`);
    return true;
  } catch {
    return false;
  }
};

const version = JSON.parse(readFileSync("packages/app/package.json", "utf8")).version;
const release = !tagged(version);

// The last release tag reachable from here, or nothing (then everything runs).
let base = "";
try {
  base = git("describe", "--tags", "--abbrev=0", "--match", "[0-9]*.[0-9]*.[0-9]*", "HEAD");
} catch {
  base = "";
}

// A package.json or package-lock.json with the versions of Slopify's own workspaces left out.
const withoutVersions = (path, text) => {
  const json = JSON.parse(text);
  if (path.endsWith("package-lock.json")) {
    delete json.version;
    for (const [key, entry] of Object.entries(json.packages ?? {}))
      if (key === "" || key.startsWith("packages/")) delete entry.version;
  } else delete json.version;
  return JSON.stringify(json);
};
const realChange = (path) => {
  if (!/(^|\/)package(-lock)?\.json$/.test(path)) return true;
  let before;
  try {
    before = git("show", `${base}:${path}`);
  } catch {
    return true;
  }
  let now;
  try {
    now = readFileSync(path, "utf8");
  } catch {
    return true;
  }
  return withoutVersions(path, before) !== withoutVersions(path, now);
};

// The newest commit since `base` whose CI run on main passed every job named `job` (a matrix
// job is several), when the run can be read: GH_TOKEN and GITHUB_REPOSITORY in CI. Anything
// unreadable answers undefined, and the check then runs as if it never passed.
async function lastPassed(job) {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;
  if (!release || base === "" || !repository || !token) return undefined;
  const api = async (path) => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitHub API ${String(response.status)} for ${path}`);
    return response.json();
  };
  try {
    const since = new Set(git("rev-list", `${base}..HEAD`).split("\n").filter(Boolean));
    const { workflow_runs: runs } = await api(
      "actions/workflows/ci.yml/runs?branch=main&status=success&per_page=30",
    );
    for (const run of runs) {
      if (!since.has(run.head_sha)) continue;
      const { jobs } = await api(`actions/runs/${String(run.id)}/jobs?per_page=100`);
      const named = jobs.filter((one) => one.name === job || one.name.startsWith(`${job} (`));
      if (named.length > 0 && named.every((one) => one.conclusion === "success"))
        return run.head_sha;
    }
  } catch (error) {
    console.log(`Could not read earlier runs (${String(error)}); checking since ${base}.`);
  }
  return undefined;
}

const changedSince = (from) =>
  from === "" ? null : git("diff", "--name-only", from, "HEAD").split("\n").filter(Boolean);
// A package.json change counts against the last release tag: that is where its version was
// last bumped, and `realChange` compares with that file.
const touched = (pattern, from) => {
  const changed = changedSince(from);
  return changed === null || changed.some((path) => pattern.test(path) && realChange(path));
};

const shared = String.raw`^(package-lock\.json|package\.json|packages/app/package\.json|\.github/workflows/|packages/app/scripts/ci-changes\.mjs)`;
// What the Windows job installs and tests: the package and how it starts and updates, and the
// platform-specific code its test list covers.
const windowsPaths = new RegExp(
  `${shared}|^packages/app/(scripts/|src/(main\\.ts|edge/cli|edge/launch|edge/open-folder|edge/http/(files|fonts)|updater/|kernel/(paths|cli-command)|adapters/(ffmpeg|llm/)|adapter-registry-paths|slices/(fonts/|settings/cli-|storage/assets|video/|subtitles/))|test/(e2e/skeleton|video-render))`,
);
// What the container jobs build and test: the image, the Docker installer and the host bridge.
const dockerPaths = new RegExp(
  `${shared}|^(Dockerfile|compose\\.yaml|\\.dockerignore|docker/)|^packages/app/(src/(edge/docker|edge/docker-install|edge/host-cli|host-cli|adapters/host-cli)|scripts/(container|host-cli|docker-install))`,
);

const windowsBase = (await lastPassed("windows")) ?? base;
const dockerBase = (await lastPassed("container")) ?? base;
const outputs = {
  release,
  windows: release && touched(windowsPaths, windowsBase),
  docker: release && touched(dockerPaths, dockerBase),
};
const lines = Object.entries(outputs).map(([key, value]) => `${key}=${String(value)}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
console.log(
  `Since ${base || "the start"} (Windows since ${windowsBase || "the start"}, Docker since ${dockerBase || "the start"}): ${lines.join(", ")}`,
);
