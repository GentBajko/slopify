import type { ProjectListing } from "@app/slices/admission/model.js";
import { waitsForPerson } from "@app/slices/admission/state-words.js";
import { expect, it } from "vitest";
import { matches, sortProjects } from "@/routes/projects-order";

const waiting = { status: "pending", progress: 0.9, createdAt: "2026-09-10" } as ProjectListing;

it("leaves a waiting run the person kept as is off Needs you", () => {
  expect(waitsForPerson(waiting)).toBe(true);
  expect(waitsForPerson({ ...waiting, setAside: true })).toBe(false);
});

it("leaves a schedule's prepared project off Needs you and the waiting filter and sort", () => {
  const prepared = { ...waiting, id: "prepared", prepared: true } as ProjectListing;
  expect(waitsForPerson(prepared)).toBe(false);
  expect(matches(prepared, "waiting")).toBe(false);
  const running = {
    ...waiting,
    id: "running",
    status: "running",
    createdAt: "2026-09-01",
  } as ProjectListing;
  expect(sortProjects([prepared, running], "status").map((one) => one.id)).toEqual([
    "running",
    "prepared",
  ]);
});
