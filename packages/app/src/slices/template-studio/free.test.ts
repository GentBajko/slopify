import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, describe, expect, it } from "vitest";
import { defaultLoudness } from "../loudness/model.js";
import { draftFixture } from "../play-drafts/draft.fake.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { bundledSampleAssets } from "../style-preview/narration.js";
import { StylePreviewError } from "../style-preview/render.js";
import type { StylePreviews } from "../style-preview/service.js";
import { resolveFfmpeg } from "../video/ffmpeg.js";
import { createDocumentSamples, documentHash, documentThemeOfTemplate } from "./document-sample.js";
import { createFreeSamples, type FreeSampleDeps } from "./free.js";
import { videoSampleRequest } from "./free-video.js";
import { createLoudnessSamples, loudnessGoalOf, loudnessHash } from "./loudness.js";

const fixture = draftFixture();
const base: PlayDraftDocument = {
  ...fixture.document,
  form: {
    ...fixture.document.form,
    sources: { ...fixture.document.form.sources, document: "generate" },
  },
};
fixture.close();
const scratch = mkdtempSync(join(tmpdir(), "slopify-studio-free-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const idle = { running: false, queued: false };

function previews(fail?: Error): StylePreviews & { readonly asked: string[] } {
  const made = new Set<string>();
  const asked: string[] = [];
  return {
    asked,
    render: async (request) => {
      asked.push(`${String(request.seconds)}s ${request.format}`);
      if (fail !== undefined) throw fail;
      const { normalizeStylePreview, stylePreviewHash } = await import(
        "../style-preview/settings.js"
      );
      const hash = stylePreviewHash(normalizeStylePreview(request));
      made.add(hash);
      return { hash, cached: false, seconds: 30, version: 7 };
    },
    file: (hash) => (made.has(hash) ? { path: "/x.mp4", bytes: 10, version: 7 } : undefined),
  };
}

function deps(overrides: Partial<FreeSampleDeps> = {}): FreeSampleDeps {
  return {
    stylePreviews: previews(),
    documents: createDocumentSamples({
      dir: join(scratch, `pdf-${Math.random().toString(36).slice(2)}`),
      render: () => new Uint8Array([37, 80, 68, 70]),
    }),
    loudnessDefault: () => defaultLoudness,
    ...overrides,
  };
}

describe("videoSampleRequest", () => {
  it("asks for 30 seconds in the template's frame, captions and picture timing", () => {
    const document = {
      ...base,
      form: {
        ...base.form,
        format: "9:16" as const,
        imageSeconds: "7",
        motionStyle: "pan" as const,
      },
    };
    expect(videoSampleRequest(document)).toMatchObject({
      format: "9:16",
      seconds: 30,
      timing: { imageSeconds: 7, zoomPercent: 22.5, motionStyle: "pan" },
    });
  });

  it("falls back to the defaults for numbers typed wrong, and a font id it can't use", () => {
    const document = {
      ...base,
      form: {
        ...base.form,
        imageSeconds: "soon",
        zoomPercent: "",
        subtitles: { ...base.form.subtitles, fontSize: "900", fontId: "../etc" },
      },
    };
    expect(videoSampleRequest(document)).toMatchObject({
      subtitles: { fontSize: 120, fontId: "default" },
      timing: { imageSeconds: 15, zoomPercent: 22.5 },
    });
  });
});

describe("loudnessGoalOf", () => {
  it("levels to the template's own video target, or Settings' when it set none", () => {
    expect(loudnessGoalOf(base, defaultLoudness)).toEqual({ lufs: -14, truePeak: -2.5 });
    const own = { ...base, form: { ...base.form, loudness: { enabled: true, videoLufs: -16 } } };
    expect(loudnessGoalOf(own, defaultLoudness)?.lufs).toBe(-16);
  });

  it("is undefined while Level the volume is off, in the template or in Settings", () => {
    const off = { ...base, form: { ...base.form, loudness: { enabled: false } } };
    expect(loudnessGoalOf(off, defaultLoudness)).toBeUndefined();
    expect(loudnessGoalOf(base, { ...defaultLoudness, enabled: false })).toBeUndefined();
  });
});

describe("free samples", () => {
  it("shows every sample as not made yet, then makes each and shows it current", async () => {
    const free = createFreeSamples(deps());
    const before = free.view("t1", base, idle);
    expect(before.video).toMatchObject({ state: "stale", url: null });
    expect(before.document.state).toBe("stale");
    await free.make(base, new AbortController().signal);
    const after = free.view("t1", base, idle);
    expect(after.video.state).toBe("current");
    expect(after.video.url).toMatch(/^\/api\/style-preview\/[a-f0-9]{64}\.mp4\?v=7$/);
    expect(after.document).toMatchObject({ state: "current" });
    expect(after.document.url).toMatch(/^\/api\/template-studio\/t1\/document\.pdf\?v=/);
  });

  it("says making while its job runs, and waiting while it is queued behind another", () => {
    const free = createFreeSamples(deps());
    expect(free.view("t1", base, { running: true, queued: false }).video.state).toBe("making");
    expect(free.view("t1", base, { running: false, queued: true }).video.state).toBe("waiting");
  });

  it("is off for what the template doesn't make", () => {
    const free = createFreeSamples(deps());
    const off = {
      ...base,
      form: {
        ...base.form,
        loudness: { enabled: false },
        sources: { ...base.form.sources, video: "off" as const, document: "off" as const },
      },
    };
    const view = free.view("t1", off, idle);
    expect([view.video.state, view.loudness.state, view.document.state]).toEqual([
      "off",
      "off",
      "off",
    ]);
  });

  it("names the fix when the caption font is gone", async () => {
    const free = createFreeSamples(
      deps({ stylePreviews: previews(new StylePreviewError("font-missing", "gone")) }),
    );
    await free.make(base, new AbortController().signal);
    expect(free.view("t1", base, idle).video).toEqual({
      state: "needs-fix",
      sentence:
        "The video sample couldn't be made because the caption font is no longer on this computer. Choose another Caption font in Video and style, then press Make sample.",
      url: null,
    });
  });

  it("says ffmpeg wasn't found, or stopped, in words that say what to do", async () => {
    const missing = createFreeSamples(
      deps({ stylePreviews: previews(new Error("spawn ffmpeg ENOENT")) }),
    );
    await missing.make(base, new AbortController().signal);
    expect(missing.view("t1", base, idle).video.sentence).toBe(
      "The video sample couldn't be made because ffmpeg wasn't found. Install ffmpeg, or use the Docker image, then press Make sample.",
    );
    const stopped = createFreeSamples(deps({ stylePreviews: previews(new Error("exit 1")) }));
    await stopped.make(base, new AbortController().signal);
    expect(stopped.view("t1", base, idle).video.sentence).toBe(
      "The video sample couldn't be made because ffmpeg stopped with an error. Press Make sample again; if it fails again, use Download diagnostics in Settings and report it.",
    );
  });

  it("says the PDF couldn't be made and where to change the theme", async () => {
    const free = createFreeSamples(
      deps({
        documents: createDocumentSamples({
          dir: join(scratch, "broken"),
          render: () => {
            throw new Error("The cover is unreadable.");
          },
        }),
      }),
    );
    await free.make(base, new AbortController().signal);
    expect(free.view("t1", base, idle).document.sentence).toBe(
      "The PDF sample couldn't be made: The cover is unreadable. Change the theme under All PDF settings, then press Make sample.",
    );
  });

  it("says how to get the renderer back when Slopify started without it", () => {
    const free = createFreeSamples({ loudnessDefault: () => defaultLoudness });
    const view = free.view("t1", base, idle);
    expect(view.video.state).toBe("needs-fix");
    expect(view.video.sentence).toContain("started without ffmpeg");
    expect(view.loudness.state).toBe("needs-fix");
  });

  it("stops between samples when Slopify shuts down", async () => {
    const stylePreviews = previews();
    const controller = new AbortController();
    const documents = createDocumentSamples({
      dir: join(scratch, "aborted"),
      render: () => new Uint8Array([1]),
    });
    const free = createFreeSamples({ ...deps(), stylePreviews, documents });
    controller.abort();
    await free.make(base, controller.signal);
    expect(stylePreviews.asked).toEqual(["30s 16:9"]);
    expect(documents.file(documentHash(documentThemeOfTemplate(base)))).toBeUndefined();
  });
});

describe("the document sample", () => {
  it("lays the sample article out in the template's theme, kept by the theme's hash", () => {
    const dir = join(scratch, "real-pdf");
    const samples = createDocumentSamples({ dir });
    const theme = documentThemeOfTemplate(base);
    samples.make(theme);
    const saved = samples.file(documentHash(theme));
    expect(saved?.bytes).toBeGreaterThan(1000);
    expect(
      readFileSync(saved?.path ?? "")
        .subarray(0, 4)
        .toString(),
    ).toBe("%PDF");
    expect(samples.file("not-a-hash")).toBeUndefined();
  });
});

const bin = (() => {
  try {
    const found = resolveFfmpeg(process.env, ffmpegStatic);
    return existsSync(found) ? found : undefined;
  } catch {
    return undefined;
  }
})();

it.skipIf(bin === undefined)(
  "levels the sample narration to the template's target and reads both levels",
  async () => {
    const samples = createLoudnessSamples({
      ffmpeg: bin ?? "",
      dir: join(scratch, "loudness"),
      source: bundledSampleAssets().narration,
      log: { write: () => undefined },
    });
    const goal = { lufs: -14, truePeak: -2.5 };
    await samples.make(goal, AbortSignal.timeout(60_000));
    const hash = loudnessHash(goal);
    expect(samples.file(hash)?.bytes).toBeGreaterThan(1000);
    const reading = samples.reading(hash);
    // The level the video's master gets (its AAC keeps the levelled file's loudness), not the
    // MP3 played here, which reads about half a LU lower. Within half a LU of the target, or
    // the peak ceiling named as what held it back.
    expect(reading?.target).toBe(-14);
    expect(reading?.ceiling).toBe(-2.5);
    expect(reading?.after).toBeGreaterThan(-15);
    expect(reading?.after).toBeLessThan(-13.5);
    expect(typeof reading?.before).toBe("number");
    const free = createFreeSamples({
      loudness: samples,
      loudnessDefault: () => defaultLoudness,
    });
    const view = free.view("t1", base, idle).loudness;
    expect(view).toMatchObject({
      state: "current",
      beforeUrl: "/api/template-studio/t1/loudness/before.mp3",
    });
    expect(view.afterLufs).toBe(reading?.after);
    expect(view.targetLufs).toBe(-14);
    expect(view.ceiling).toBe(-2.5);
  },
  90_000,
);
