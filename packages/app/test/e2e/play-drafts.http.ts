import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { expect } from "vitest";
import { z } from "zod";
import { openDb } from "../../src/kernel/db/index.js";
import type { Boot } from "../../src/main.js";
import type { DraftView, PlayDraftDocument } from "../../src/slices/play-drafts/model.js";
import {
  draftAttachmentSchema,
  draftViewSchema,
  playReviewSchema,
} from "../../src/slices/play-drafts/schema.js";
import { stagedFiles } from "../../src/slices/storage/repo.js";
import { outputSchema } from "../../src/slices/storage/schema.js";
import { resolveFfmpeg } from "../../src/slices/video/ffmpeg.js";

export async function draftRequest<T>(
  app: Boot,
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
  expectedStatus = 200,
): Promise<T> {
  const response = await fetch(`${app.url}${path}`, init);
  const body: unknown = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(expectedStatus);
  return schema.parse(body);
}
export function draftJson(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
export async function bytes(app: Boot, path: string): Promise<Buffer> {
  const response = await fetch(`${app.url}${path}`);
  expect(response.status).toBe(200);
  return Buffer.from(await response.arrayBuffer());
}
export function filePath(id: string, attachmentId: string): string {
  return `/api/drafts/${id}/attachments/${attachmentId}/file`;
}
export function inspect<T>(app: Boot, read: (db: ReturnType<typeof openDb>) => T): T {
  const db = openDb(app.paths.db);
  try {
    return read(db);
  } finally {
    db.close();
  }
}
export function counts(app: Boot): {
  projects: number;
  batches: number;
  receipts: number;
  attempts: number;
} {
  return inspect(app, (db) => ({
    projects: Number(db.prepare("SELECT count(*) n FROM projects").get()?.n),
    batches: Number(db.prepare("SELECT count(*) n FROM batches").get()?.n),
    receipts: Number(db.prepare("SELECT count(*) n FROM play_start_receipts").get()?.n),
    attempts: Number(db.prepare("SELECT count(*) n FROM attempts").get()?.n),
  }));
}
export function suppliedDocument(variants = false): PlayDraftDocument {
  return {
    schemaVersion: 1,
    section: "style",
    expectedWords: " 01500 ",
    previewText: "A saved preview.",
    fontUpload: null,
    variants: variants
      ? [{ id: randomUUID(), title: "Second run", values: { inactive: "second keyword" } }]
      : [],
    form: {
      title: "Supplied run",
      format: "16:9",
      sources: {
        research: "off",
        article: "provide",
        audio: "provide",
        images: "provide",
        thumbnail: "off",
        video: "off",
      },
      llm: { provider: "", model: "" },
      audio: { provider: "", model: "", voice: "" },
      images: { provider: "", model: "" },
      articlePrompt: "",
      imagePrompts: [{ name: "Inactive prompt", number: " 002 " }],
      thumbnailPrompt: "",
      intro: "",
      outro: "",
      chunking: { mode: "whole", words: " 0500 ", characters: "3e3" },
      imageSeconds: "15",
      zoomPercent: "22.5",
      motionStyle: "zoom",
      edgeSilenceSeconds: "0",
      subtitles: {
        mode: "off",
        language: "en",
        fontId: "default",
        fontSize: "048",
        position: "bottom",
      },
      values: { inactive: "  retained keyword  " },
      provided: {
        research: "Inactive research",
        article: "An entirely supplied article.",
        audio: { attachmentId: randomUUID(), name: "voice.wav" },
        thumbnail: null,
        images: [
          { attachmentId: randomUUID(), name: "second.png" },
          { attachmentId: randomUUID(), name: "first.png" },
        ],
      },
    },
  };
}
export function media(dataDir: string): { audio: Buffer; images: readonly Buffer[] } {
  const audio = Buffer.alloc(44 + 9600 * 4);
  audio.write("RIFF");
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.write("WAVEfmt ", 8);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(2, 22);
  audio.writeUInt32LE(48000, 24);
  audio.writeUInt32LE(192000, 28);
  audio.writeUInt16LE(4, 32);
  audio.writeUInt16LE(16, 34);
  audio.write("data", 36);
  audio.writeUInt32LE(audio.length - 44, 40);
  for (let i = 0; i < 9600; i++) {
    const sample = Math.round(Math.sin((i * 440 * Math.PI * 2) / 48000) * 8000);
    audio.writeInt16LE(sample, 44 + i * 4);
    audio.writeInt16LE(sample, 46 + i * 4);
  }
  const images = ["blue", "red"].map((color) => {
    const path = join(dataDir, `${color}.png`);
    execFileSync(
      resolveFfmpeg(process.env, ffmpegStatic),
      [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=${color}:s=32x18:d=1`,
        "-frames:v",
        "1",
        path,
      ],
      { windowsHide: true, stdio: "pipe" },
    );
    return readFileSync(path);
  });
  return { audio, images };
}
export async function createSupplied(
  app: Boot,
  document: PlayDraftDocument,
  fixture: ReturnType<typeof media>,
): Promise<DraftView> {
  const id = randomUUID();
  await draftRequest(app, "/api/drafts", draftViewSchema, draftJson({ id, document }), 201);
  const files = [document.form.provided.audio, ...document.form.provided.images];
  const contents = [fixture.audio, ...fixture.images];
  for (const [index, file] of files.entries()) {
    const content = contents[index];
    if (!file || !content) throw new Error("Missing fixture upload");
    const form = new FormData();
    form.set("file", new File([new Uint8Array(content)], file.name));
    const attachment = await draftRequest(
      app,
      filePath(id, file.attachmentId),
      draftAttachmentSchema,
      { method: "PUT", body: form },
    );
    expect(attachment).toMatchObject({
      id: file.attachmentId,
      state: "ready",
      bytes: content.length,
    });
  }
  return draftRequest(app, `/api/drafts/${id}`, draftViewSchema);
}
export async function reviewInput(
  app: Boot,
  view: DraftView,
): Promise<{ baseVersion: number; reviewId: string }> {
  const review = await draftRequest(
    app,
    `/api/drafts/${view.draft.id}/review`,
    playReviewSchema,
    draftJson({ baseVersion: view.draft.version }),
  );
  return { baseVersion: view.draft.version, reviewId: review.id };
}
export function stagedBytes(app: Boot): readonly Buffer[] {
  return inspect(app, (db) =>
    stagedFiles(db).map((file) => readFileSync(join(app.paths.staging, file.path))),
  );
}
export async function originalOutputs(
  app: Boot,
  id: string,
  fixture: ReturnType<typeof media>,
): Promise<void> {
  const body = await draftRequest(
    app,
    `/api/projects/${id}`,
    z.object({ outputs: z.array(outputSchema) }),
  );
  const audio = body.outputs.find((file) => file.role === "audio_body");
  expect(audio).toBeDefined();
  expect(await bytes(app, `/files/${id}/audio-body`)).toEqual(fixture.audio);
  expect(await bytes(app, `/files/${id}/article-txt`)).toEqual(
    Buffer.from("An entirely supplied article.\n"),
  );
  const images = body.outputs
    .filter((file) => file.role === "image")
    .toSorted((a, b) => (a.meta.index ?? 0) - (b.meta.index ?? 0));
  expect(images).toHaveLength(2);
  for (const [index, image] of images.entries()) {
    expect(readFileSync(join(app.paths.projects, id, image.path))).toEqual(fixture.images[index]);
    expect(await bytes(app, `/files/${id}/image-${index + 1}`)).toEqual(fixture.images[index]);
  }
}
