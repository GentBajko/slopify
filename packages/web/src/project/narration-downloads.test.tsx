import type { Output } from "@app/slices/storage/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderApp, testDeps, testOrigin } from "@/test-app";
import { narrationAudioFiles, narrationTextFiles } from "./narration-downloads";
import { StageFiles } from "./parts";
import { revisionView } from "./revision-fixture";
import { RevisionMedia } from "./revision-media";

afterEach(cleanup);
it("lists six named text files in one Download menu, with one Open folder, scoped to the selected revision", async () => {
  const outputs: Output[] = (["intro", "body", "outro"] as const).flatMap((segment) =>
    (["narration_txt", "tts_script"] as const).map((role) => ({
      id: `${segment}-${role}`,
      projectId: "p1",
      stageKind: "audio",
      role,
      path: `${segment}-${role}.txt`,
      originalFilename: null,
      bytes: 10,
      durationMs: null,
      meta: { segment },
      createdAt: "today",
    })),
  );
  const view = {
    ...revisionView("old"),
    current: false,
    outputs: outputs.map((output) => ({
      recordId: output.id,
      publicationId: null,
      selected: true,
      slot: output.id,
      workKey: `narration:files:${output.meta.segment}`,
      assetId: output.id,
      output,
      fingerprint: output.id,
      state: "ready" as const,
      available: true,
    })),
  };
  const { container } = renderApp(
    <RevisionMedia projectId="p1" revisionId="old">
      <StageFiles files={narrationTextFiles(outputs)} label="Download the text" />
    </RevisionMedia>,
    testDeps({ "GET /api/projects/p1/revisions/old": jsonAnswer({ view }) }),
  );
  // One folder button for the stage, never one per file.
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: "Open folder" })).toHaveLength(1),
  );
  await userEvent.click(screen.getByRole("button", { name: "Download the text" }));
  expect(
    (await screen.findByRole("menuitem", { name: "Spoken text, main part (.txt)" })).getAttribute(
      "href",
    ),
  ).toBe(`${testOrigin}/files/p1/revisions/old/body-narration_txt`);
  const items = screen.getAllByRole("menuitem");
  // In plain words: no "TTS", no "clean narration".
  expect(items.map((item) => item.textContent)).toEqual([
    "Spoken text, intro (.txt)",
    "Script sent to the voice, intro (.txt)",
    "Spoken text, main part (.txt)",
    "Script sent to the voice, main part (.txt)",
    "Spoken text, outro (.txt)",
    "Script sent to the voice, outro (.txt)",
  ]);
  for (const output of outputs)
    expect(
      items.some(
        (item) => item.getAttribute("href") === `${testOrigin}/files/p1/revisions/old/${output.id}`,
      ),
    ).toBe(true);
  expect(container.querySelectorAll("audio")).toHaveLength(0);
});

it("offers the speaker split beside the narration files, as the text it was read from", () => {
  const file = (
    id: string,
    role: Output["role"],
    segment?: "intro" | "body" | "outro",
  ): Output => ({
    id,
    projectId: "p1",
    stageKind: role === "script_md" ? "article" : "audio",
    role,
    path: role === "script_md" ? "script.md" : `${id}.txt`,
    originalFilename: null,
    bytes: 10,
    durationMs: null,
    meta: segment === undefined ? {} : { segment },
    createdAt: "today",
  });
  const labels = narrationTextFiles(
    [file("body-script", "tts_script", "body")],
    file("speakers", "script_md"),
  ).map((one) => one.label);
  expect(labels).toEqual(["Script sent to the voice (.txt)", "Script by speaker (.md)"]);
  expect(
    narrationTextFiles([file("body-script", "tts_script", "body")]).map((one) => one.label),
  ).toEqual(["Script sent to the voice (.txt)"]);
});

it("names one recording the narration, and the parts of one in parts", () => {
  const recording = (segment: "intro" | "body" | "outro"): Output => ({
    id: segment,
    projectId: "p1",
    stageKind: "audio",
    role: segment === "intro" ? "audio_intro" : segment === "body" ? "audio_body" : "audio_outro",
    path: `${segment}.mp3`,
    originalFilename: null,
    bytes: 10,
    durationMs: 1000,
    meta: {},
    createdAt: "today",
  });
  expect(
    narrationAudioFiles([{ segment: "body", output: recording("body") }]).map((one) => one.label),
  ).toEqual(["Narration (.mp3)"]);
  expect(
    narrationAudioFiles(
      (["intro", "body", "outro"] as const).map((segment) => ({
        segment,
        output: recording(segment),
      })),
    ).map((one) => one.label),
  ).toEqual(["Intro (.mp3)", "Main part (.mp3)", "Outro (.mp3)"]);
});
