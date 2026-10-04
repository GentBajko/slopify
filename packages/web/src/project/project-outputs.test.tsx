import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { output, stage } from "@/routes/project-fixtures";
import { jsonAnswer, renderRouted, testDeps, testOrigin } from "@/test-app";
import { ProjectOutputs } from "./project-outputs.js";
import { revisionView } from "./revision-fixture.js";
import { RevisionMedia } from "./revision-media.js";

afterEach(cleanup);

const view = revisionView();
const config = {
  ...view.revision.config,
  audio: { provider: "openai-tts", model: "tts", voice: "alloy" },
};
const article = output("article_md", "article");
const record = (one: ReturnType<typeof output>, recordId: string, slot: string) => ({
  recordId,
  publicationId: null,
  selected: true,
  available: true,
  slot,
  workKey: slot,
  assetId: one.id,
  output: one,
  fingerprint: slot,
  state: "ready" as const,
});

it("adds narration after showing what is reused, made and charged, then starts only its work", async () => {
  const review = vi.fn();
  const requests: unknown[] = [];
  renderRouted(
    <RevisionMedia projectId="p1" revisionId="r1">
      <ProjectOutputs
        projectId="p1"
        revisionId="r1"
        config={config}
        stages={[stage("article", "provided"), stage("audio", "skipped")]}
        outputs={[article]}
        controller={{ review, requestEdit: vi.fn(), busy: false }}
      />
    </RevisionMedia>,
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({
        view: { ...view, outputs: [record(article, "rec-article", "article:md")] },
      }),
      "POST /api/projects/p1/outputs/preview": async (request) => {
        const podcast = ((await request.json()) as { kind: string }).kind === "podcast";
        const narration = {
          kind: "narration",
          label: "Narration",
          reused: ["Brief: title, prompts and keywords", "Accepted article text"],
          created: ["Narration of the text", "The narration as one audio file"],
          textUse: "Your text is used as written: nothing is rewritten.",
          adapts: false,
          estimate: {
            currency: "USD",
            rows: [],
            low: 0.12,
            high: 0.12,
            unknown: 0,
            expectedWords: 2,
            catalogueDate: null,
            assumptions: [],
          },
          problems: [],
          config: { ...config, sources: { ...config.sources, audio: "generate" } },
        };
        return jsonAnswer(
          podcast
            ? {
                ...narration,
                kind: "podcast",
                adapts: true,
                textUse: "Adapted: the text model rewrites your article as a conversation.",
              }
            : narration,
        )(request);
      },
      "POST /api/projects/p1/outputs": async (request) => {
        requests.push(await request.json());
        return jsonAnswer({
          ok: true,
          view: revisionView("r2"),
          workKeys: ["audio:body:1", "export:wav"],
          duplicate: false,
        })(request);
      },
    }),
  );
  expect(await screen.findByText("Article")).not.toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Add another output" }));
  expect(await screen.findByText("Accepted article text", { exact: false })).not.toBeNull();
  expect(screen.getByText("Narration of the text", { exact: false })).not.toBeNull();
  expect(screen.getByText("About $0.12.")).not.toBeNull();
  expect(screen.getByText(/used as written/)).not.toBeNull();
  // A podcast rewrites the text: it says so, and Add waits for the adaptation to be ticked.
  await userEvent.click(screen.getByRole("radio", { name: /Podcast/ }));
  const adapt = await screen.findByRole("checkbox", {
    name: /Adapt my article into a conversation/,
  });
  expect(screen.getByText(/rewrites your article as a conversation/)).not.toBeNull();
  expect(screen.getByRole("button", { name: "Add podcast" })).toHaveProperty("disabled", true);
  await userEvent.click(adapt);
  expect(screen.getByRole("button", { name: "Add podcast" })).toHaveProperty("disabled", false);
  await userEvent.click(screen.getByRole("radio", { name: "Narration" }));
  await userEvent.click(await screen.findByRole("button", { name: "Add narration" }));
  await waitFor(() => expect(review).toHaveBeenCalled());
  expect(requests[0]).toMatchObject({ baseRevisionId: "r1", kind: "narration" });
  expect(review).toHaveBeenCalledWith(
    { kind: "selected", workKeys: ["audio:body:1", "export:wav"] },
    { autoStart: true, approvedUpTo: 0.12 },
  );
});

it("lists the files of a set before its zip downloads, and zips only the ones still ticked", async () => {
  const images = [1, 2].map((index) => output("image", "images", { meta: { index } }));
  renderRouted(
    <RevisionMedia projectId="p1" revisionId="r1">
      <ProjectOutputs
        projectId="p1"
        revisionId="r1"
        config={{ ...config, sources: { ...config.sources, images: "generate" } }}
        stages={[stage("article", "provided"), stage("images", "done")]}
        outputs={[article, ...images]}
        controller={{ review: vi.fn(), requestEdit: vi.fn(), busy: false }}
      />
    </RevisionMedia>,
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({
        view: {
          ...view,
          outputs: [
            record(article, "rec-article", "article:md"),
            record(images[0] ?? article, "rec-1", "image:a"),
            record(images[1] ?? article, "rec-2", "image:b"),
          ],
        },
      }),
    }),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Download all images" }));
  expect(await screen.findByText(/From the version saved/)).not.toBeNull();
  const zip = `${testOrigin}/files/p1/revisions/r1/images.zip`;
  expect(screen.getByRole("link", { name: /Download zip \(2 files\)/ }).getAttribute("href")).toBe(
    zip,
  );
  await userEvent.click(screen.getByRole("checkbox", { name: /Image 1/ }));
  expect(screen.getByRole("link", { name: /Download zip \(1 file\)/ }).getAttribute("href")).toBe(
    `${zip}?only=rec-2`,
  );
});
