import type { Output } from "@app/slices/storage/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderApp, testDeps, testOrigin } from "@/test-app";
import { NarrationDownloads } from "./narration-downloads";
import { revisionView } from "./revision-fixture";
import { RevisionMedia } from "./revision-media";

afterEach(cleanup);
it("offers six separately named downloads scoped to the selected historical revision", async () => {
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
      <NarrationDownloads outputs={outputs} />
    </RevisionMedia>,
    testDeps({ "GET /api/projects/p1/revisions/old": jsonAnswer({ view }) }),
  );
  await waitFor(() =>
    expect(screen.getByRole("link", { name: "Body Clean Narration" }).getAttribute("href")).toBe(
      `${testOrigin}/files/p1/revisions/old/body-narration_txt`,
    ),
  );
  expect(screen.getAllByRole("link")).toHaveLength(6);
  for (const output of outputs)
    expect(
      screen
        .getAllByRole("link")
        .some(
          (link) =>
            link.getAttribute("href") === `${testOrigin}/files/p1/revisions/old/${output.id}`,
        ),
    ).toBe(true);
  expect(container.querySelectorAll("audio")).toHaveLength(0);
  expect(screen.getByText(/blank lines separate requests/)).not.toBeNull();
});
