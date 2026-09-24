import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { installHostPackage } from "./install.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
it("installs an exact version without scripts outside the npx cache and reuses it", async () => {
  const root = await mkdtemp(join(tmpdir(), "sb-"));
  roots.push(root);
  const calls: string[][] = [];
  const options = {
    root,
    version: "1.4.0",
    signal: AbortSignal.timeout(2000),
    runner: {
      exec: async (_file: string, args: readonly string[]) => {
        calls.push([...args]);
        const prefix = args[args.indexOf("--prefix") + 1];
        if (!prefix) throw new Error("Missing prefix");
        const path = join(prefix, "node_modules/@gentbajko/slopify");
        await mkdir(join(path, "dist/edge"), { recursive: true });
        await writeFile(
          join(path, "package.json"),
          JSON.stringify({ name: "@gentbajko/slopify", version: "1.4.0" }),
        );
        await writeFile(join(path, "dist/edge/host-cli.js"), "// fixture");
        return { code: 0, stdout: "" };
      },
    },
  };
  const installed = await installHostPackage(options);
  expect(installed.entry).toContain(join(root, "versions/1.4.0"));
  expect(await readFile(installed.entry, "utf8")).toBe("// fixture");
  expect(calls[0]).toEqual(
    expect.arrayContaining([
      "--ignore-scripts",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      "@gentbajko/slopify@1.4.0",
    ]),
  );
  await installHostPackage(options);
  expect(calls).toHaveLength(1);
});
it("does not activate a failed or mismatched package", async () => {
  const root = await mkdtemp(join(tmpdir(), "sb-"));
  roots.push(root);
  await expect(
    installHostPackage({
      root,
      version: "1.4.0",
      signal: AbortSignal.timeout(2000),
      runner: { exec: async () => ({ code: 1, stdout: "private data" }) },
    }),
  ).rejects.toThrow("install");
  await expect(
    installHostPackage({
      root,
      version: "../escape",
      signal: AbortSignal.timeout(2000),
      runner: {
        exec: async () => {
          throw new Error("Should not run");
        },
      },
    }),
  ).rejects.toThrow("version");
});
