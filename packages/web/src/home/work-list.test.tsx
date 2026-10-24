import type { ProjectListing } from "@app/slices/admission/model.js";
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TextLink } from "@/components/kit/link";
import { renderRouted, testDeps } from "@/test-app";
import { finishedLine, lengthWords, madeWords } from "./finished-words.js";
import { ReadyList } from "./work-list.js";

afterEach(cleanup);

function ready(id: string, title: string, over: Partial<ProjectListing> = {}): ProjectListing {
  return {
    id,
    title,
    status: "done",
    progress: 1,
    format: "16:9",
    channelId: "00000000-0000-4000-8000-000000000001",
    uploadedAt: null,
    config: {
      sources: {
        research: "off",
        article: "generate",
        audio: "generate",
        images: "generate",
        thumbnail: "off",
        video: "generate",
      },
    },
    createdAt: "2026-09-02T19:14:00.000Z",
    updatedAt: "2026-09-02T19:14:00.000Z",
    finishedAt: "2026-09-27T17:22:21.000Z",
    durationSeconds: 185,
    outputs: { video: true, shorts: 2, pdf: true, audio: false },
    ...over,
  };
}

function row(title: string): HTMLElement {
  const item = screen.getByRole("link", { name: title }).closest("li");
  if (item === null) throw new Error(`no row for ${title}`);
  return item;
}

describe("Ready on Home", () => {
  // The finished video is greeted with what a person does with one: watch it, download it.
  it("offers Watch and Download video on each finished video, with what it made and when", async () => {
    renderRouted(<ReadyList ready={[ready("p1", "Rope Tricks")]} primary />, testDeps({}));
    await screen.findByRole("link", { name: "Rope Tricks" });
    const item = row("Rope Tricks");
    expect(within(item).getByText("Ready to upload")).not.toBeNull();
    expect(
      within(item).getByText(/^3:05 · 16:9 · video \+ 2 shorts \+ PDF · finished /),
    ).not.toBeNull();
    const watch = within(item).getByRole("link", { name: "Watch" });
    expect(watch.getAttribute("href")).toBe("/projects/p1?section=video");
    expect(watch.className).toContain("sl-btn--primary");
    const download = within(item).getByRole("link", { name: "Download video" });
    expect(download.getAttribute("href")).toMatch(/\/files\/p1\/video$/);
    expect(download.hasAttribute("download")).toBe(true);
    // No upload chores beside the video.
    expect(within(item).queryByRole("button", { name: /Mark uploaded|Prepare upload/ })).toBeNull();
  });

  // One verdict for a video that lost a step: the project page's own word, the step named, and
  // the way to it.
  it("says Done with problems on a video that lost a step, names it and links to it", async () => {
    renderRouted(
      <ReadyList
        ready={[ready("p2", "Knots", { status: "partial", failedSteps: ["document"] })]}
        primary={false}
      />,
      testDeps({}),
    );
    await screen.findByRole("link", { name: "Knots" });
    const item = row("Knots");
    expect(within(item).getByText("Done with problems")).not.toBeNull();
    expect(within(item).getByText("PDF failed")).not.toBeNull();
    expect(within(item).getByRole("link", { name: "See what failed" }).getAttribute("href")).toBe(
      "/projects/p2?section=document",
    );
    expect(within(item).getByRole("link", { name: "Watch" }).className).not.toContain(
      "sl-btn--primary",
    );
  });

  it("shows a sample as a sample, with Watch only", async () => {
    renderRouted(
      <ReadyList
        title="Finished samples"
        ready={[ready("s1", "The Library of Alexandria", { sample: true })]}
        primary={false}
      />,
      testDeps({}),
    );
    const section = await screen.findByRole("region", { name: "Finished samples" });
    const item = row("The Library of Alexandria");
    expect(within(item).getByText("Sample")).not.toBeNull();
    expect(within(item).getByRole("link", { name: "Watch" })).not.toBeNull();
    expect(within(section).queryByRole("link", { name: "Download video" })).toBeNull();
  });

  it("shows six and links to the rest", async () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      ready(`p${String(index)}`, `Video ${String(index)}`),
    );
    renderRouted(
      <ReadyList
        ready={many}
        primary
        more={<TextLink to="/projects">See all 8 ready to upload</TextLink>}
      />,
      testDeps({}),
    );
    await screen.findByRole("link", { name: "Video 0" });
    expect(screen.getAllByRole("link", { name: "Watch" })).toHaveLength(6);
    expect(screen.getByRole("link", { name: "See all 8 ready to upload" })).not.toBeNull();
  });
});

describe("the finished line", () => {
  it("says the length, the shape, what was made and when it finished", () => {
    const now = new Date("2026-09-30T12:00:00.000Z");
    expect(lengthWords(185)).toBe("3:05");
    expect(lengthWords(3730)).toBe("1:02:10");
    expect(madeWords({ video: true, shorts: 1, pdf: false, audio: true })).toBe(
      "video + 1 short + audio",
    );
    expect(madeWords({ video: false, shorts: 0, pdf: false, audio: false })).toBeUndefined();
    expect(finishedLine(ready("p1", "Rope Tricks"), now)).toMatch(
      /^3:05 · 16:9 · video \+ 2 shorts \+ PDF · finished \S+/,
    );
    // Nothing known yet but its shape.
    expect(finishedLine({ format: "9:16" }, now)).toBe("9:16");
  });
});
