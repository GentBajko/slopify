import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { type Boot, boot } from "../../src/main.js";
import type { ProjectSummary, RunDraft } from "../../src/slices/admission/model.js";
import type { RevisionEdit, RevisionView } from "../../src/slices/revisions/model.js";
import {
  revisionMutationSuccessSchema,
  revisionViewSchema,
} from "../../src/slices/revisions/schema.js";
import { resolveFfmpeg } from "../../src/slices/video/ffmpeg.js";
import {
  admissionSuccessSchema,
  post,
  previewSuccessSchema,
  projectBodySchema,
  request,
} from "./editable-projects.http.js";

const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);
const running: Boot[] = [];
afterEach(async () => {
  for (const app of running.splice(0)) await app.stop();
});

const article = `# Rope Tricks

Rope tricks have been part of stage magic for as long as there has been a stage, and the **Indian rope trick** is the most famous of them all, as [the history](https://example.com/history) tells it.

## The Cut and Restored Rope

The oldest routine still performed cuts a rope in two and makes it whole again in full view.

## Sources Consulted

- [Hiding the Elephant](https://example.com/elephant)
`;

async function start(): Promise<Boot> {
  const app = await boot({
    port: 0,
    host: "127.0.0.1",
    dataDir: mkdtempSync(join(tmpdir(), "slopify-document-")),
    open: false,
  });
  running.push(app);
  return app;
}

function draft(over: Partial<RunDraft> = {}): RunDraft {
  return {
    title: "Rope Tricks",
    format: "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "off",
      images: "off",
      thumbnail: "off",
      video: "off",
      document: "generate",
    },
    document: { theme: "plain" },
    imagePrompts: [],
    values: {},
    provided: { article },
    silenceGapSeconds: 3,
    imageSeconds: 15,
    zoomPercent: 22.5,
    motionStyle: "zoom",
    edgeSilenceSeconds: 0,
    ...over,
  };
}

async function create(app: Boot, body: RunDraft): Promise<string> {
  const response = await fetch(`${app.url}/api/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { project: ProjectSummary }).project.id;
}

async function settled(app: Boot, id: string, done: (outputId: string) => boolean = () => true) {
  let body: z.infer<typeof projectBodySchema> | undefined;
  await expect
    .poll(
      async () => {
        body = await request(app, `/api/projects/${id}`, projectBodySchema);
        if (body.project.status === "failed") throw new Error(JSON.stringify(body.stages));
        const pdf = body.outputs.find((output) => output.role === "document_pdf");
        return body.project.status === "done" && pdf !== undefined && done(pdf.id);
      },
      { timeout: 30000, interval: 50 },
    )
    .toBe(true);
  if (body === undefined) throw new Error("No project response");
  return body;
}

async function view(app: Boot, id: string, revisionId: string): Promise<RevisionView> {
  return (
    await request(
      app,
      `/api/projects/${id}/revisions/${revisionId}`,
      z.object({ view: revisionViewSchema }),
    )
  ).view;
}

function pdfOf(value: RevisionView): RevisionView["outputs"][number] {
  const row = value.outputs.find((one) => one.selected && one.output.role === "document_pdf");
  if (row === undefined) throw new Error("The revision has no document.");
  return row;
}

function thumbnail(): string {
  const path = join(mkdtempSync(join(tmpdir(), "slopify-document-cover-")), "cover.png");
  execFileSync(
    ffmpeg,
    ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=64x36:d=1", "-frames:v", "1", path],
    { windowsHide: true, stdio: "pipe" },
  );
  return path;
}

async function save(app: Boot, id: string, base: RevisionView, edit: RevisionEdit) {
  return post(app, `/api/projects/${id}/revisions`, revisionMutationSuccessSchema, {
    baseRevisionId: base.revision.id,
    idempotencyKey: randomUUID(),
    edit,
  });
}

describe("the Document stage through the real app", () => {
  it("makes a downloadable PDF with the thumbnail as its cover, without a provider", async () => {
    const app = await start();
    const data = new FormData();
    data.set("file", new File([new Uint8Array(readFileSync(thumbnail()))], "cover.png"));
    const staged = await fetch(`${app.url}/api/staging/thumbnail`, { method: "POST", body: data });
    expect(staged.status).toBe(201);
    const cover = ((await staged.json()) as { id: string }).id;
    const id = await create(
      app,
      draft({
        sources: { ...draft().sources, thumbnail: "provide" },
        provided: { article, thumbnail: cover },
      }),
    );

    const body = await settled(app, id);
    expect(body.stages.find((stage) => stage.kind === "document")?.state).toBe("done");
    const download = await fetch(`${app.url}/files/${id}/document-pdf`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/pdf");
    expect(download.headers.get("content-disposition")).toBe(
      'attachment; filename="rope-tricks-document-pdf.pdf"',
    );
    const bytes = Buffer.from(await download.arrayBuffer()).toString("latin1");
    expect(bytes.startsWith("%PDF-")).toBe(true);
    expect(bytes).toContain("/URI (https://example.com/history)");
    expect(bytes).toContain("/URI (https://example.com/elephant)");
    expect(bytes).toMatch(/\/Subtype \/Image/);

    // The project page opens the same record in a browser tab.
    const record = pdfOf(await view(app, id, body.revisionId ?? ""));
    const inline = await fetch(
      `${app.url}/files/${id}/revisions/${body.revisionId}/${record.recordId}?inline=1`,
    );
    expect(inline.status).toBe(200);
    expect(inline.headers.get("content-disposition")).toMatch(/^inline; /);
  }, 60_000);

  it("goes stale on an article edit and on a theme change, and rebuilds only itself", async () => {
    const app = await start();
    const id = await create(app, draft());
    const first = await settled(app, id);
    const base = await view(app, id, first.revisionId ?? "");
    const original = pdfOf(base);

    const themed = await save(app, id, base, {
      config: { ...base.revision.config, document: { theme: "dicemaster" } },
      content: base.revision.content,
    });
    expect(pdfOf(themed.view).state).toBe("outdated");
    const { value: themePreview } = await post(
      app,
      `/api/projects/${id}/rebuild/preview`,
      previewSuccessSchema,
      { baseRevisionId: themed.view.revision.id, request: { kind: "allAffected" } },
    );
    expect(
      themePreview.work.filter((row) => row.disposition !== "reuse").map((row) => row.key),
    ).toEqual(["document:pdf"]);

    const edited = await save(app, id, themed.view, {
      config: themed.view.revision.config,
      content: {
        ...themed.view.revision.content,
        articleMarkdown: article.replace("oldest routine", "oldest trick"),
      },
    });
    expect(pdfOf(edited.view).state).toBe("outdated");
    const { value: preview } = await post(
      app,
      `/api/projects/${id}/rebuild/preview`,
      previewSuccessSchema,
      { baseRevisionId: edited.view.revision.id, request: { kind: "allAffected" } },
    );
    expect(preview.work.filter((row) => row.kind === "provider")).toEqual([]);
    expect(preview.work.find((row) => row.key === "document:pdf")?.disposition).toBe("local");
    await post(
      app,
      `/api/projects/${id}/rebuild`,
      admissionSuccessSchema,
      {
        baseRevisionId: edited.view.revision.id,
        idempotencyKey: randomUUID(),
        previewId: preview.id,
        acknowledgeUnknownCosts: true,
        confirmedProvidedWorkKeys: preview.providedReuseRequired,
      },
      202,
    );
    const rebuilt = await settled(app, id, (outputId) => outputId !== original.output.id);
    const replacement = pdfOf(await view(app, id, rebuilt.revisionId ?? ""));
    expect(replacement).toMatchObject({ state: "ready", available: true });
    expect(replacement.assetId).not.toBe(original.assetId);
  }, 60_000);
});
