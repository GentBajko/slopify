import { configOf } from "../admission/start.js";
import type { ResolvedPlayRun } from "../play-drafts/model.js";
import type { RevisionDeps, RevisionEdit, RevisionView } from "../revisions/model.js";

// The sample project's next revision for a template's newer setup: the config a fresh run of it
// would start with (`configOf`, so aliases and rules are copied as they are now) and the
// current content with each prompt's template body replaced, so a changed prompt is sent as
// written now. Saving it outdates exactly what the change touches; the rebuild makes only that.
export function sampleEdit(
  deps: Pick<RevisionDeps, "db" | "paths" | "clock">,
  base: RevisionView,
  run: ResolvedPlayRun,
): RevisionEdit {
  const config = configOf(
    deps,
    run.draft,
    run.rendered,
    deps.clock.now(),
    run.templates,
    base.revision.projectId,
  );
  return {
    config,
    content: {
      ...base.revision.content,
      promptTemplates: Object.fromEntries(
        Object.keys(config.rendered).map((key) => [key, run.templates[key] ?? null]),
      ),
    },
  };
}
