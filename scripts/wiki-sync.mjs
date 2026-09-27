#!/usr/bin/env node
// Copies the tutorials (docs/wiki/*.md, the one source Help → Tutorials also ships) into a
// checkout of the GitHub wiki, so the wiki reads what the app does. It only writes files:
// review, commit and push in the wiki checkout yourself.
//
//   node scripts/wiki-sync.mjs ../slopify.wiki
//
// A page the repository no longer has is reported, not deleted, so a page written only on
// GitHub survives; pass --delete to remove those too.
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../docs/wiki/", import.meta.url));
const args = process.argv.slice(2);
const remove = args.includes("--delete");
const target = args.find((arg) => !arg.startsWith("--"));

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (target === undefined)
  fail(
    "Say which wiki checkout to copy into: node scripts/wiki-sync.mjs <path to slopify.wiki>. Clone it first with git clone https://github.com/GentBajko/slopify.wiki.git.",
  );
const wiki = resolve(target);
if (!existsSync(wiki) || !statSync(wiki).isDirectory())
  fail(`${wiki} is not a folder. Clone the wiki there first, or pass the path of your clone.`);
if (!existsSync(join(wiki, ".git")))
  fail(
    `${wiki} is not a git checkout (it has no .git). Pass the folder you cloned https://github.com/GentBajko/slopify.wiki.git into.`,
  );
if (!existsSync(join(source, "Home.md")))
  fail(`${source} has no Home.md. Run this from the Slopify repository.`);

const pages = readdirSync(source).filter((name) => name.endsWith(".md"));
let changed = 0;
for (const name of pages) {
  const from = join(source, name);
  const to = join(wiki, name);
  const there = existsSync(to);
  if (there && readFileSync(to, "utf8") === readFileSync(from, "utf8")) continue;
  copyFileSync(from, to);
  changed += 1;
  console.log(`${there ? "updated" : "added"} ${name}`);
}

const kept = new Set(pages);
const extra = readdirSync(wiki).filter((name) => name.endsWith(".md") && !kept.has(name));
for (const name of extra) {
  if (remove) {
    rmSync(join(wiki, name));
    console.log(`deleted ${name}`);
  } else console.log(`not in docs/wiki (left alone; --delete removes it): ${name}`);
}

console.log(
  changed === 0 && (extra.length === 0 || !remove)
    ? `The wiki at ${wiki} already matches docs/wiki (${String(pages.length)} pages).`
    : `Copied ${String(changed)} of ${String(pages.length)} pages into ${wiki}. Review with git -C ${wiki} diff, then commit and push there.`,
);
