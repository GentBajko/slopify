import type { RevisionView } from "@app/slices/revisions/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderApp, testDeps, testOrigin } from "@/test-app";
import { revisionView } from "./revision-fixture.js";
import { RevisionMedia, useAssetMedia, useOutputMedia } from "./revision-media.js";

afterEach(cleanup);
const output: Output = {
  id: "output1",
  projectId: "p1",
  stageKind: "images",
  role: "image",
  path: "asset.png",
  originalFilename: null,
  bytes: 10,
  durationMs: null,
  meta: { index: 1 },
  createdAt: "today",
};
function view(id: string, recordId: string): RevisionView {
  return {
    ...revisionView(id),
    outputs: [
      {
        recordId,
        publicationId: null,
        selected: true,
        slot: "image:one",
        workKey: "image:one",
        assetId: "asset1",
        output,
        fingerprint: "same-image",
        state: "ready",
        available: true,
      },
    ],
  };
}
function Probe() {
  const file = useOutputMedia(output);
  const zip = useAssetMedia("p1", "images.zip");
  const foreign = useAssetMedia("other", "image-1");
  const loaded = useAssetMedia("p1", "article-txt");
  return (
    <div>
      <a href={file?.url}>Image</a>
      <a href={zip?.url}>ZIP</a>
      <a href={foreign?.url}>Foreign</a>
      <a href={loaded?.url}>Loaded manifest</a>
      <output aria-label="Cache key">{JSON.stringify(file?.cacheKey)}</output>
      <output aria-label="Folder">{JSON.stringify(file?.folder)}</output>
    </div>
  );
}
it("uses registered revision record URLs and keys for current media and ZIP downloads", async () => {
  renderApp(
    <RevisionMedia projectId="p1" revisionId="r1">
      <Probe />
    </RevisionMedia>,
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view: view("r1", "record1") }),
    }),
  );
  await waitFor(() =>
    expect(screen.getByText("Image").getAttribute("href")).toBe(
      `${testOrigin}/files/p1/revisions/r1/record1`,
    ),
  );
  expect(screen.getByText("ZIP").getAttribute("href")).toBe(
    `${testOrigin}/files/p1/revisions/r1/images.zip`,
  );
  expect(screen.getByLabelText("Cache key").textContent).toContain("record1");
  expect(screen.getByLabelText("Folder").textContent).toBe(
    JSON.stringify({ revisionId: "r1", recordId: "record1" }),
  );
  expect(screen.getByText("Foreign").getAttribute("href")).toBeNull();
});
it("does not use a mutable file URL while a newer manifest loads or after an older fetch arrives", async () => {
  const user = userEvent.setup();
  let release: (response: Response) => void = () => undefined;
  const old = new Promise<Response>((resolve) => {
    release = resolve;
  });
  function Switching() {
    const [id, setId] = useState("r1");
    return (
      <>
        <button type="button" onClick={() => setId("r2")}>
          Next revision
        </button>
        <RevisionMedia projectId="p1" revisionId={id}>
          <Probe />
        </RevisionMedia>
      </>
    );
  }
  renderApp(
    <Switching />,
    testDeps({
      "GET /api/projects/p1/revisions/r1": () => old,
      "GET /api/projects/p1/revisions/r2": jsonAnswer({ view: view("r2", "record2") }),
    }),
  );
  expect(screen.getByText("Image").getAttribute("href")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Next revision" }));
  const expected = `${testOrigin}/files/p1/revisions/r2/record2`;
  await waitFor(() => expect(screen.getByText("Image").getAttribute("href")).toBe(expected));
  await act(async () => {
    release(
      new Response(JSON.stringify({ view: view("r1", "record1") }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await old;
  });
  await waitFor(() => expect(screen.getByText("Image").getAttribute("href")).toBe(expected));
  expect(screen.getByLabelText("Cache key").textContent).toContain("record2");
});
it.each(["missing", "deselected"])(
  "withholds a %s headed file instead of resolving the current role",
  async (kind) => {
    const current = view("r1", "record1");
    renderApp(
      <RevisionMedia projectId="p1" revisionId="r1">
        <Probe />
      </RevisionMedia>,
      testDeps({
        "GET /api/projects/p1/revisions/r1": jsonAnswer({
          view: {
            ...current,
            outputs: [
              ...current.outputs.map((row) => ({
                ...row,
                available: kind !== "missing",
                selected: kind !== "deselected",
              })),
              {
                recordId: "article-record",
                publicationId: null,
                selected: true,
                slot: "article:txt",
                workKey: "article:text",
                assetId: "article-asset",
                fingerprint: "article",
                state: "ready",
                available: true,
                output: {
                  ...output,
                  id: "article-output",
                  role: "article_txt",
                  stageKind: "article",
                },
              },
            ],
          },
        }),
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("Loaded manifest").getAttribute("href")).toBe(
        `${testOrigin}/files/p1/revisions/r1/article-record`,
      ),
    );
    expect(screen.getByText("Image").getAttribute("href")).toBeNull();
    expect(screen.getByText("ZIP").getAttribute("href")).toBeNull();
  },
);
it("retains legacy file paths when the project explicitly has no revision", () => {
  renderApp(
    <RevisionMedia projectId="p1" revisionId={null}>
      <Probe />
    </RevisionMedia>,
    testDeps({}),
  );
  expect(screen.getByText("Image").getAttribute("href")).toBe(`${testOrigin}/files/p1/image-1`);
  expect(screen.getByLabelText("Folder").textContent).toBe("null");
});
