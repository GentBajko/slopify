import { type Context, Hono } from "hono";
import { tutorialPageIdPattern } from "../../slices/tutorials/anchors.js";
import {
  bundledTutorialsDir,
  loadTutorials,
  searchTutorials,
  type TutorialBook,
  TutorialsMissing,
} from "../../slices/tutorials/library.js";
import type { AppDeps } from "./app.js";
import { problem, titleOf } from "./problem.js";

// A build without its tutorials says so in plain words; anything else is the app's error handler's.
function missing(c: Context, error: unknown): Response {
  if (!(error instanceof TutorialsMissing)) throw error;
  return problem(c, { status: 500, title: titleOf(500), detail: error.message });
}

// Help → Tutorials: the sidebar and page list, a search across every page, and one page's
// Markdown. The pages ship with the app, so they are read once and kept.
// Preserve Hono's inferred route types for the web client.
export function tutorialPagesRoutes(deps: Pick<AppDeps, "tutorialsDir">) {
  const dir = deps.tutorialsDir ?? bundledTutorialsDir();
  let book: Promise<TutorialBook> | undefined;
  const read = (): Promise<TutorialBook> => {
    book ??= loadTutorials(dir).catch((error: unknown) => {
      book = undefined;
      throw error;
    });
    return book;
  };
  return new Hono()
    .get("/", async (c) => {
      try {
        return c.json((await read()).index);
      } catch (error) {
        return missing(c, error);
      }
    })
    .get("/search", async (c) => {
      const query = (c.req.query("q") ?? "").slice(0, 200);
      try {
        return c.json({ hits: searchTutorials(await read(), query) });
      } catch (error) {
        return missing(c, error);
      }
    })
    .get("/:page", async (c) => {
      const id = c.req.param("page");
      let markdown: string | undefined;
      try {
        markdown = tutorialPageIdPattern.test(id) ? (await read()).pages.get(id) : undefined;
      } catch (error) {
        return missing(c, error);
      }
      if (markdown === undefined)
        return problem(c, {
          status: 404,
          title: titleOf(404),
          detail: `There is no tutorial called ${id} in this version of Slopify. Pick one from the list on Help → Tutorials, or search there.`,
        });
      return c.body(markdown, 200, { "content-type": "text/markdown; charset=utf-8" });
    });
}
