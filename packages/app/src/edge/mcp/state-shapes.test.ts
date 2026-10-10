import { expect, it } from "vitest";
import { listWithStateWords, projectWithStateWords } from "./state-shapes.js";

const stage = (state: string, progressCurrent: number | null = null) => ({
  kind: "article",
  state,
  progressCurrent,
  progressTotal: progressCurrent === null ? null : 4,
});

it("says a waiting project's state the same way on the list and on its page", () => {
  for (const [stages, word] of [
    // Only a supplied article: nothing has run yet, so it waits its turn.
    [[stage("provided"), stage("pending")], "Queued"],
    [[stage("done"), stage("pending")], "Waiting for your review"],
  ] as const) {
    const listed = listWithStateWords({
      projects: [{ status: "pending", progress: stages[0].state === "done" ? 0.5 : 0 }],
    }) as { projects: { stateWord: string }[] };
    const page = projectWithStateWords({ project: { status: "pending" }, stages }) as {
      project: { stateWord: string };
    };
    expect([listed.projects[0]?.stateWord, page.project.stateWord]).toEqual([word, word]);
  }
});
