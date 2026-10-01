import type { ProjectListing } from "@app/slices/admission/model.js";
import { expect, it } from "vitest";
import { isWaiting } from "./needs-you.js";

it("leaves a waiting run the person kept as is off Needs you", () => {
  const waiting = { status: "pending", progress: 0.9 } as ProjectListing;
  expect(isWaiting(waiting)).toBe(true);
  expect(isWaiting({ ...waiting, setAside: true })).toBe(false);
});
