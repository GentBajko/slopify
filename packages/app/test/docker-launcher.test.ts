import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function launch(fail = false, existing = false, volume = "fixture-data") {
  const root = await mkdtemp(join(tmpdir(), "slopify-docker-test-"));
  roots.push(root);
  const executable = join(root, "docker");
  const log = join(root, "calls.jsonl");
  await writeFile(
    executable,
    `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(process.env.FAKE_LOG,JSON.stringify(args)+'\\n');
let out='';let code=0;
if(args[0]==='container')code=process.env.FAKE_EXISTING==='1'?0:1;
else if(args[0]==='image')out='image-id';
else if(args[0]==='inspect'){const f=args[2]||'';out=f.includes('.Mounts')?process.env.FAKE_VOLUME:f.includes('RestartPolicy')?'always':'old-signature';}
else if(args[0]==='port')out='127.0.0.1:6969';
else if(args[0]==='run'&&process.env.FAKE_FAIL==='1')code=1;
process.stdout.write(out);process.exitCode=code;`,
    { mode: 0o700 },
  );
  await chmod(executable, 0o700);
  const result = await promisify(execFile)(
    "bash",
    [resolve("packages/app/scripts/docker-run.sh")],
    {
      env: {
        ...process.env,
        PATH: `${root}:${process.env.PATH ?? ""}`,
        SLOPIFY_HOST_CLI_DIR: "",
        SLOPIFY_DOCKER_NAME: "fixture",
        SLOPIFY_DOCKER_VOLUME: "fixture-data",
        SLOPIFY_DOCKER_IMAGE: "fixture-image",
        FAKE_LOG: log,
        FAKE_EXISTING: existing ? "1" : "0",
        FAKE_FAIL: fail ? "1" : "0",
        FAKE_VOLUME: volume,
      },
    },
  ).then(
    () => ({ ok: true }),
    () => ({ ok: false }),
  );
  const calls = (await readFile(log, "utf8"))
    .trim()
    .split("\n")
    .map((line): string[] => JSON.parse(line));
  return { ...result, calls };
}
it.skipIf(process.platform !== "linux")(
  "launches API-only Docker with defaults and no executable or credential mounts",
  async () => {
    const result = await launch();
    expect(result.ok).toBe(true);
    const run = result.calls.find((c) => c[0] === "run");
    expect(run).toEqual(
      expect.arrayContaining([
        "--restart",
        "always",
        "127.0.0.1:6969:6969",
        "type=volume,source=fixture-data,target=/data",
      ]),
    );
    expect(run?.join(" ")).not.toMatch(
      /host-clis|GEMINI_API_KEY|models_cache|docker.sock|\/home\//,
    );
  },
);
it.skipIf(process.platform !== "linux")(
  "refuses changing the existing data volume before stopping it",
  async () => {
    const result = await launch(false, true, "different-data");
    expect(result.ok).toBe(false);
    expect(result.calls.some((c) => c[0] === "stop")).toBe(false);
  },
);
it.skipIf(process.platform !== "linux")(
  "restores the previous container when recreation fails",
  async () => {
    const result = await launch(true, true);
    expect(result.ok).toBe(false);
    expect(result.calls.filter((c) => c[0] === "rename")).toHaveLength(2);
    expect(result.calls.at(-2)).toEqual(["update", "--restart=always", "fixture"]);
    expect(result.calls.at(-1)).toEqual(["start", "fixture"]);
  },
);
