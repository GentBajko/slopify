import type { RevisionView } from "@app/slices/revisions/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { revisionView } from "@/project/revision-fixture";
import { jsonAnswer, renderRouted, testOrigin } from "@/test-app";
import { ProjectRoute } from "./project.js";
import { deps, finished, output, selectProjectStage } from "./project-fixtures.js";

afterEach(cleanup);
it("mounts revision editing and immutable media instead of direct legacy mutations", async () => {
  const user = userEvent.setup();
  const vtt = output("subtitles_vtt", "video");
  const video = output("video", "video", { meta: { subtitlesMode: "files" } });
  const outputs = [...finished.outputs.filter((one) => one.role !== "video"), video, vtt];
  const view: RevisionView = {
    ...revisionView(),
    outputs: outputs.map((one) => ({
      recordId: `record-${one.id}`,
      publicationId: null,
      selected: true,
      slot: one.id,
      workKey: one.id,
      assetId: `asset-${one.id}`,
      output: one,
      fingerprint: "same",
      state: "ready",
      available: true,
    })),
  };
  const folder = vi.fn(jsonAnswer({ ok: true }));
  const start = vi.fn();
  const prepare = vi.fn(jsonAnswer({ ok: true, view, created: false }));
  const { container } = renderRouted(
    <ProjectRoute projectId="p1" />,
    deps({
      "GET /api/projects/p1": jsonAnswer({ ...finished, revisionId: "r1", outputs }),
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }),
      "GET /files/p1/revisions/r1/record-o-article_md-0": () =>
        new Response("# Immutable article\n\nRetained prose."),
      "POST /api/projects/p1/revisions/r1/record-o-video-0/open-folder": folder,
      "POST /api/projects/p1/revisions/prepare": prepare,
      "POST /api/projects/p1/rebuild": start,
    }),
  );
  await waitFor(() =>
    expect(container.querySelector("video")?.getAttribute("src")).toBe(
      `${testOrigin}/files/p1/revisions/r1/record-o-video-0`,
    ),
  );
  expect(container.querySelector("track")?.getAttribute("src")).toBe(
    `${testOrigin}/files/p1/revisions/r1/record-o-subtitles_vtt-0`,
  );
  expect(screen.queryByRole("button", { name: "Re-render" })).toBeNull();
  const exportPanel = screen.getByRole("region", { name: "Video workspace" });
  await user.click(
    within(exportPanel).getAllByRole("button", { name: "Open folder" })[0] ??
      (() => {
        throw new Error("Missing folder control");
      })(),
  );
  expect(folder).toHaveBeenCalledOnce();
  await selectProjectStage("Article");
  await screen.findByText("Retained prose.");
  expect(screen.queryByRole("button", { name: "Re-run" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Edit project" }));
  await screen.findByRole("textbox", { name: "Project title" });
  expect(prepare).toHaveBeenCalledOnce();
  expect(start).not.toHaveBeenCalled();
});
