import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import { errorText } from "../../kernel/errors.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import type { ResolvedFont } from "../fonts/model.js";
import { fontAdvances } from "../fonts/sfnt.js";
import type { RenderRun } from "../video/ffmpeg.js";
import { type CheckFont, checkText } from "./check-text.js";
import { fillDocument } from "./fields.js";
import { coverCrop, frames } from "./frames.js";
import { layoutText } from "./layout.js";
import { type DesignFormat, type DesignResult, formatLabels } from "./model.js";
import type { PdfMaker } from "./pdf-job.js";
import { renderArgs, shrinkArgs } from "./render-args.js";
import { fileName, type Prepared, prepare } from "./render-input.js";

// A finished piece, drawn on demand: the artwork cover-cropped to the format's frame and the
// text layer set over it by libass, in a child ffmpeg (never this thread); print formats then
// go to the PDF worker. One render at a time. Files are a cache under the data dir, named by
// the design and a hash of everything drawn, so the same piece is drawn once; they are never
// backed up and are deleted with the design.

// 2: text measured with the font's own widths.
export const rendererVersion = 2;
export const rendersDir = (paths: Pick<Paths, "dataDir">): string =>
  join(paths.dataDir, "design-renders");

export interface DesignRenderDeps {
  readonly db: DatabaseSync;
  readonly paths: Pick<Paths, "dataDir">;
  readonly log: Log;
  readonly clock: Clock;
  readonly ffmpeg: string;
  readonly runFfmpeg: (run: RenderRun) => Promise<void>;
  readonly font: (fontId: string) => Promise<ResolvedFont>;
  readonly pdf?: PdfMaker | undefined;
}

export interface DesignFile {
  readonly path: string;
  readonly mime: "image/png" | "application/pdf";
  readonly name: string;
}

export interface DesignRenderer {
  readonly render: (
    designId: string,
    format: DesignFormat,
    type: "png" | "pdf",
    signal: AbortSignal,
  ) => Promise<DesignResult<DesignFile>>;
  // A picture made small enough to send to a provider again.
  readonly shrink: (bytes: Uint8Array, signal: AbortSignal) => Promise<Uint8Array>;
}

export function createDesignRenderer(deps: DesignRenderDeps): DesignRenderer {
  let queue: Promise<unknown> = Promise.resolve();
  const oneAtATime = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  const png = async (
    prepared: Prepared,
    designId: string,
    format: DesignFormat,
    signal: AbortSignal,
  ): Promise<DesignResult<string>> => {
    const { doc, art, values } = prepared;
    const frame = frames[format];
    const entry = doc.formats.find((one) => one.format === format);
    const focus = entry?.focus ?? { x: 0.5, y: 0.5 };
    const textLayer = !doc.picture.aiText;
    const fontIds = textLayer ? [...new Set(doc.text.blocks.map((block) => block.fontId))] : [];
    const fonts = new Map<string, ResolvedFont>();
    for (const id of fontIds) {
      try {
        fonts.set(id, await deps.font(id));
      } catch (error) {
        deps.log.write("warn", "designs.render.font", {
          detail: `${designId}: ${errorText(error)}`,
        });
      }
    }
    const filled = fillDocument(doc, values);
    const key = createHash("sha256")
      .update(
        JSON.stringify({
          rendererVersion,
          art: art.sha256,
          format,
          focus,
          text: textLayer ? filled.text : null,
          fonts: [...fonts].map(([id, font]) => [id, font.path, font.faceIndex]),
        }),
      )
      .digest("hex")
      .slice(0, 32);
    const dir = join(rendersDir(deps.paths), designId);
    const target = join(dir, `${format}-${key}.png`);
    // Drawn before from the very same text, fonts and artwork, so it passed the checks then.
    if (existsSync(target)) return { ok: true, value: target };
    const checkFonts: Record<string, CheckFont> = {};
    for (const [id, font] of fonts)
      checkFonts[id] = {
        name: font.name,
        bytes: new Uint8Array(await readFile(font.path)),
        faceIndex: font.faceIndex,
      };
    // Measured with the font's own widths; a font that can't be read is estimated.
    const layoutFonts = Object.fromEntries(
      [...fonts].map(([id, font]) => {
        const bytes = checkFonts[id]?.bytes;
        const advance = bytes === undefined ? undefined : fontAdvances(bytes, font.faceIndex);
        return [id, { assName: font.assName, advance }];
      }),
    );
    const layout = layoutText(frame, doc.text, values, layoutFonts);
    if (textLayer) {
      const problem = checkText({
        text: doc.text,
        values,
        layout,
        fonts: checkFonts,
        formatLabel: formatLabels[format],
      })[0];
      if (problem !== undefined) return { ok: false, reason: "invalid", message: problem.sentence };
    }
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const work = mkdtempSync(join(dir, ".work-"));
    try {
      const artName = art.mime === "image/jpeg" ? "art.jpg" : "art.png";
      writeFileSync(join(work, artName), art.bytes, { mode: 0o600 });
      if (textLayer) {
        mkdirSync(join(work, "fonts"), { mode: 0o700 });
        for (const [index, font] of [...fonts.values()].entries())
          copyFileSync(font.path, join(work, "fonts", `font-${String(index)}${font.extension}`));
        writeFileSync(join(work, "design.ass"), layout.ass, { mode: 0o600 });
      }
      await deps.runFfmpeg({
        bin: deps.ffmpeg,
        cwd: work,
        args: renderArgs({
          art: artName,
          crop: coverCrop(art, frame, focus),
          frame,
          text: textLayer,
          output: "out.png",
        }),
        signal,
        log: deps.log,
        onProgress: () => undefined,
      });
      renameSync(join(work, "out.png"), target);
      dropOlderDrawings(dir, format, target);
      return { ok: true, value: target };
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  };

  return {
    shrink: (bytes, signal) =>
      oneAtATime(async () => {
        const dir = rendersDir(deps.paths);
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        const work = mkdtempSync(join(dir, ".work-"));
        try {
          writeFileSync(join(work, "in"), bytes, { mode: 0o600 });
          await deps.runFfmpeg({
            bin: deps.ffmpeg,
            cwd: work,
            args: shrinkArgs("in", "out.jpg"),
            signal,
            log: deps.log,
            onProgress: () => undefined,
          });
          return new Uint8Array(readFileSync(join(work, "out.jpg")));
        } finally {
          rmSync(work, { recursive: true, force: true });
        }
      }),
    render: (designId, format, type, signal) =>
      oneAtATime(async (): Promise<DesignResult<DesignFile>> => {
        const prepared = prepare(deps.db, designId, format);
        if (!prepared.ok) return prepared;
        const frame = frames[format];
        if (type === "pdf" && frame.pdf === undefined)
          return {
            ok: false,
            reason: "invalid",
            message: `${formatLabels[format]} is a screen size, so it downloads as a PNG. Press Download PNG.`,
          };
        if (type === "png" && format === "brochure")
          return {
            ok: false,
            reason: "invalid",
            message: "A brochure downloads as a PDF. Press Download PDF.",
          };
        const drawn = await png(prepared.value, designId, format, signal);
        if (!drawn.ok) return drawn;
        const name = fileName(prepared.value.doc, prepared.value.values, format);
        if (type === "png")
          return { ok: true, value: { path: drawn.value, mime: "image/png", name: `${name}.png` } };
        const pdfPath = drawn.value.replace(/\.png$/, ".pdf");
        if (!existsSync(pdfPath)) {
          if (deps.pdf === undefined) throw new Error("design PDFs need the PDF worker");
          const page = frame.pdf;
          const filled = fillDocument(prepared.value.doc, prepared.value.values);
          const bytes = await deps.pdf(
            format === "brochure" && filled.brochure !== undefined
              ? {
                  kind: "brochure",
                  cover: new Uint8Array(readFileSync(drawn.value)),
                  title: filled.brochure.title,
                  markdown: filled.brochure.body,
                  settings: filled.brochure.settings,
                  writtenOn: deps.clock.now().toISOString(),
                }
              : {
                  kind: "poster",
                  png: new Uint8Array(readFileSync(drawn.value)),
                  widthMm: page?.widthMm ?? 210,
                  heightMm: page?.heightMm ?? 297,
                },
            signal,
          );
          const partial = `${pdfPath}.part`;
          writeFileSync(partial, bytes, { mode: 0o600 });
          renameSync(partial, pdfPath);
        }
        return { ok: true, value: { path: pdfPath, mime: "application/pdf", name: `${name}.pdf` } };
      }),
  };
}

// What this format looked like before its newest drawing (PNG and PDF): nothing asks for those
// again, so the cache holds one drawing per format.
function dropOlderDrawings(dir: string, format: DesignFormat, target: string): void {
  const keep = basename(target, ".png");
  const drawing = new RegExp(`^(${format}-[a-f0-9]{32})\\.(png|pdf)$`);
  for (const name of readdirSync(dir)) {
    const stem = drawing.exec(name)?.[1];
    if (stem !== undefined && stem !== keep) rmSync(join(dir, name), { force: true });
  }
}

// Every drawn file of a design, removed when it is purged. Design ids are letters, digits,
// dashes and underscores (`requests.ts`), so one is always a single folder name.
export function deleteRenders(paths: Pick<Paths, "dataDir">, designId: string): number {
  const dir = join(rendersDir(paths), designId);
  if (!/^[A-Za-z0-9_-]+$/.test(designId) || !existsSync(dir)) return 0;
  const count = readdirSync(dir).length;
  rmSync(dir, { recursive: true, force: true });
  return count;
}
