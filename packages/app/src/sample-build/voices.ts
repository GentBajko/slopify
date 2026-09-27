import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type DemoRequest, demoRequests } from "./demo-turns.js";
import { demoOf } from "./demos.js";

// Speaks a demo's turns into its assets folder for build-sample.mjs --demo <id> --assets, in
// the maintainer's running Slopify container (named "slopify"), with the Inworld key saved
// there: container-voices.mjs runs inside it on the installed app's Inworld adapter, the key
// stays in that process, and only the MP3s come out. It writes to the container's /tmp and
// removes what it wrote; the container's data is opened read-only. A turn whose file is
// already in the folder is not spoken again.
//
//   node --import ./scripts/ts-resolve.mjs src/sample-build/voices.ts --demo <id> <folder>
//   node --import ./scripts/ts-resolve.mjs src/sample-build/voices.ts --library <folder>

const folder = process.argv.at(-1);
const flag = process.argv.indexOf("--demo");
const library = process.argv.includes("--library");
if (folder === undefined || (flag === -1 && !library) || folder.endsWith(".ts"))
  throw new Error("Usage: voices.ts --demo <id> <folder> | voices.ts --library <folder>");
mkdirSync(folder, { recursive: true });

// The Library's requests are the ones a recording build listed (`generate.ts`, SAMPLE_RECORD);
// a demo's are worked out from its script.
const requests: readonly DemoRequest[] = library
  ? (JSON.parse(readFileSync(join(folder, "turns.json"), "utf8")) as DemoRequest[])
  : demoRequests(demoOf(process.argv[flag + 1] ?? ""));
if (!library) writeFileSync(join(folder, "turns.json"), `${JSON.stringify(requests, null, 2)}\n`);
const label = library ? "library" : (process.argv[flag + 1] ?? "demo");
const missing = requests.filter((request) => !existsSync(join(folder, request.file)));
console.log(
  `${String(requests.length)} requests, ${String(requests.reduce((sum, one) => sum + one.text.length, 0))} characters; ${String(missing.length)} to speak.`,
);
if (missing.length > 0) {
  const container = "slopify";
  const inside = `/tmp/slopify-demo-${label}`;
  const local = join(folder, "speak");
  mkdirSync(local, { recursive: true });
  writeFileSync(join(local, "turns.json"), JSON.stringify(missing));
  const docker = (...args: string[]): void => {
    execFileSync("docker", args, { stdio: "inherit" });
  };
  try {
    docker("exec", container, "mkdir", "-p", inside);
    docker(
      "cp",
      fileURLToPath(new URL("./container-voices.mjs", import.meta.url)),
      `${container}:${inside}/container-voices.mjs`,
    );
    docker("cp", join(local, "turns.json"), `${container}:${inside}/turns.json`);
    docker(
      "exec",
      container,
      "node",
      `${inside}/container-voices.mjs`,
      "speak",
      `${inside}/turns.json`,
    );
    for (const request of missing)
      docker("cp", `${container}:${inside}/${request.file}`, join(folder, request.file));
  } finally {
    docker("exec", container, "rm", "-rf", inside);
    rmSync(local, { recursive: true, force: true });
  }
}
