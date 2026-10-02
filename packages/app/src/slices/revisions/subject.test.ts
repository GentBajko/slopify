import { expect, it } from "vitest";
import { config } from "../rebuild/recipe-fixture.js";
import type { RevisionEdit } from "./model.js";
import { keptSubject } from "./subject.js";

const edit = (title: string, subjectTitle?: string): RevisionEdit =>
  ({
    config: { ...config, title, ...(subjectTitle === undefined ? {} : { subjectTitle }) },
    content: {},
  }) as unknown as RevisionEdit;

it("keeps the title a project was made with as its subject on the first rename, and after", () => {
  expect(keptSubject(config, edit(config.title)).config.subjectTitle).toBeUndefined();
  expect(keptSubject(config, edit("Renamed")).config.subjectTitle).toBe(config.title);
  const renamed = { ...config, title: "Renamed", subjectTitle: config.title };
  // A second rename, or an edit that dropped it, keeps the first subject.
  expect(keptSubject(renamed, edit("Again")).config.subjectTitle).toBe(config.title);
});
