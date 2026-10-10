import { expect, it } from "vitest";
import { layout } from "../../kernel/paths.js";
import { routeCallDeps } from "./mcp.fake.js";
import { externalReviewMaterial } from "./review-tools.js";

it("says a review that isn't there may belong to a deleted project, and where to look now", () => {
  const { db } = routeCallDeps(async () => new Response(null, { status: 404 }));
  const answer = externalReviewMaterial({ db, paths: layout("/nowhere") }, "p1", "missing");
  expect(answer.isError).toBe(true);
  expect(answer.content).toEqual([
    {
      type: "text",
      text: "This external review doesn't exist: the project may have been deleted. Call needs_attention to see what is waiting now.",
    },
  ]);
});
