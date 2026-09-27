import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { body, output, stage } from "@/routes/project-fixtures";
import type { Answer } from "@/test-app";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { YoutubeBlock } from "./body-youtube.js";
import { RevisionControlContext } from "./revision-action-context.js";
import { revisionView } from "./revision-fixture.js";
import { RevisionMedia } from "./revision-media.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const description =
  "How rope holds. Support: {{Patreon}}\n\n0:00 Opening\n0:20 Knots\n0:40 Close\n\n#Rope #Knots";

function mount({
  outputs = [output("youtube_description", "video"), output("youtube_tags", "video")],
  edits = { fields: {}, links: [] } as unknown,
  links = [{ name: "Patreon", url: "https://patreon.com/rope" }] as unknown,
  extra = {} as Readonly<Record<string, Answer>>,
} = {}) {
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
  renderRouted(
    <RevisionMedia projectId="p1" revisionId="r1">
      <RevisionControlContext value>
        <YoutubeBlock stage={video} project={project} outputs={outputs} />
      </RevisionControlContext>
    </RevisionMedia>,
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }),
      "GET /files/p1/revisions/r1/youtube_description": () => new Response(description),
      "GET /files/p1/revisions/r1/youtube_tags": () => new Response("rope, knots, sailing knots"),
      [`GET /api/projects/${project.id}/youtube-edits`]: jsonAnswer(edits),
      [`GET /api/projects/${project.id}/channel-links`]: jsonAnswer({ channelId: "c1", links }),
      ...extra,
    }),
  );
  return project;
}

it("shows the description in its parts with placeholders filled, and copies it filled", async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  mount();
  const summary = await screen.findByRole("region", { name: "Summary" });
  await waitFor(() =>
    expect(summary.textContent).toBe("How rope holds. Support: https://patreon.com/rope"),
  );
  expect(screen.getByRole("region", { name: "Chapters" }).textContent).toBe(
    "0:00 Opening\n0:20 Knots\n0:40 Close",
  );
  expect(screen.getByRole("region", { name: "Hashtags" }).textContent).toBe("#Rope #Knots");
  expect(
    within(screen.getByRole("region", { name: "Tags" }))
      .getAllByRole("listitem")
      .map((tag) => tag.textContent),
  ).toEqual(["rope", "knots", "sailing knots"]);

  await userEvent.click(screen.getByRole("button", { name: "Copy description" }));
  expect(writeText).toHaveBeenLastCalledWith(
    "How rope holds. Support: https://patreon.com/rope\n\n0:00 Opening\n0:20 Knots\n0:40 Close\n\n#Rope #Knots",
  );
  await waitFor(() =>
    expect(screen.getAllByRole("status").map((one) => one.textContent)).toContain(
      "Copied the description.",
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "Copy tags" }));
  expect(writeText).toHaveBeenLastCalledWith("rope, knots, sailing knots");
});

it("marks a placeholder with no link and keeps it in the copy", async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  mount({ links: [] });
  const summary = await screen.findByRole("region", { name: "Summary" });
  await waitFor(() => expect(within(summary).getByText("{{Patreon}}").tagName).toBe("MARK"));
  expect(screen.getByText(/No link is saved for \{\{Patreon\}\}/u)).not.toBeNull();
  // The links are the project's channel's: the note leads to its Brand tab.
  expect(screen.getByRole("link", { name: "the channel's Brand tab" }).getAttribute("href")).toBe(
    "/channels/c1",
  );
  await userEvent.click(screen.getByRole("button", { name: "Copy description" }));
  expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining("Support: {{Patreon}}"));
});

it("saves an edit in place with the generated text it was made from", async () => {
  let sent: unknown;
  mount({
    extra: {
      "PUT /api/projects/p1/youtube-edits/fields/summary": async (request) => {
        sent = await request.json();
        return jsonAnswer({
          fields: { summary: { base: "x", text: "My own summary." } },
          links: [],
        })(request);
      },
    },
  });
  await screen.findByText(/How rope holds/u);
  await userEvent.click(screen.getByRole("button", { name: "Edit summary" }));
  const box = screen.getByRole("textbox", { name: "Summary" });
  await userEvent.clear(box);
  await userEvent.type(box, "My own summary.");
  await userEvent.click(screen.getByRole("button", { name: "Save summary" }));
  await waitFor(() =>
    expect(sent).toEqual({
      text: "My own summary.",
      base: "How rope holds. Support: {{Patreon}}",
    }),
  );
  expect(await screen.findByText("My own summary.")).not.toBeNull();
  expect(screen.getByText("Your edit")).not.toBeNull();
});

it("offers the new generated text beside an edit instead of overwriting it", async () => {
  let dropped = false;
  mount({
    edits: {
      fields: {
        chapters: { base: "0:00 Old\n0:30 Older", text: "0:00 Mine\n0:20 Knots\n0:40 End" },
      },
      links: [],
    },
    extra: {
      "DELETE /api/projects/p1/youtube-edits/fields/chapters": (request) => {
        dropped = true;
        return jsonAnswer({ fields: {}, links: [] })(request);
      },
    },
  });
  expect(await screen.findByText("New generated version available.")).not.toBeNull();
  expect(screen.getByRole("region", { name: "Chapters" }).textContent).toBe(
    "0:00 Mine\n0:20 Knots\n0:40 End",
  );
  await userEvent.click(screen.getByRole("button", { name: "View the chapters diff" }));
  expect(screen.getByRole("region", { name: "New generated" })).not.toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Use the new generated chapters" }));
  await waitFor(() => expect(dropped).toBe(true));
  await waitFor(() =>
    expect(screen.getByRole("region", { name: "Chapters" }).textContent).toBe(
      "0:00 Opening\n0:20 Knots\n0:40 Close",
    ),
  );
});

it("fits hand-edited chapters to YouTube's rules when shown and copied, and says what changed", async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  const mine = "0:05 Opening\n0:20 Knots\n0:26 Blink\n0:40 Close";
  mount({
    edits: {
      fields: { chapters: { base: "0:00 Opening\n0:20 Knots\n0:40 Close", text: mine } },
      links: [],
    },
  });
  await waitFor(() =>
    expect(screen.getByRole("region", { name: "Chapters" }).textContent).toBe(
      "0:00 Opening\n0:26 Blink\n0:40 Close",
    ),
  );
  expect(
    screen.getByText(
      'Chapters adjusted for YouTube: moved the first, "Opening", from 0:05 to 0:00; merged "Knots" (6 s) into "Opening".',
    ),
  ).not.toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Copy description" }));
  expect(writeText).toHaveBeenLastCalledWith(
    expect.stringContaining("\n\n0:00 Opening\n0:26 Blink\n0:40 Close\n\n"),
  );
  // Editing starts from the user's own text, not the fitted one.
  await userEvent.click(screen.getByRole("button", { name: "Edit chapters" }));
  expect((screen.getByRole("textbox", { name: "Chapters" }) as HTMLTextAreaElement).value).toBe(
    mine,
  );
});

it("leaves out a chapter list YouTube would ignore", async () => {
  mount({
    edits: {
      fields: {
        chapters: { base: "0:00 Opening\n0:20 Knots\n0:40 Close", text: "0:00 A\n0:30 B" },
      },
      links: [],
    },
  });
  expect(await screen.findByText("Left out; see the note below.")).not.toBeNull();
  expect(
    screen.getByText(/left the chapter list out, since YouTube needs at least 3/u),
  ).not.toBeNull();
});

it("keeps the block in place with Copy and Edit disabled until the step has written", async () => {
  mount({ outputs: [] });
  const block = await screen.findByRole("region", { name: "YouTube" });
  // A part of the stage body under a rule, not a bordered box inside the stage's own card.
  expect(block.className).not.toContain("rounded");
  expect(screen.getByRole("region", { name: "Summary" }).textContent).toBe(
    "Not written yet. It is made with the video.",
  );
  expect(
    (screen.getByRole("button", { name: "Copy description" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect((screen.getByRole("button", { name: "Edit summary" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});
