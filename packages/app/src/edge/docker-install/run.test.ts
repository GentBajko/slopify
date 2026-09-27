import { expect, it } from "vitest";
import { documentsProjects } from "./run.js";

it("puts --projects-dir documents in <Documents>/Slopify, one folder per extra install", () => {
  expect(documentsProjects("/home/you/Documents", "slopify")).toBe(
    "/home/you/Documents/Slopify/Projects",
  );
  expect(documentsProjects("/home/you/Documents", "work")).toBe(
    "/home/you/Documents/Slopify/work/Projects",
  );
});
