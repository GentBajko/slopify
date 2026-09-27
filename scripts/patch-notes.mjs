#!/usr/bin/env node
// Drafts a release's patch notes from the changelog fragments added since the previous
// release tag, for review before the release:
//
//   node scripts/patch-notes.mjs 3.1.0 [--force]
//
// Writes docs/patch-notes/<version>.md and adds the version to docs/patch-notes/index.json
// (newest first). Fragments are docs/capstone/changelog.d/*.md that the previous plain x.y.z
// tag does not have, committed or not. Process records (plan, map and release-verification
// entries, which start with a "## " ledger heading) are left out; every user-facing fragment
// ("# Title" and bullets) becomes one "## Title" section. The draft is a starting point:
// edit it into release notes before tagging.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const fragmentsDir = "docs/capstone/changelog.d";
const notesDir = join(root, "docs/patch-notes");
const release = /^(\d+)\.(\d+)\.(\d+)$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parts(version) {
  const match = release.exec(version);
  return match === null ? undefined : match.slice(1).map(Number);
}

function older(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let at = 0; at < 3; at += 1) if (x[at] !== y[at]) return x[at] < y[at];
  return false;
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const version = args.find((arg) => !arg.startsWith("--"));
if (version === undefined || parts(version) === undefined)
  fail("Usage: node scripts/patch-notes.mjs <version> [--force], with a version such as 3.1.0.");

const previous = git("tag", "--list")
  .split("\n")
  .filter((tag) => release.test(tag) && older(tag, version))
  .sort((a, b) => (older(a, b) ? 1 : -1))[0];
if (previous === undefined)
  fail(
    `There is no release tag before ${version}. Fetch the tags (git fetch --tags) and try again.`,
  );

const released = new Set(
  git("ls-tree", "-r", "--name-only", previous, "--", fragmentsDir).split("\n").filter(Boolean),
);
const fragments = readdirSync(join(root, fragmentsDir))
  .filter((name) => name.endsWith(".md") && !released.has(`${fragmentsDir}/${name}`))
  .sort()
  .map((name) => ({ name, text: readFileSync(join(root, fragmentsDir, name), "utf8").trim() }))
  // User-facing fragments start with "# Title"; process records with a "## " ledger heading.
  .filter((fragment) => /^# /.test(fragment.text));
if (fragments.length === 0)
  fail(`No user-facing changelog fragments were added to ${fragmentsDir} since ${previous}.`);

const target = join(notesDir, `${version}.md`);
if (existsSync(target) && !force)
  fail(`${target} already exists. Edit it, or run again with --force to replace it.`);

const date = new Date().toISOString().slice(0, 10);
const sections = fragments.map((fragment) => fragment.text.replace(/^# /, "## "));
const draft = [
  `# Slopify ${version}`,
  `Released ${date}. Changes since ${previous}.`,
  `<!-- Drafted by scripts/patch-notes.mjs from ${String(fragments.length)} changelog fragments. Write an opening paragraph and a Highlights section, merge related sections and remove this comment before the release. -->`,
  ...sections,
];
writeFileSync(target, `${draft.join("\n\n")}\n`);

const indexPath = join(notesDir, "index.json");
const index = JSON.parse(readFileSync(indexPath, "utf8"));
if (!index.some((note) => note.id === version)) {
  index.unshift({ id: version, title: `Slopify ${version}`, version, date });
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

console.log(
  `Wrote docs/patch-notes/${version}.md from ${String(fragments.length)} fragments since ${previous}, and listed it in docs/patch-notes/index.json. Review it before tagging.`,
);
