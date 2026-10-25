import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveFont } from "../fonts/index.js";
import type { ResolvedFont } from "../fonts/model.js";
import type { RenderRun } from "../video/ffmpeg.js";
import { designHarness, type Harness, pngOf } from "./designs.fake.js";
import { poster } from "./document.fake.js";
import type { PdfJob } from "./pdf-job.js";
import { createDesignRenderer, deleteRenders, rendersDir } from "./render.js";
import { createDesign } from "./service.js";

let h: Harness;
afterEach(() => h.cleanup());

const values = { Event: "Late Set", Date: "2026-11-14", Venue: "The Cellar", Price: "€12" };
const signal = new AbortController().signal;

interface Seen {
  readonly args: readonly string[];
  readonly files: readonly string[];
  readonly ass: string | undefined;
}

function setup(
  document = poster({
    formats: [
      { format: "a4", focus: { x: 0.5, y: 0.5 } },
      { format: "square", focus: { x: 0.2, y: 0.5 } },
    ],
  }),
  designValues = values,
  font: (id: string) => Promise<ResolvedFont> = (id) => resolveFont(h.paths, id),
) {
  h = designHarness();
  const made = createDesign(h.deps, {
    id: "d1",
    mutationId: "mutation-0001",
    kind: "design",
    name: "Gig",
    document,
    values: designValues,
    stagedFileId: h.stage(pngOf(1080, 1920)),
  });
  if (!made.ok) throw new Error(made.message);
  const seen: Seen[] = [];
  const jobs: PdfJob[] = [];
  let release: () => void = () => {};
  let hold = false;
  const runFfmpeg = async (run: RenderRun): Promise<void> => {
    const cwd = run.cwd ?? "";
    seen.push({
      args: run.args,
      files: readdirSync(cwd, { recursive: true }).map(String).sort(),
      ass: existsSync(join(cwd, "design.ass"))
        ? readFileSync(join(cwd, "design.ass"), "utf8")
        : undefined,
    });
    if (hold)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    writeFileSync(join(cwd, String(run.args.at(-1))), pngOf(9, 9));
  };
  const renderer = createDesignRenderer({
    db: h.db,
    paths: h.paths,
    log: { write: () => {} },
    clock: h.deps.clock,
    ffmpeg: "ffmpeg",
    runFfmpeg,
    font,
    pdf: async (job) => {
      jobs.push(job);
      return new TextEncoder().encode("%PDF-1.3 fake");
    },
  });
  return {
    renderer,
    seen,
    jobs,
    holdNext: () => {
      hold = true;
    },
    release: () => release(),
  };
}

describe("drawing a designed piece", () => {
  it("crops the artwork to the frame and sets the text with the font in a fonts folder", async () => {
    const { renderer, seen } = setup();
    const file = await renderer.render("d1", "square", "png", signal);
    expect(file.ok && [file.value.mime, file.value.name]).toEqual([
      "image/png",
      "Late-Set-square.png",
    ]);
    expect(file.ok && file.value.path.slice(join(rendersDir(h.paths), "d1").length)).toMatch(
      /^\/square-[a-f0-9]{32}\.png$/,
    );
    expect(seen[0]?.args).toEqual([
      "-hide_banner",
      "-nostdin",
      "-loglevel",
      "error",
      "-y",
      "-i",
      "art.png",
      "-filter_complex",
      "[0:v]scale=1080:1920:flags=lanczos,crop=1080:1080:0:420,ass=filename=design.ass:fontsdir=fonts,format=rgb24[v]",
      "-map",
      "[v]",
      "-frames:v",
      "1",
      "out.png",
    ]);
    expect(seen[0]?.files).toEqual(["art.png", "design.ass", "fonts", "fonts/font-0.ttf"]);
    expect(seen[0]?.ass).toContain("\\fnBarlow");
    expect(seen[0]?.ass).toContain("}Late Set");
    expect(seen[0]?.ass).toContain("}2026-11-14 · The Cellar · €12");
    expect(readdirSync(rendersDir(h.paths)).filter((name) => name.startsWith("."))).toEqual([]);
  });

  it("draws the same piece once, and again once anything drawn changes", async () => {
    const { renderer, seen } = setup();
    const first = await renderer.render("d1", "a4", "png", signal);
    const again = await renderer.render("d1", "a4", "png", signal);
    expect(again).toEqual(first);
    expect(seen).toHaveLength(1);
    h.db.exec(`UPDATE designs SET values_json='${JSON.stringify({ ...values, Price: "€15" })}'`);
    const changed = await renderer.render("d1", "a4", "png", signal);
    expect(changed.ok && first.ok && changed.value.path !== first.value.path).toBe(true);
    expect(seen).toHaveLength(2);
  });

  it("keeps only the newest drawing of each format", async () => {
    const { renderer } = setup();
    const dir = join(rendersDir(h.paths), "d1");
    await renderer.render("d1", "a4", "pdf", signal);
    const square = await renderer.render("d1", "square", "png", signal);
    h.db.exec(`UPDATE designs SET values_json='${JSON.stringify({ ...values, Price: "€15" })}'`);
    const changed = await renderer.render("d1", "a4", "pdf", signal);
    const names = readdirSync(dir).sort();
    expect(names).toHaveLength(3);
    expect(names.filter((name) => name.startsWith("a4-"))).toEqual(
      [
        changed.ok ? changed.value.path.slice(dir.length + 1) : "",
        changed.ok ? changed.value.path.slice(dir.length + 1).replace(/\.pdf$/, ".png") : "",
      ].sort(),
    );
    expect(square.ok && existsSync(square.value.path)).toBe(true);
  });

  it("answers a drawn piece without reading its font files again", async () => {
    let copy = "";
    const { renderer } = setup(undefined, values, async (id) => {
      const font = await resolveFont(h.paths, id);
      return { ...font, path: copy };
    });
    copy = join(h.paths.dataDir, "font-copy.ttf");
    copyFileSync((await resolveFont(h.paths, "default")).path, copy);
    const first = await renderer.render("d1", "a4", "png", signal);
    expect(first.ok).toBe(true);
    rmSync(copy);
    expect(await renderer.render("d1", "a4", "png", signal)).toEqual(first);
  });

  it("draws one piece at a time, and answers a drawn one without waiting", async () => {
    const { renderer, seen, holdNext, release } = setup();
    await renderer.render("d1", "square", "png", signal);
    holdNext();
    const slow = renderer.render("d1", "a4", "png", signal);
    const queued = renderer.render("d1", "square", "png", signal);
    await vi.waitFor(() => expect(seen).toHaveLength(2));
    let queuedDone = false;
    void queued.then(() => {
      queuedDone = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(queuedDone).toBe(false);
    release();
    await slow;
    await queued;
    expect(seen).toHaveLength(2);
  });

  it("leaves the text layer off when the AI drew the text", async () => {
    const { renderer, seen } = setup(poster({ picture: { ...poster().picture, aiText: true } }));
    await renderer.render("d1", "a4", "png", signal);
    expect(seen[0]?.files).toEqual(["art.png"]);
    expect(seen[0]?.args.join(" ")).not.toContain("ass=");
  });

  it("makes a print PDF from the drawn page, once", async () => {
    const { renderer, jobs } = setup();
    const pdf = await renderer.render("d1", "a4", "pdf", signal);
    expect(
      pdf.ok && [pdf.value.mime, pdf.value.name, readFileSync(pdf.value.path, "utf8")],
    ).toEqual(["application/pdf", "Late-Set-a4.pdf", "%PDF-1.3 fake"]);
    expect(jobs).toEqual([{ kind: "poster", png: pngOf(9, 9), widthMm: 210, heightMm: 297 }]);
    await renderer.render("d1", "a4", "pdf", signal);
    expect(jobs).toHaveLength(1);
  });

  it("sends a brochure's cover, title and pages to the PDF worker", async () => {
    const { renderer, jobs } = setup(
      poster({
        formats: [{ format: "brochure", focus: { x: 0.5, y: 0.5 } }],
        brochure: {
          settings: { theme: "plain" },
          title: "{{Event}} programme",
          body: "# Tonight\n\nAt {{Venue}}.",
        },
      }),
    );
    await renderer.render("d1", "brochure", "pdf", signal);
    expect(jobs[0]).toMatchObject({
      kind: "brochure",
      title: "Late Set programme",
      markdown: "# Tonight\n\nAt The Cellar.",
      settings: { theme: "plain" },
    });
  });

  it("says what to do when a piece can't be drawn", async () => {
    const { renderer, seen } = setup(undefined, { ...values, Price: "" });
    const message = async (format: "a4" | "square" | "wide" | "brochure", type: "png" | "pdf") => {
      const result = await renderer.render("d1", format, type, signal);
      return result.ok ? "drawn" : result.message;
    };
    expect(await message("a4", "png")).toBe(
      "{{Price}} has no value. Fill it in under Keywords, then press Make.",
    );
    expect(await message("wide", "png")).toBe(
      "Wide 16:9 isn't ticked for this design. Tick it under Formats, then download again.",
    );
    h.db.exec(`UPDATE designs SET values_json='${JSON.stringify(values)}'`);
    expect(await message("square", "pdf")).toBe(
      "Square 1:1 is a screen size, so it downloads as a PNG. Press Download PNG.",
    );
    h.db.exec(`UPDATE designs SET values_json='${JSON.stringify({ ...values, Venue: "Москва" })}'`);
    expect(await message("a4", "png")).toMatch(/^The font Barlow \S+ has no “М”/);
    h.db.exec("UPDATE designs SET head_step_id=NULL");
    expect(await message("a4", "png")).toBe(
      "This design has no artwork yet. Press Make to draw it, then download again.",
    );
    h.db.exec("UPDATE designs SET document_json=NULL");
    expect(await message("a4", "png")).toMatch(/^This picture has no formats yet/);
    expect(seen).toEqual([]);
  });

  it("deletes every drawn file of a design", async () => {
    const { renderer } = setup();
    await renderer.render("d1", "a4", "pdf", signal);
    expect(deleteRenders(h.paths, "d1")).toBe(2);
    expect(existsSync(join(rendersDir(h.paths), "d1"))).toBe(false);
    expect(deleteRenders(h.paths, "../x")).toBe(0);
  });

  it("shrinks a picture to a JPEG through ffmpeg", async () => {
    const { renderer, seen } = setup();
    expect(await renderer.shrink(pngOf(5000, 5000), signal)).toEqual(pngOf(9, 9));
    expect(seen[0]?.args).toContain(
      "scale=w='min(iw,4096)':h='min(ih,4096)':force_original_aspect_ratio=decrease",
    );
  });
});
