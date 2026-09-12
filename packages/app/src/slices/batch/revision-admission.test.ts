import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { CatalogueStore } from "../../catalog/store.js";
import { exportCatalogue } from "../rebuild/runtime-export.fake.js";
import { currentRevisionId } from "../revisions/repo.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { getRevisionView } from "../revisions/view.js";
import { outputPath, stagingPath } from "../storage/layout.js";
import { stagedFiles } from "../storage/repo.js";
import { stageUpload } from "../storage/staging.js";
import { enqueueBatch, queueEntries } from "./index.js";

for (const fails of [false, true])
  it(
    fails
      ? "rolls back every batch revision and grant when a later upload fails"
      : "adopts all batch snapshots before consuming a shared upload",
    async () => {
      const h = revisionFixture();
      try {
        const catalogue: CatalogueStore = {
          read: () => exportCatalogue,
          models: () => [],
          refresh: async () => undefined,
          status: () => ({
            updatedAt: "2026-09-12",
            path: "unused",
            warning: null,
            source: "test",
          }),
        };
        const deps = { ...h.deps, catalogue, emit: () => undefined };
        const upload = await stageUpload(deps, {
          stageKind: "audio",
          originalFilename: "audio.mp3",
          content: (async function* () {
            yield Buffer.from("audio");
          })(),
        });
        if (!upload.ok) throw new Error("Upload failed");
        const path = stagingPath(deps.paths, upload.file.path);
        const runs = ["First", "Second"].map((title, index) => ({
          draft: {
            ...h.config,
            title,
            sources: { ...h.config.sources, audio: "provide" as const },
            provided: {
              ...h.config.provided,
              audio: fails && index === 1 ? "missing" : upload.file.id,
            },
          },
          rendered: {},
        }));
        if (fails) {
          expect(() => enqueueBatch(deps, "batch", runs)).toThrow();
          expect(deps.db.prepare("SELECT count(*) AS n FROM projects").get()?.n).toBe(1);
          expect(deps.db.prepare("SELECT count(*) AS n FROM project_revisions").get()?.n).toBe(0);
          expect(deps.db.prepare("SELECT count(*) AS n FROM revision_work").get()?.n).toBe(0);
          expect(queueEntries(deps.db)).toHaveLength(0);
          expect(stagedFiles(deps.db)).toHaveLength(1);
          expect(readFileSync(path, "utf8")).toBe("audio");
          return;
        }
        const queued = enqueueBatch(deps, "batch", runs);
        expect(queued).toHaveLength(2);
        for (const item of queued) {
          const revisionId = currentRevisionId(deps.db, item.projectId);
          if (revisionId === undefined) throw new Error("Batch project has no revision");
          const view = getRevisionView(deps, item.projectId, revisionId);
          const audio = view?.outputs.find(
            (row) => row.selected && row.output.role === "audio_body",
          );
          if (audio === undefined) throw new Error("Missing provided audio");
          expect(
            readFileSync(outputPath(deps.paths, item.projectId, audio.output.path), "utf8"),
          ).toBe("audio");
          expect(
            deps.db
              .prepare(
                "SELECT count(*) AS n FROM revision_work WHERE project_id=? AND revision_id=?",
              )
              .get(item.projectId, revisionId)?.n,
          ).toBeGreaterThan(0);
        }
        const count = deps.db.prepare("SELECT count(*) AS n FROM revision_work").get()?.n;
        expect(enqueueBatch(deps, "batch", runs)).toEqual(queued);
        expect(deps.db.prepare("SELECT count(*) AS n FROM revision_work").get()?.n).toBe(count);
        expect(stagedFiles(deps.db)).toHaveLength(0);
        expect(existsSync(path)).toBe(false);
      } finally {
        h.close();
      }
    },
  );
