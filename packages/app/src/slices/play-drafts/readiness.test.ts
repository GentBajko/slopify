import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import type { ProviderStatus } from "../settings/model.js";
import { providerIds } from "../settings/model.js";
import { insertVoice, writeSetting } from "../settings/repo.js";
import { must, startFixture } from "./draft.fake.js";
import type { ResolvedPlayRun } from "./model.js";
import { checkDraftReadiness } from "./readiness.js";
import { reviewDraft } from "./review.js";
import { createDraft } from "./service.js";
import { startPlayDraft } from "./start.js";

it("supplied-only runs require no provider discovery", async () => {
  const h = startFixture();
  try {
    const id = randomUUID();
    must(createDraft(h.deps, { id, document: h.document }));
    const review = must(await reviewDraft(h.deps, { id, baseVersion: 1 }));
    const providers = vi.fn(async () => []);
    const modelsFor = vi.fn(async () => []);
    expect(await checkDraftReadiness({ ...h.deps, providers, modelsFor }, review.runs)).toEqual({
      fields: [],
      providers: [],
    });
    expect(providers).not.toHaveBeenCalled();
    expect(modelsFor).not.toHaveBeenCalled();
  } finally {
    h.close();
  }
});

it("refuses an installed CLI with an incompatible-version issue", async () => {
  const h = startFixture();
  try {
    const run = generated(h, "llm");
    const choice = run.draft.llm;
    if (!choice) throw new Error("Missing choice");
    const issue = "Codex CLI 0.149.1 or newer is required. Update Codex CLI and try again.";
    const result = await checkDraftReadiness(
      {
        ...h.deps,
        providers: async () => [
          {
            id: "codex",
            family: "llm",
            displayName: "Codex CLI",
            readiness: { kind: "cli", installed: true, version: "0.148.0", issue },
          },
        ],
      },
      [
        {
          ...run,
          draft: { ...run.draft, llm: { ...choice, provider: "codex" } },
        },
      ],
    );

    expect(result.fields).toContainEqual({ field: "llm", message: issue });
  } finally {
    h.close();
  }
});

function generated(
  h: ReturnType<typeof startFixture>,
  family: "llm" | "tts" | "image",
): ResolvedPlayRun {
  const model = h.deps.catalogue.read()[family][0];
  if (!model) throw new Error("Missing model");
  return {
    rendered: {},
    templates: {},
    draft: {
      title: "Generated",
      format: "16:9",
      sources: {
        research: "off",
        article: "provide",
        audio: "off",
        images: "off",
        thumbnail: "off",
        video: "off",
        [family === "llm" ? "article" : family === "tts" ? "audio" : "images"]: "generate",
      },
      [family === "llm" ? "llm" : family === "tts" ? "audio" : "images"]: {
        provider: model.provider,
        model: model.id,
        voice: "voice",
      },
      imagePrompts: [],
      values: {},
      provided: { article: "Text" },
      silenceGapSeconds: 0,
    },
  };
}
it.each(["provider", "family", "model", "key", "voice", "cli"] as const)(
  "reports %s readiness loss with linked form fields",
  async (failure) => {
    const h = startFixture();
    try {
      const family = failure === "voice" ? "tts" : "llm";
      let run = generated(h, family);
      if (failure === "cli")
        run = {
          ...run,
          draft: {
            ...run.draft,
            llm: {
              provider: "codex",
              model: h.deps.catalogue.models("codex", "llm")[0]?.id ?? "missing",
            },
          },
        };
      const choice = family === "tts" ? run.draft.audio : run.draft.llm;
      if (!choice) throw new Error("Missing choice");
      const provider: ProviderStatus = {
        id: z.enum(providerIds).parse(choice.provider),
        family: failure === "family" ? "image" : family,
        displayName: "Test",
        readiness:
          failure === "cli" ? { kind: "cli", installed: true } : { kind: "keyed", hasKey: true },
        ...(failure === "cli" ? { cliPath: { configured: null, command: "codex" } } : {}),
      };
      if (failure !== "cli")
        h.deps.db
          .prepare("INSERT INTO provider_keys VALUES (?,hex(randomblob(32)),?)")
          .run(choice.provider, "now");
      insertVoice(h.deps.db, {
        id: "v",
        provider: z.enum(providerIds).parse(choice.provider),
        name: "Voice",
        voiceId: "voice",
      });
      const modelsFor = vi.fn(async () => {
        if (failure === "key") h.deps.db.prepare("DELETE FROM provider_keys").run();
        if (failure === "voice") h.deps.db.prepare("DELETE FROM voices").run();
        if (failure === "cli")
          writeSetting(h.deps.db, "cli.path.codex", JSON.stringify("/different/codex"));
        return failure === "model" ? [] : [{ id: choice.model, name: "Model" }];
      });
      const result = await checkDraftReadiness(
        { ...h.deps, providers: async () => (failure === "provider" ? [] : [provider]), modelsFor },
        [run],
      );
      expect(result.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field:
              failure === "voice"
                ? "audio.voice"
                : failure === "cli"
                  ? "llm.cliPath"
                  : failure === "model"
                    ? "llm.model"
                    : "llm",
          }),
        ]),
      );
    } finally {
      h.close();
    }
  },
);
it("checks research, generated entries and thumbnail-only providers once per choice", async () => {
  const h = startFixture();
  try {
    const base = generated(h, "llm");
    const image = generated(h, "image").draft.images;
    const run: ResolvedPlayRun = {
      ...base,
      draft: {
        ...base.draft,
        images: image,
        sources: {
          ...base.draft.sources,
          article: "provide",
          research: "generate",
          thumbnail: "prompt_by_llm",
        },
        intro: { mode: "llm", name: "Opening" },
      },
    };
    const result = await checkDraftReadiness(h.deps, [run, run]);
    expect(result.fields.map((f) => f.field)).toEqual(expect.arrayContaining(["llm", "images"]));
  } finally {
    h.close();
  }
});
it.each(["font", "template"] as const)(
  "detects changed %s during model discovery",
  async (change) => {
    const h = startFixture();
    try {
      const tts = h.deps.catalogue.read().tts[0];
      if (!tts) throw new Error("Missing model");
      h.deps.db
        .prepare("INSERT INTO entries VALUES ('e','intro','text','Opening','Hello','[]','now')")
        .run();
      h.deps.db
        .prepare("INSERT INTO provider_keys VALUES (?,hex(randomblob(32)),?)")
        .run(tts.provider, "now");
      insertVoice(h.deps.db, {
        id: "voice",
        provider: z.enum(providerIds).parse(tts.provider),
        name: "Voice",
        voiceId: "voice",
      });
      const font = await h.deps.resolveFont("default");
      const path = join(h.deps.paths.dataDir, "font.ttf");
      fs.copyFileSync(font.path, path);
      const deps = { ...h.deps, resolveFont: async () => ({ ...font, path }) };
      const id = randomUUID();
      must(
        createDraft(deps, {
          id,
          document: {
            ...h.document,
            form: {
              ...h.document.form,
              intro: "Opening",
              sources: { ...h.document.form.sources, audio: "generate" },
              audio: { provider: tts.provider, model: tts.id, voice: "voice" },
              subtitles: { ...h.document.form.subtitles, mode: "files" },
            },
          },
        }),
      );
      const review = must(await reviewDraft(deps, { id, baseVersion: 1 }));
      const input = { draftId: id, baseVersion: 1, reviewId: review.id };
      const result = await startPlayDraft(
        {
          ...deps,
          providers: async () => [
            {
              id: z.enum(providerIds).parse(tts.provider),
              family: "tts",
              displayName: "TTS",
              readiness: { kind: "keyed", hasKey: true },
            },
          ],
          modelsFor: async () => {
            if (change === "font") fs.writeFileSync(path, "changed font");
            else h.deps.db.prepare("UPDATE entries SET body='Changed'").run();
            return [{ id: tts.id, name: tts.name }];
          },
        },
        input,
      );
      expect(result).toMatchObject({ ok: false, reason: "stale-review" });
      expect(h.deps.db.prepare("SELECT * FROM projects").all()).toHaveLength(0);
    } finally {
      h.close();
    }
  },
);
it("starts generated narration with the reviewed font and available saved voice", async () => {
  const h = startFixture();
  try {
    const tts = h.deps.catalogue.read().tts[0];
    if (!tts) throw new Error("Missing model");
    const provider = z.enum(providerIds).parse(tts.provider);
    h.deps.db
      .prepare("INSERT INTO provider_keys VALUES (?,hex(randomblob(32)),?)")
      .run(provider, "now");
    insertVoice(h.deps.db, { id: "v", provider, name: "Voice", voiceId: "voice" });
    const id = randomUUID();
    must(
      createDraft(h.deps, {
        id,
        document: {
          ...h.document,
          form: {
            ...h.document.form,
            sources: { ...h.document.form.sources, audio: "generate" },
            audio: { provider, model: tts.id, voice: "voice" },
            subtitles: { ...h.document.form.subtitles, mode: "files" },
          },
        },
      }),
    );
    const review = must(await reviewDraft(h.deps, { id, baseVersion: 1 }));
    const result = must(
      await startPlayDraft(
        {
          ...h.deps,
          providers: async () => [
            {
              id: provider,
              family: "tts",
              displayName: "TTS",
              readiness: { kind: "keyed", hasKey: true },
            },
          ],
          modelsFor: async () => [{ id: tts.id, name: tts.name }],
        },
        { draftId: id, baseVersion: 1, reviewId: review.id },
      ),
    );
    expect(result.projectIds).toHaveLength(1);
    expect(h.events).toEqual(result.projectIds);
    expect(h.ticks).toEqual(result.projectIds);
  } finally {
    h.close();
  }
});
