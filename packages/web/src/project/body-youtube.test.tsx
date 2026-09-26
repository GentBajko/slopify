import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { body, output, stage } from "@/routes/project-fixtures";
import { jsonAnswer, renderApp, testDeps, testOrigin } from "@/test-app";
import { YoutubeBlock } from "./body-youtube.js";
import { RevisionControlContext } from "./revision-action-context.js";
import { revisionView } from "./revision-fixture.js";
import { RevisionMedia } from "./revision-media.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const description = "How rope holds.\n\n0:00 Opening\n0:20 Knots\n0:40 Close\n\n#Rope #Knots";

function mount(
  outputs = [output("youtube_description", "video"), output("youtube_tags", "video")],
) {
  const video = stage("video", "done");
  const config = { ...revisionView().revision.config, youtubeDescription: true };
  const project = {
    ...body({ status: "done", stages: [video], outputs }).project,
    format: "16:9" as const,
    config,
  };
  const view = {
    ...revisionView(),
    outputs: outputs.map((one) => ({
      recordId: one.role,
      publicationId: null,
      selected: true,
      available: true,
      slot: `video:${one.role}`,
      workKey: "youtube:description",
      assetId: one.id,
      output: one,
      fingerprint: "youtube",
      state: "ready" as const,
    })),
  };
  renderApp(
    <RevisionMedia projectId="p1" revisionId="r1">
      <RevisionControlContext value>
        <YoutubeBlock stage={video} project={project} outputs={outputs} />
      </RevisionControlContext>
    </RevisionMedia>,
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }),
      "GET /files/p1/revisions/r1/youtube_description": () => new Response(description),
      "GET /files/p1/revisions/r1/youtube_tags": () => new Response("rope, knots, sailing knots"),
    }),
  );
}

it("shows the description and tags read-only, copies each and offers both files", async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  mount();
  const text = screen.getByLabelText("Description");
  await waitFor(() => expect(text.textContent).toBe(description));
  // Read-only text, not a field: nothing here takes typing.
  expect(screen.queryByRole("textbox")).toBeNull();
  const tags = screen.getByLabelText("Tags");
  await waitFor(() => expect(tags.textContent).toBe("rope, knots, sailing knots"));

  await userEvent.click(screen.getByRole("button", { name: "Copy description" }));
  expect(writeText).toHaveBeenLastCalledWith(description);
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe("Copied the description."),
  );
  await userEvent.click(screen.getByRole("button", { name: "Copy tags" }));
  expect(writeText).toHaveBeenLastCalledWith("rope, knots, sailing knots");
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Copied the tags."));

  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "Download description.txt" }).getAttribute("href"),
    ).toBe(`${testOrigin}/files/p1/revisions/r1/youtube_description`),
  );
  expect(screen.getByRole("link", { name: "Download tags.txt" }).getAttribute("href")).toBe(
    `${testOrigin}/files/p1/revisions/r1/youtube_tags`,
  );
});

it("says in the status line when the clipboard refuses", async () => {
  vi.stubGlobal("navigator", {
    ...navigator,
    clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
  });
  mount();
  const copy = screen.getByRole("button", { name: "Copy tags" });
  await waitFor(() => expect((copy as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(copy);
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe(
      "Couldn't copy the tags. Select the text and copy it.",
    ),
  );
});

it("keeps the block in place with Copy disabled until the step has written", () => {
  mount([]);
  const block = screen.getByRole("region", { name: "YouTube" });
  // A part of the stage body under a rule, not a bordered box inside the stage's own card.
  expect(block.className).not.toContain("rounded");
  expect(
    within(block)
      .getAllByRole("heading")
      .map((heading) => heading.textContent),
  ).toEqual(["YouTube", "Description", "Tags"]);
  expect(screen.getByLabelText("Description").textContent).toBe(
    "Not written yet. It is made with the video.",
  );
  expect(
    (screen.getByRole("button", { name: "Copy description" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.queryByRole("link", { name: "Download description.txt" })).toBeNull();
});
