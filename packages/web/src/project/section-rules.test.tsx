import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectRoute } from "@/routes/project";
import { body, deps, finished, output, stage } from "@/routes/project-fixtures";
import { jsonAnswer, openProjectSection, renderRouted } from "@/test-app";

// Two of the page's rules, checked as a person meets them: on the sections the page composes
// (Video, Shorts, Images and its thumbnail), not file by file. Each open section shows at most
// one Open folder, and the whole page at most one lime button, its next action.

afterEach(cleanup);

// Everything a finished video can make: shorts, the YouTube text and a PDF beside the rest.
const everything = body({
  status: "done",
  stages: [...finished.stages.filter((one) => one.kind !== "document"), stage("document", "done")],
  outputs: [
    ...finished.outputs,
    output("subtitles_srt", "video"),
    output("subtitles_vtt", "video"),
    output("youtube_description", "video"),
    output("youtube_tags", "video"),
    output("short_video", "video", { id: "o-short-1", meta: { short: 1 } }),
    output("short_video", "video", { id: "o-short-2", meta: { short: 2 } }),
    output("document_pdf", "document"),
  ],
});
const made = {
  ...everything,
  project: {
    ...everything.project,
    config: {
      ...everything.project.config,
      youtubeDescription: true,
      shorts: { enabled: true, count: 2, minSeconds: 30, maxSeconds: 60 },
    },
  },
};

function shown(selector: string): readonly Element[] {
  return [...document.querySelectorAll(selector)].filter(
    (element) => element.closest("[hidden]") === null,
  );
}

describe("a finished project's sections", () => {
  it("show at most one Open folder each, and the page one lime button", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(made) }),
    );
    for (const name of ["Video", "Shorts", "Images", "Narration", "Article", "PDF"]) {
      await openProjectSection(name);
      const section = await screen.findByRole("region", { name });
      // Wait for the section's files, then count what the person sees in it.
      await within(section).findAllByRole("button", { name: "Open folder" });
      expect({
        name,
        folders: within(section).getAllByRole("button", { name: "Open folder" }).length,
      }).toEqual({ name, folders: 1 });
      // The next action, the video's download, is the one lime button; every section's own
      // download is secondary.
      expect({
        name,
        primaries: shown(".sl-btn--primary, .sl-key").map((one) => one.textContent?.trim()),
      }).toEqual({ name, primaries: ["Download video"] });
    }
  });

  it("give the lime to the video's download in the title row, with Copy for YouTube Studio beside the video", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(made) }),
    );
    await openProjectSection("Video");
    const video = await screen.findByRole("region", { name: "Video" });
    await within(video).findByRole("link", { name: "Download video (.mp4)" });
    expect(shown(".sl-btn--primary, .sl-key").map((one) => one.textContent?.trim())).toEqual([
      "Download video",
    ]);
    expect(screen.getByRole("link", { name: "Download video" }).getAttribute("href")).toMatch(
      /\/files\/p1\/video$/,
    );
    expect(within(video).getByRole("button", { name: "Copy for YouTube Studio" })).not.toBeNull();
  });

  it("give the lime to a section's download when the page has no next action", async () => {
    // A finished PDF with no video: nothing waits on the person.
    const pdf = body({
      status: "done",
      stages: [stage("article", "done"), stage("document", "done")],
      outputs: [output("article_md", "article"), output("document_pdf", "document")],
    });
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(pdf) }),
    );
    await openProjectSection("PDF");
    await screen.findByRole("region", { name: "PDF" });
    await waitFor(() =>
      expect(shown(".sl-btn--primary, .sl-key").map((one) => one.textContent?.trim())).toEqual([
        "Download PDF",
      ]),
    );
  });

  it("keep one lime button on a paused project", async () => {
    const paused = body({
      status: "paused",
      stages: [stage("article", "done"), stage("audio", "pending"), stage("video", "pending")],
      outputs: [output("article_md", "article")],
    });
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(paused) }),
    );
    await openProjectSection("Article");
    await screen.findByRole("region", { name: "Article" });
    expect(shown(".sl-btn--primary, .sl-key").length).toBeLessThanOrEqual(1);
  });
});
