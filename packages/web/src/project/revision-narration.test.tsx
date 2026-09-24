import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { renderApp, testDeps } from "@/test-app";
import { revisionView } from "./revision-fixture";
import { formOfRevision, setPrompt } from "./revision-form-state";
import { RevisionNarration } from "./revision-narration";

afterEach(cleanup);
it("retains the edited frozen prompt through Off and back without loading changed library wording", async () => {
  const user = userEvent.setup();
  const base = revisionView();
  const view = {
    ...base,
    revision: {
      ...base.revision,
      config: {
        ...base.revision.config,
        narrationPrompt: "Saved delivery",
        sources: { ...base.revision.config.sources, audio: "generate" as const },
        audio: { provider: "inworld", model: "inworld-tts-2", voice: "voice" },
      },
      content: { ...base.revision.content, promptTemplates: { narration: "Original frozen body" } },
    },
  };
  let latest = setPrompt(formOfRevision(view), "narration", "Edited frozen body");
  function Subject() {
    const [edit, setEdit] = useState(latest);
    return (
      <RevisionNarration
        edit={edit}
        view={view}
        prompts={[]}
        onChange={(next) => {
          latest = next;
          setEdit(next);
        }}
      />
    );
  }
  renderApp(<Subject />, testDeps({}));
  await user.selectOptions(screen.getByLabelText("Narration Preparation"), "");
  expect(latest.content.promptTemplates.narration).toBe("Edited frozen body");
  await user.selectOptions(screen.getByLabelText("Narration Preparation"), "Saved delivery");
  expect(latest.config.rendered.narration).toBe("Edited frozen body");
  expect(latest.config.narrationPrompt).toBe("Saved delivery");
});
