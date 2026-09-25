import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import { dockerConfig, privateDirectory, readState, selectProjects, writeState } from "./state.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function config(env: NodeJS.ProcessEnv = {}) {
  const home = await mkdtemp(join(tmpdir(), "slopify-state-"));
  roots.push(home);
  return dockerConfig(env, home, home, process.getuid?.() ?? 1000, process.getgid?.() ?? 1000);
}
it("uses exact defaults and gives custom names separate project defaults", async () => {
  const c = await config();
  expect(c.name).toBe("slopify");
  expect(c.volume).toBe("slopify-data");
  expect(c.port).toBe(6969);
  expect(await selectProjects(c, null, null)).toBe(join(c.home, "Slopify", "Projects"));
  const other = { ...c, name: "studio" };
  expect(await selectProjects(other, null, null)).toBe(
    join(c.home, "Slopify", "studio", "Projects"),
  );
  expect((await config({ SLOPIFY_DOCKER_PROJECTS_DIR: "./My files" })).projectsOverride).toMatch(
    /My files$/,
  );
});
it.each(["/", "~/", "/etc/slopify", "bad,path"])("refuses unsafe override %s", async (value) => {
  await expect(
    (async () => {
      const c = await config({ SLOPIFY_DOCKER_PROJECTS_DIR: value });
      return selectProjects(c, null, null);
    })(),
  ).rejects.toThrow();
});
it("writes only private bounded control state and refuses corrupted/exposed records", async () => {
  const c = await config();
  await privateDirectory(c.directory, c.uid);
  const path = join(c.directory, "control.json");
  const schema = z.object({ v: z.literal(1) }).strict();
  await writeState(path, { v: 1 });
  expect(await readState(path, schema, c.uid)).toEqual({ v: 1 });
  await chmod(path, 0o644);
  await expect(readState(path, schema, c.uid)).rejects.toThrow("private");
  await chmod(path, 0o600);
  await writeFile(path, "{broken");
  await expect(readState(path, schema, c.uid)).rejects.toThrow();
  await expect(writeState(path, { x: "x".repeat(65 * 1024) })).rejects.toThrow("64 KiB");
  expect(await readFile(path, "utf8")).toBe("{broken");
});
it("accepts an existing owned bind and rejects nonempty unclaimed destinations", async () => {
  const c = await config();
  const projects = join(c.home, "Existing projects");
  await mkdir(projects);
  await writeFile(join(projects, "saved.md"), "saved");
  expect(
    await selectProjects(c, null, {
      id: "old",
      name: c.name,
      image: "old-image",
      user: "1000",
      running: false,
      restart: { Name: "always", MaximumRetryCount: 0 },
      signature: null,
      installation: null,
      mounts: [
        { type: "volume", name: c.volume, source: "/docker/data", destination: "/data", rw: true },
        { type: "bind", name: "", source: projects, destination: "/data/projects", rw: true },
      ],
      port: null,
    }),
  ).toBe(projects);
  await expect(selectProjects({ ...c, projectsOverride: projects }, null, null)).rejects.toThrow(
    "populated",
  );
});
