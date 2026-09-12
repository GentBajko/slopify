import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import { claimWork, finishWork, maySubmit } from "../../kernel/runner/work-authority.js";
import { saveRevision } from "../revisions/mutations.js";
import { insertVoice } from "../settings/repo.js";
import { materializeAdmittedWork } from "./runtime-materialize.js";
import { narrationCatalogue } from "./runtime-narration.fake.js";
import { runRevisionInvocation } from "./runtime-run.js";
import { executionStages } from "./runtime-store.js";
import { paidServiceFixture } from "./service.fake.js";
import { previewRebuild, startRebuild } from "./service.js";
import { workPieces } from "./work-records.js";

it.each([false, true])(
  "materializes only authorized narration after article completion (changed prompt: %s)",
  async (changed) => {
    const h = await paidServiceFixture();
    try {
      h.setCatalogue({
        ...narrationCatalogue,
        providers: { ...narrationCatalogue.providers, ...h.catalogue.providers },
        image: h.catalogue.image,
      });
      insertVoice(h.deps.db, {
        id: "voice",
        provider: "openai-tts",
        name: "Voice",
        voiceId: "voice",
      });
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: h.base.revision.id,
        idempotencyKey: "generated",
        edit: {
          config: {
            ...h.base.revision.config,
            sources: { ...h.base.revision.config.sources, article: "generate", audio: "generate" },
            llm: { provider: "openrouter", model: "llm" },
            audio: { provider: "openai-tts", model: "tts", voice: "voice" },
            provided: {},
            rendered: { article: "Write history." },
          },
          content: { ...h.base.revision.content, articleMarkdown: undefined, articleEdited: false },
        },
      });
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      const p = await previewRebuild(h.deps, {
        projectId: h.projectId,
        baseRevisionId: saved.view.revision.id,
        request: { kind: "allAffected" },
      });
      if (!p.ok) throw new Error(JSON.stringify(p));
      expect(p.value.costs.unknown).toBeGreaterThan(0);
      const admitted = await startRebuild(h.deps, {
        projectId: h.projectId,
        baseRevisionId: saved.view.revision.id,
        previewId: p.value.id,
        idempotencyKey: randomUUID(),
        acknowledgeUnknownCosts: true,
        confirmedProvidedWorkKeys: p.value.providedReuseRequired,
      });
      if (!admitted.ok) throw new Error(JSON.stringify(admitted));
      const stage = executionStages(h.deps, h.projectId).find((row) =>
        workPieces(h.deps.db, row.work.workId).some((piece) => piece.key === "article:body"),
      );
      if (stage === undefined) throw new Error("Missing article");
      expect(claimWork(h.deps.db, stage.work)).toBe(true);
      const context: StageContext = {
        stage,
        work: stage.work,
        signal: new AbortController().signal,
        maySubmit: (id) => maySubmit(h.deps.db, stage.work, id),
        emit: () => undefined,
      };
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let entered: () => void = () => undefined;
      const accepted = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const tts: string[] = [];
      const providers: StageProviders = {
        llm: async () => {
          entered();
          await gate;
          return {
            ok: true,
            value: {
              text: "First sentence. Second sentence.",
              finishReason: "stop",
              usage: { inputTokens: 1, outputTokens: 1 },
            },
          };
        },
        tts: async (input) => {
          tts.push(input.text);
          return { ok: true, value: { bytes: Buffer.from("audio"), container: "mp3" } };
        },
        image: async () => {
          throw new Error("Not needed for this assertion");
        },
        forPiece: () => providers,
      };
      const running = runRevisionInvocation({ ...h.deps, ffmpeg: "unused" }, context, providers);
      await accepted;
      if (changed) {
        const edited = await saveRevision(h.deps, {
          projectId: h.projectId,
          baseRevisionId: saved.view.revision.id,
          idempotencyKey: "changed-before-completion",
          edit: {
            config: { ...saved.view.revision.config, rendered: { article: "Write geography." } },
            content: saved.view.revision.content,
          },
        });
        if (!edited.ok) throw new Error(JSON.stringify(edited));
      }
      release();
      expect(await running).toBe("done");
      finishWork(h.deps.db, stage.work, "done", null);
      materializeAdmittedWork(h.deps, h.projectId);
      const current = executionStages(h.deps, h.projectId);
      const images = current.filter((row) => row.kind === "images");
      expect(images).toHaveLength(2);
      for (const image of images)
        expect(
          maySubmit(h.deps.db, image.work, workPieces(h.deps.db, image.work.workId)[0]?.id),
        ).toBe(true);
      const parts = current.filter((row) =>
        workPieces(h.deps.db, row.work.workId).some(
          (piece) => piece.input.kind === "tts" && piece.dispatchState === "allowed",
        ),
      );
      if (changed) expect(parts).toHaveLength(0);
      else {
        expect(parts.length).toBeGreaterThan(0);
        const ordered = [...parts].sort((a, b) =>
          String(workPieces(h.deps.db, a.work.workId)[0]?.key).localeCompare(
            String(workPieces(h.deps.db, b.work.workId)[0]?.key),
            undefined,
            { numeric: true },
          ),
        );
        for (const part of ordered) {
          expect(
            h.deps.db
              .prepare("SELECT admission_id FROM revision_work WHERE id=?")
              .get(part.work.workId)?.admission_id,
          ).toBe(admitted.value.admissionId);
          expect(claimWork(h.deps.db, part.work)).toBe(true);
          expect(
            await runRevisionInvocation(
              { ...h.deps, ffmpeg: "unused" },
              {
                ...context,
                stage: part,
                work: part.work,
                maySubmit: (id) => maySubmit(h.deps.db, part.work, id),
              },
              providers,
            ),
          ).toBe("done");
          finishWork(h.deps.db, part.work, "done", null);
        }
        expect(tts.join("").replaceAll(" ", "")).toBe("Firstsentence.Secondsentence.");
      }
      expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(1);
    } finally {
      h.close();
    }
  },
);
