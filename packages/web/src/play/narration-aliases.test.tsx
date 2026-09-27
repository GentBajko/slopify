import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, useState } from "react";
import { afterEach, expect, it } from "vitest";
import { revisionView } from "@/project/revision-fixture";
import { formOfRevision } from "@/project/revision-form-state";
import { RevisionProviders } from "@/project/revision-providers";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { freshForm } from "./state";

afterEach(cleanup);

const doctor = { written: "Dr.", spoken: "Doctor", wholeWord: true, caseSensitive: false };

it("is on for a fresh Play draft", () => {
  expect(freshForm.audio.useNarrationAliases).toBe(true);
});

function ProjectSubject({ use }: { readonly use: boolean | undefined }): ReactElement {
  const initial = formOfRevision(revisionView());
  const [edit, setEdit] = useState<RevisionEdit>({
    ...initial,
    config: {
      ...initial.config,
      sources: { ...initial.config.sources, audio: "generate" as const },
      audio: {
        provider: "voice",
        model: "tts",
        voice: "v",
        ...(use === undefined ? {} : { useNarrationAliases: use }),
      },
    },
  });
  return (
    <>
      <RevisionProviders projectId="p1" edit={edit} providers={[]} voices={[]} onChange={setEdit} />
      <output aria-label="Saved config">
        {JSON.stringify({
          use: edit.config.audio?.useNarrationAliases,
          aliases: edit.config.narrationAliases,
        })}
      </output>
    </>
  );
}

it("copies Library → Aliases into a project when turned on in Edit project, and drops them when off", async () => {
  const user = userEvent.setup();
  let aliases = [doctor];
  renderRouted(
    <ProjectSubject use={undefined} />,
    testDeps({
      "GET /api/pronunciations/aliases": (request) => jsonAnswer({ aliases })(request),
      "GET /api/providers/voice/models": jsonAnswer({ models: [], allowsCustom: true }),
    }),
  );
  const toggle = await screen.findByRole("checkbox", { name: "Use narration aliases" });
  // A project from before aliases reads as off and carries none.
  expect((toggle as HTMLInputElement).checked).toBe(false);
  await user.click(toggle);
  expect(await screen.findByText("1 alias copied from Library → Aliases.")).toBeTruthy();
  expect(JSON.parse(screen.getByLabelText("Saved config").textContent ?? "")).toEqual({
    use: true,
    aliases: [doctor],
  });
  // A Library edit reaches the project only when asked.
  aliases = [doctor, { ...doctor, written: "Ms.", spoken: "Miss" }];
  await user.click(screen.getByRole("button", { name: "Update from Library" }));
  expect(await screen.findByText("2 aliases copied from Library → Aliases.")).toBeTruthy();
  await user.click(toggle);
  expect(JSON.parse(screen.getByLabelText("Saved config").textContent ?? "")).toEqual({
    use: false,
  });
});
