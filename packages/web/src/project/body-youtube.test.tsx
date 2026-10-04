import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { body, output, stage } from "@/routes/project-fixtures";
import type { Answer } from "@/test-app";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { YoutubeBlock } from "./body-youtube.js";
import { RegenerateNowContext, RevisionControlContext } from "./revision-action-context.js";
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
  regenerateNow = undefined as ((workKeys: readonly string[]) => void) | undefined,
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
        <RegenerateNowContext value={regenerateNow}>
          <YoutubeBlock stage={video} project={project} outputs={outputs} />
        </RegenerateNowContext>
      </RevisionControlContext>
    </RevisionMedia>,
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }),
      "GET /files/p1/revisions/r1/youtube_description": () => new Response(description),
      "GET /files/p1/revisions/r1/youtube_tags": () => new Response("rope, knots, sailing knots"),
      "GET /files/p1/revisions/r1/youtube_pinned_comment": () =>
        new Response("Thanks for tying along. Support: {{Patreon}}"),
      "GET /files/p1/revisions/r1/youtube_titles": () =>
        new Response("Rope That Holds\nThe Knot Sailors Trust"),
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
  // The parts fold, one open at a time: Tags opens from its head.
  await userEvent.click(screen.getByRole("button", { name: "Tags" }));
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

it("shows the pinned comment with its links filled, and copies it", async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  mount({
    outputs: [
      output("youtube_description", "video"),
      output("youtube_tags", "video"),
      output("youtube_pinned_comment", "video"),
    ],
  });
  await userEvent.click(await screen.findByRole("button", { name: "Pinned comment" }));
  const comment = await screen.findByRole("region", { name: "Pinned comment" });
  await waitFor(() =>
    expect(comment.textContent).toBe("Thanks for tying along. Support: https://patreon.com/rope"),
  );
  await userEvent.click(screen.getByRole("button", { name: "Copy pinned comment" }));
  expect(writeText).toHaveBeenLastCalledWith(
    "Thanks for tying along. Support: https://patreon.com/rope",
  );
});

it("says a description written before pinned comments has none, and writes it again on request", async () => {
  const regenerateNow = vi.fn();
  mount({ regenerateNow });
  await screen.findByText(/How rope holds/u);
  expect(screen.getByText(/Written before pinned comments existed/u)).not.toBeNull();
  expect(screen.getByRole("button", { name: "Copy pinned comment" }).hasAttribute("disabled")).toBe(
    true,
  );
  await userEvent.click(screen.getByRole("button", { name: "Write the pinned comment again" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("A field you edited keeps your text");
  await userEvent.click(within(dialog).getByRole("button", { name: "Write again" }));
  expect(regenerateNow).toHaveBeenCalledWith(["youtube:description"]);
});

it("shows the other titles for YouTube's A/B test and copies them one per line", async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  mount({
    outputs: [
      output("youtube_description", "video"),
      output("youtube_tags", "video"),
      output("youtube_titles", "video"),
    ],
  });
  await userEvent.click(await screen.findByRole("button", { name: "Other titles" }));
  const titles = await screen.findByRole("region", { name: "Other titles" });
  await waitFor(() => expect(titles.textContent).toBe("Rope That Holds\nThe Knot Sailors Trust"));
  expect(screen.getByText("3 titles to test")).not.toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Copy other titles" }));
  expect(writeText).toHaveBeenLastCalledWith("Rope That Holds\nThe Knot Sailors Trust");
});

it("counts the description as it is typed and checks it against YouTube's rules", async () => {
  mount();
  await screen.findByText(/How rope holds/u);
  const count = () => screen.getByText(/ \/ 5000 characters/u).textContent ?? "";
  const before = count();
  await userEvent.click(screen.getByRole("button", { name: "Edit summary" }));
  const box = screen.getByRole("textbox", { name: "Summary" });
  await userEvent.type(box, " <b>");
  expect(count()).not.toBe(before);
  expect(
    screen.getByText("YouTube doesn't allow < or > in a description. Remove them."),
  ).not.toBeNull();
  expect(screen.getByText("2 hashtags; the first 2 show above the title.")).not.toBeNull();
});

it("holds Use it while an edit is open, and Use generated offers Undo", async () => {
  const saved: unknown[] = [];
  mount({
    edits: {
      fields: {
        chapters: { base: "0:00 Old\n0:30 Older", text: "0:00 Mine\n0:20 Knots\n0:40 End" },
      },
      links: [],
    },
    extra: {
      "DELETE /api/projects/p1/youtube-edits/fields/chapters": (request) =>
        jsonAnswer({ fields: {}, links: [] })(request),
      "PUT /api/projects/p1/youtube-edits/fields/chapters": async (request) => {
        saved.push(await request.json());
        return jsonAnswer({ fields: {}, links: [] })(request);
      },
    },
  });
  expect(await screen.findByText("New generated version available.")).not.toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Edit chapters" }));
  const useIt = screen.getByRole("button", { name: "Use the new generated chapters" });
  expect(useIt.hasAttribute("disabled")).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await userEvent.click(useIt);
  await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
  await waitFor(() =>
    expect(saved).toEqual([
      { text: "0:00 Mine\n0:20 Knots\n0:40 End", base: "0:00 Old\n0:30 Older" },
    ]),
  );
});
