import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { tutorialAnchors } from "../../slices/tutorials/anchors.js";
import { bundledTutorialsDir, type TutorialsIndex } from "../../slices/tutorials/library.js";
import { tutorialPagesRoutes } from "./tutorials.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function pagesDir(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), "slopify-tutorials-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

function app(dir: string): Hono {
  return new Hono().route("/api/tutorials", tutorialPagesRoutes({ tutorialsDir: dir }));
}

const sample = {
  "Home.md": "# Home\n\nStart with [Install](Install).\n",
  "Install.md":
    "# Install\n\n## With Docker\n\nRun the Docker command.\n\n## Without Docker\n\nRun npx.\n",
  "Loose-Page.md": "# Loose\n\nNot in the sidebar.\n",
  "_Sidebar.md":
    "**[Home](Home)**\n\n**Getting started**\n- [Install it](Install)\n- [Gone](Missing-Page)\n",
  "_Footer.md": "Slopify is free.\n",
};

describe("GET /api/tutorials", () => {
  it("lists the sidebar's groups and every page", async () => {
    const index = (await (
      await app(pagesDir(sample)).request("/api/tutorials")
    ).json()) as TutorialsIndex;
    expect(index.home).toEqual({ id: "Home", title: "Home" });
    expect(index.groups).toEqual([
      { title: "Getting started", pages: [{ id: "Install", title: "Install it" }] },
    ]);
    expect(index.pages.map((page) => page.id)).toEqual(["Home", "Install", "Loose-Page"]);
    expect(index.footer).toBe("Slopify is free.");
  });

  it("serves a page's Markdown and says plainly when there is no such page", async () => {
    const tutorials = app(pagesDir(sample));
    const page = await tutorials.request("/api/tutorials/Install");
    expect(page.headers.get("content-type")).toContain("text/markdown");
    expect(await page.text()).toContain("## With Docker");
    const gone = await tutorials.request("/api/tutorials/Missing-Page");
    expect(gone.status).toBe(404);
    expect(((await gone.json()) as { detail: string }).detail).toMatch(/Help → Tutorials/);
    expect((await tutorials.request("/api/tutorials/_Sidebar")).status).toBe(404);
  });

  it("searches every page's sections, a heading's words first", async () => {
    const reply = (await (
      await app(pagesDir(sample)).request("/api/tutorials/search?q=docker")
    ).json()) as { hits: { page: string; anchor: string }[] };
    expect(reply.hits.slice(0, 2)).toEqual([
      expect.objectContaining({ page: "Install", anchor: "with-docker" }),
      expect.objectContaining({ page: "Install", anchor: "without-docker" }),
    ]);
  });

  it("says what is missing when the build has no tutorials", async () => {
    const reply = await app(join(tmpdir(), "slopify-no-tutorials-here")).request("/api/tutorials");
    expect(reply.status).toBe(500);
    expect(((await reply.json()) as { detail: string }).detail).toMatch(/Reinstall Slopify/);
  });
});

describe("the bundled tutorials", () => {
  const dir = bundledTutorialsDir();
  const pages = new Map(
    readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => [name.replace(/\.md$/, ""), readFileSync(join(dir, name), "utf8")]),
  );

  it("link only to pages and sections that exist", () => {
    const broken: string[] = [];
    for (const [id, markdown] of pages) {
      for (const link of markdown.matchAll(/\]\(([A-Za-z0-9_][A-Za-z0-9-]*)?(?:#([^)\s]+))?\)/g)) {
        const target = link[1] ?? id;
        const anchor = link[2];
        if (link[1] === undefined && anchor === undefined) continue;
        const text = pages.get(target);
        if (text === undefined) broken.push(`${id}: ${link[0]}`);
        else if (anchor !== undefined && !tutorialAnchors(text).has(anchor))
          broken.push(`${id}: ${link[0]}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("put every page in the sidebar", async () => {
    const index = (await (await app(dir).request("/api/tutorials")).json()) as TutorialsIndex;
    const listed = new Set(index.groups.flatMap((group) => group.pages.map((page) => page.id)));
    const left = [...pages.keys()].filter(
      (id) => !id.startsWith("_") && id !== index.home.id && !listed.has(id),
    );
    expect(left).toEqual([]);
  });
});
