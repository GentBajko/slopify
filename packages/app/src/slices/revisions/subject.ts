import type { RunConfig } from "../admission/model.js";
import type { RevisionEdit } from "./model.js";

// A renamed project keeps what it is about (`subjectOf`): on the first rename the title it was
// made with is kept as `subjectTitle`, and every step's fingerprint reads it, so a rename runs
// nothing. An edit can't drop a kept subject either.
export function keptSubject(base: RunConfig, edit: RevisionEdit): RevisionEdit {
  const subject = base.subjectTitle ?? (edit.config.title !== base.title ? base.title : undefined);
  if (subject === undefined || edit.config.subjectTitle === subject) return edit;
  return { ...edit, config: { ...edit.config, subjectTitle: subject } };
}
