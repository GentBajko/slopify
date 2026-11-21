import { expect, it, vi } from "vitest";
import type { RunConfig } from "../src/slices/admission/model.js";
import { changeCheckpoints } from "../src/slices/checkpoints/change.js";
import { projectHolds } from "../src/slices/reviews/holds.js";
import { current } from "./revision-rebuild.fake.js";
import { quiet, reviewedRun } from "./revision-reviews-stages.fake.js";

// A picture whose check fails is drawn again by the automatic redo: a new project version with
// the picture's new draw, its check and the video after it admitted at once. Nothing else may
// leave that new draw held for Try again: not the other steps of the run finishing while the
// redo is admitted, not a second failed check redoing its own picture at the same moment, and
// not the schedule's own Before Video hold of a video made ahead.

vi.mock("../src/adapters/alignment/index.js", () => {
  const mocked = {
    alignSubtitles: async (request: { readonly text: string }) =>
      request.text
        .split(/\s+/)
        .filter((word) => word !== "")
        .map((text, index) => ({ text, start: index + 0.5, end: index + 1.4 })),
  };
  return { ...mocked, alignSubtitlesWith: () => mocked.alignSubtitles };
});

const opened = () => {
  let open = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
};
const video = (base: RunConfig): RunConfig => ({
  ...base,
  sources: { ...base.sources, audio: "generate", video: "generate" },
  audio: { provider: "openai-tts", model: "tts", voice: "first" },
  chunking: { mode: "whole" },
  provided: { article: "Rope holds fast." },
  motionStyle: "still",
});
// Each picture's check fails the first time it is asked about one of `failing`.
const firstFails = (failing: readonly string[]) => {
  const seen = new Map<string, number>();
  return (one: { readonly text: string }) => {
    const name = failing.find((label) => one.text.includes(`"""\n${label}\n"""`));
    if (name === undefined) return undefined;
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count === 1 ? ["A hand has six fingers."] : undefined;
  };
};

type Run = Awaited<ReturnType<typeof reviewedRun>>;
// The pictures' steps of the current version that nothing has made: held for Try again.
const heldPictures = ({ deps, h }: Pick<Run, "deps" | "h">) =>
  deps.db
    .prepare(
      "SELECT DISTINCT p.work_key FROM revision_work w JOIN revision_work_pieces p ON p.work_id=w.id " +
        "WHERE w.project_id=? AND w.revision_id=? AND w.kind='images' AND w.state!='done' " +
        "AND NOT EXISTS (SELECT 1 FROM revision_work d JOIN revision_work_pieces q ON q.work_id=d.id " +
        "WHERE d.revision_id=w.revision_id AND d.state='done' AND q.work_key=p.work_key) ORDER BY p.work_key",
    )
    .all(h.projectId, current(deps, h.projectId).revision.id)
    .map((row) => row.work_key);

for (const ahead of [true, false])
  it(`draws a failed picture again on its own while the run's other steps finish${ahead ? " (made ahead, held for its day)" : ""}`, {
    timeout: 30_000,
  }, async () => {
    const two = opened();
    const run = await reviewedRun({
      fail: firstFails(["One"]),
      // Picture "two"'s check is still being answered when "one"'s redo begins.
      gateReviews: (text) => (text.includes('"""\nTwo\n"""') ? two.promise : undefined),
      speech: quiet(2),
      config: video,
      reviews: { retries: 1, stages: { images: { mode: "redo" } } },
      unbound: true,
      unsettled: true,
      // What a schedule's preparation leaves (`schedules/prepare.ts`): its own Before Video hold.
      beforeStart: (deps, projectId) => {
        if (!ahead) return;
        const catalogue = deps.catalogue.read();
        // The text models' service limits, which the test catalogue leaves out for the reviewer.
        const read = () => ({
          ...catalogue,
          providers: { ...catalogue.providers, codex: { maxConcurrent: 4 } },
        });
        expect(
          changeCheckpoints(
            { ...deps, catalogue: { read } },
            {
              projectId,
              revisionId: current(deps, projectId).revision.id,
              stages: ["video"],
            },
          ),
        ).toMatchObject({ ok: true });
        deps.db
          .prepare(
            "INSERT INTO prepared_videos(project_id,schedule_id,title,added_checkpoint,prepared_at) VALUES (?,'s1','Rope',1,?)",
          )
          .run(projectId, new Date().toISOString());
      },
    });
    const { h, deps, redos, verdicts, images, settle } = run;
    try {
      await vi.waitFor(
        () =>
          expect(verdicts().map((row) => [row.itemKey, row.redoState])).toEqual([
            ["image:one", "pending"],
          ]),
        { timeout: 10_000, interval: 20 },
      );
      // The redo saves its version, then checks the services it needs; the other steps of the
      // run (picture "two"'s check, the narration) finish while it does.
      const readiness = opened();
      let checking = 0;
      redos.bind({
        ...deps,
        providers: async () => {
          checking += 1;
          await readiness.promise;
          return deps.providers();
        },
      });
      redos.kick(h.projectId);
      await vi.waitFor(() => expect(checking).toBeGreaterThan(0), {
        timeout: 10_000,
        interval: 10,
      });
      two.open();
      await vi.waitFor(() => expect(verdicts().map((row) => row.itemKey)).toContain("image:two"), {
        timeout: 10_000,
        interval: 10,
      });
      readiness.open();
      await settle();

      expect(
        verdicts().map((row) => [row.itemKey, row.attempt, row.outcome, row.redoState]),
      ).toEqual([
        ["image:one", 1, "redo", "started"],
        ["image:two", 1, "passed", null],
        ["image:one", 2, "passed", null],
      ]);
      expect(images.calls()).toBe(3);
      expect(heldPictures(run)).toEqual([]);
      const holds = projectHolds(deps.db, { projectId: h.projectId }).holding.get(h.projectId);
      // Made ahead, the video still waits for its day; otherwise it is made.
      if (ahead) expect(holds?.map((row) => [row.stage, row.waitsFor])).toEqual([["video", "day"]]);
      else
        expect(
          current(deps, h.projectId).outputs.some(
            (row) => row.workKey === "export:video" && row.selected && row.state === "ready",
          ),
        ).toBe(true);
    } finally {
      h.close();
    }
  });

it("draws two failed pictures again on their own when their checks fail together", {
  timeout: 30_000,
}, async () => {
  const run = await reviewedRun({
    fail: firstFails(["One", "Two"]),
    speech: quiet(2),
    config: video,
    reviews: { retries: 1, stages: { images: { mode: "redo" } } },
  });
  const { h, verdicts, images } = run;
  try {
    expect(
      verdicts()
        .map((row) => [row.itemKey, row.attempt, row.outcome, row.redoState])
        .toSorted((a, b) => String(a).localeCompare(String(b))),
    ).toEqual([
      ["image:one", 1, "redo", "started"],
      ["image:one", 2, "passed", null],
      ["image:two", 1, "redo", "started"],
      ["image:two", 2, "passed", null],
    ]);
    expect(images.calls()).toBe(4);
    expect(heldPictures(run)).toEqual([]);
  } finally {
    h.close();
  }
});
