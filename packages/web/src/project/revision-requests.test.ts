import { expect, it } from "vitest";
import { requestFor } from "./revision-requests.js";

it("retries identical content with its original key", () => {
  let n = 0;
  const newId = () => `id${++n}`;
  const first = requestFor(undefined, { baseRevisionId: "r1", title: "A" }, newId);
  expect(requestFor(first, { baseRevisionId: "r1", title: "A" }, newId)).toBe(first);
  expect(requestFor(first, { baseRevisionId: "r1", title: "B" }, newId).idempotencyKey).toBe("id2");
});
