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

const pasted = () => screen.getByRole("region", { name: "The description as it is pasted" });

it("shows the description as it is pasted, with the tags beside it, and copies each filled", async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  mount();
  await waitFor(() =>
    expect(pasted().textContent).toBe(
      "How rope holds. Support: https://patreon.com/rope\n\n0:00 Opening\n0:20 Knots\n0:40 Close\n\n#Rope #Knots",
    ),
  );
  // Every part is in view at once: no part folds another away.
  expect(
    within(screen.getByRole("region", { name: "Tags" }))
      .getAllByRole("listitem")
      .map((tag) => tag.textContent),
  ).toEqual(["rope", "knots", "sailing knots"]);
  expect(screen.getByText("2 hashtags; the first 2 show above the title.")).not.toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Copy description" }));
  expect(writeText).toHaveBeenLastCalledWith(
    "How rope holds. Support: https://patreon.com/rope\n\n0:00 Opening\n0:20 Knots\n0:40 Close\n\n#Rope #Knots",
  );
  expect(await screen.findByText("Copied the description.")).not.toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Copy tags" }));
  expect(writeText).toHaveBeenLastCalledWith("rope, knots, sailing knots");
});

it("marks a placeholder with no link and keeps it in the copy", async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  mount({ links: [] });
  await waitFor(() => expect(within(pasted()).getByText("{{Patreon}}").tagName).toBe("MARK"));
  expect(screen.getByText(/No link is saved for \{\{Patreon\}\}/u)).not.toBeNull();
  // The links are the project's channel's: the note leads to its Name and look tab.
  expect(
    screen.getByRole("link", { name: "the channel's Name and look tab" }).getAttribute("href"),
  ).toBe("/channels/c1");
  await userEvent.click(screen.getByRole("button", { name: "Copy description" }));
  expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining("Support: {{Patreon}}"));
});

it("edits one part of the description in place and keeps it as the person's own", async () => {
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
  // The description as it is pasted follows the typing.
  expect(pasted().textContent).toContain("My own summary.\n\n0:00 Opening");
  await userEvent.click(screen.getByRole("button", { name: "Save summary" }));
  await waitFor(() =>
    expect(sent).toEqual({
      text: "My own summary.",
      base: "How rope holds. Support: {{Patreon}}",
    }),
  );
  expect(
    await screen.findByText("Summary: your own text, kept when the description is written again."),
  ).not.toBeNull();
  expect(pasted().textContent).toContain("My own summary.");
});

it("offers the newly written text beside an edit instead of overwriting it", async () => {
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
  expect(
    await screen.findByText("Chapters written again. Yours stays until you choose."),
  ).not.toBeNull();
  expect(pasted().textContent).toContain("0:00 Mine\n0:20 Knots\n0:40 End");
  await userEvent.click(screen.getByRole("button", { name: "Show what changed in the chapters" }));
  expect(screen.getByRole("region", { name: "New" })).not.toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Use the new chapters" }));
  await waitFor(() => expect(dropped).toBe(true));
  await waitFor(() =>
    expect(pasted().textContent).toContain("0:00 Opening\n0:20 Knots\n0:40 Close"),
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
    expect(pasted().textContent).toContain("\n\n0:00 Opening\n0:26 Blink\n0:40 Close\n\n"),
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
  // Editing starts from the person's own text, not the fitted one.
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
  await waitFor(() =>
    expect(pasted().textContent).toBe(
      "How rope holds. Support: https://patreon.com/rope\n\n#Rope #Knots",
    ),
  );
  expect(
    screen.getByText(/left the chapter list out, since YouTube needs at least 3/u),
  ).not.toBeNull();
});

it("says the text is not written yet, with nothing to copy or edit until it is", async () => {
  mount({ outputs: [] });
  await waitFor(() =>
    expect(pasted().textContent).toBe("Not written yet. It is made with the video."),
  );
  expect(screen.queryByRole("button", { name: "Copy description" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Edit summary" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Write the description again/u })).toBeNull();
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
  const comment = await screen.findByRole("region", { name: "The pinned comment" });
  await waitFor(() =>
    expect(comment.textContent).toBe("Thanks for tying along. Support: https://patreon.com/rope"),
  );
  await userEvent.click(screen.getByRole("button", { name: "Copy pinned comment" }));
  expect(writeText).toHaveBeenLastCalledWith(
    "Thanks for tying along. Support: https://patreon.com/rope",
  );
});

it("writes every part again from one button that says its cost, never from a part's head", async () => {
  const regenerateNow = vi.fn();
  mount({ regenerateNow });
  await screen.findByText(/How rope holds/u);
  expect(
    screen.getByText(
      /^None yet\. Write the description again to have one written, or press Edit pinned comment/u,
    ),
  ).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Copy pinned comment" })).toBeNull();
  const again = screen.getAllByRole("button", { name: /again/u });
  expect(again.map((one) => one.textContent)).toEqual(["Write the description again · 1 AI call"]);
  expect(screen.getByText(/Rewrites every part above/u)).not.toBeNull();
  await userEvent.click(again[0] ?? document.body);
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("A part you edited keeps your text");
  await userEvent.click(within(dialog).getByRole("button", { name: "Write it again · 1 AI call" }));
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
  const titles = await screen.findByRole("region", { name: "The other titles" });
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
    screen.getAllByText("YouTube doesn't allow < or > in a description. Remove them."),
  ).toHaveLength(1);
  // Where hashtags show is said once, under the description.
  expect(screen.getAllByText("2 hashtags; the first 2 show above the title.")).toHaveLength(1);
});

it("keeps Use the new one out of reach while an edit is open, and the way back offers Undo", async () => {
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
  await screen.findByText("Chapters written again. Yours stays until you choose.");
  await userEvent.click(screen.getByRole("button", { name: "Edit chapters" }));
  expect(screen.queryByRole("button", { name: "Use the new chapters" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await userEvent.click(screen.getByRole("button", { name: "Use the new chapters" }));
  await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
  await waitFor(() =>
    expect(saved).toEqual([
      { text: "0:00 Mine\n0:20 Knots\n0:40 End", base: "0:00 Old\n0:30 Older" },
    ]),
  );
});

it("on the read-only sample, copies the text and says in one sentence that it can't be posted", async () => {
  const regenerateNow = vi.fn();
  mount({
    regenerateNow,
    extra: {
      "GET /api/onboarding/sample": jsonAnswer({
        projectId: "p1",
        samples: { library: "p1", audiobook: null, podcast: null },
      }),
    },
  });
  expect(await screen.findByText(/This sample isn't on YouTube and can't be/u)).not.toBeNull();
  // Make my own copy is the title row's button: named here, not drawn a second time.
  expect(screen.getByText(/Press Make my own copy at the top/u)).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Make my own copy" })).toBeNull();
  expect(await screen.findByRole("button", { name: "Copy description" })).not.toBeNull();
  // Nothing on it edits, writes again, takes a date or a link.
  expect(screen.queryByRole("button", { name: /^Edit /u })).toBeNull();
  expect(screen.queryByRole("button", { name: /Write the description again/u })).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
});
