import type { Output } from "@app/slices/storage/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderApp, testDeps, testOrigin } from "@/test-app";
import { narrationFiles } from "./narration-downloads";
import { StageFiles } from "./parts";
import { revisionView } from "./revision-fixture";
import { RevisionMedia } from "./revision-media";

afterEach(cleanup);
it("lists six named files in one Download menu, with one Open folder, scoped to the selected revision", async () => {
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
      <StageFiles files={narrationFiles(outputs)} />
    </RevisionMedia>,
    testDeps({ "GET /api/projects/p1/revisions/old": jsonAnswer({ view }) }),
  );
  // One folder button for the stage, never one per file.
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: "Open folder" })).toHaveLength(1),
  );
  await userEvent.click(screen.getByRole("button", { name: "Download" }));
  expect(
    (await screen.findByRole("menuitem", { name: "Body clean narration (.txt)" })).getAttribute(
      "href",
    ),
  ).toBe(`${testOrigin}/files/p1/revisions/old/body-narration_txt`);
  const items = screen.getAllByRole("menuitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "Intro clean narration (.txt)",
    "Intro TTS script (.txt)",
    "Body clean narration (.txt)",
    "Body TTS script (.txt)",
    "Outro clean narration (.txt)",
    "Outro TTS script (.txt)",
  ]);
  for (const output of outputs)
    expect(
      items.some(
        (item) => item.getAttribute("href") === `${testOrigin}/files/p1/revisions/old/${output.id}`,
      ),
    ).toBe(true);
  expect(container.querySelectorAll("audio")).toHaveLength(0);
});
