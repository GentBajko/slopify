import type { RunConfig } from "../admission/model.js";
import type { RevisionEdit } from "./model.js";

// A renamed project keeps what it is about (`subjectOf`): on the first rename the title it was
// made with is kept as `subjectTitle`, so the scenes, looks, cast and shorts made from it keep
// their fingerprints and nothing is drawn again. What shows the title (YouTube's text, the
// PDF, the files' tags) follows the new name. An edit can't drop a kept subject either.
export function keptSubject(base: RunConfig, edit: RevisionEdit): RevisionEdit {
  const subject = base.subjectTitle ?? (edit.config.title !== base.title ? base.title : undefined);
  if (subject === undefined || edit.config.subjectTitle === subject) return edit;
  return { ...edit, config: { ...edit.config, subjectTitle: subject } };
}
