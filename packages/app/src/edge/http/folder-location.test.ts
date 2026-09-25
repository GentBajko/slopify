import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { expect, it, vi } from "vitest";
import { replyForFolder } from "./folder-location.js";

it.skipIf(process.platform !== "linux")(
  "returns only the verified file's host parent and never launches a Docker desktop",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "slopify-folder-"));
    try {
      const projects = join(root, "projects");
      await mkdir(join(projects, "p", "history"), { recursive: true });
      const file = join(projects, "p", "history", "old.wav");
      await writeFile(file, "saved");
      let opened = 0;
      const deps = {
        paths: { projects },
        folderLocation: { container: true, hostProjects: "/home/user/Slopify/Projects" },
        openFolder: async () => {
          opened++;
        },
        log: { write: () => undefined },
      };
      const app = new Hono().post("/", (c) => replyForFolder(c, deps, "p", file));
      const response = await app.request("/", { method: "POST" });
      expect(await response.json()).toEqual({
        opened: false,
        location: "docker-host",
        path: "/home/user/Slopify/Projects/p/history",
      });
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(opened).toBe(0);
      await rm(file);
      await symlink(join(root, "private"), file);
      expect((await app.request("/", { method: "POST" })).status).toBe(404);
      const unmanaged = new Hono().post("/", (c) =>
        replyForFolder(
          c,
          { ...deps, folderLocation: { container: true, hostProjects: null } },
          "p",
          file,
        ),
      );
      expect((await unmanaged.request("/", { method: "POST" })).status).toBe(503);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

it
  .skipIf(process.platform !== "linux")
  .each([
    "outside",
    "root",
    "parent",
    "missing",
    "directory",
    "root-file",
    "root-symlink",
    "parent-file",
    "parent-symlink",
  ])("refuses a Docker host path for an unavailable output: %s", async (kind) => {
  const root = await mkdtemp(join(tmpdir(), "slopify-folder-"));
  try {
    const projects = join(root, "projects");
    await mkdir(join(projects, "p"), { recursive: true });
    let file = join(projects, "p", "old.wav");
    await writeFile(file, "saved");
    if (kind === "outside") file = join(root, "private");
    if (kind === "root") file = projects;
    if (kind === "parent") file = root;
    if (kind === "missing") await rm(file);
    if (kind === "directory") {
      await rm(file);
      await mkdir(file);
    }
    if (kind.startsWith("root-")) {
      await rm(projects, { recursive: true });
      if (kind === "root-file") await writeFile(projects, "private");
      else await symlink(root, projects);
    }
    if (kind.startsWith("parent-")) {
      await rm(join(projects, "p"), { recursive: true });
      if (kind === "parent-file") await writeFile(join(projects, "p"), "private");
      else await symlink(root, join(projects, "p"));
    }
    const openFolder = vi.fn();
    const write = vi.fn();
    const app = new Hono().post("/", (c) =>
      replyForFolder(
        c,
        {
          paths: { projects },
          folderLocation: { container: true, hostProjects: "/home/user/Slopify/Projects" },
          openFolder,
          log: { write },
        },
        "p",
        file,
      ),
    );
    const response = await app.request("/", { method: "POST" });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain(root);
    expect(openFolder).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith("warn", "project.locate-folder", {
      projectId: "p",
      detail: "The verified output folder is no longer available.",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("reports an unavailable native opener without exposing filesystem details", async () => {
  const write = vi.fn();
  const app = new Hono().post("/", (c) =>
    replyForFolder(
      c,
      {
        paths: { projects: join(tmpdir(), "projects") },
        log: { write },
      },
      "p",
      join(tmpdir(), "projects", "p", "old.wav"),
    ),
  );
  const response = await app.request("/", { method: "POST" });
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ detail: expect.stringContaining("file manager") });
  expect(write).toHaveBeenCalledWith("warn", "project.open-folder", {
    projectId: "p",
    detail: "The file manager could not be opened for a saved file.",
  });
});
