import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultVoicesSettings } from "@app/slices/voices/model.js";
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

// What wears the lime: primary buttons and keys, and a player's big play key unless the player
// is a quiet one (the shorts'). The video's own player is the one exception the design keeps.
function lime(): readonly string[] {
  return [
    ...shown(".sl-btn--primary, .sl-key").map((one) => one.textContent?.trim() ?? ""),
    ...shown(".sl-player:not(.sl-player--quiet) .sl-player__big")
      .filter((key) => key.closest('section[aria-label="Video"]') === null)
      .map((key) => key.getAttribute("aria-label") ?? ""),
  ];
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
      expect({ name, primaries: lime() }).toEqual({ name, primaries: ["Download video (.mp4)"] });
    }
  });

  it("give the lime to the video's download in the title row, once, with Copy for YouTube Studio beside the video", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(made) }),
    );
    await openProjectSection("Video");
    const video = await screen.findByRole("region", { name: "Video" });
    await within(video).findAllByRole("button", { name: "Open folder" });
    expect(shown(".sl-btn--primary, .sl-key").map((one) => one.textContent?.trim())).toEqual([
      "Download video (.mp4)",
    ]);
    // One download for one file on one screen: the section does not repeat the title row's.
    const downloads = screen.getAllByRole("link", { name: "Download video (.mp4)" });
    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.getAttribute("href")).toMatch(/\/files\/p1\/video$/);
    expect(within(video).getByRole("button", { name: "Copy for YouTube Studio" })).not.toBeNull();
  });

  it("give an audiobook's title row its own file, and the section the video beside it", async () => {
    const book = body({
      status: "done",
      stages: finished.stages,
      outputs: [
        ...finished.outputs,
        output("audio_m4b", "video", { id: "o-m4b", path: "audiobook.m4b" }),
        output("audio_mp3", "video", { id: "o-mp3", path: "narration.mp3" }),
      ],
    });
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer({
          ...book,
          project: {
            ...book.project,
            config: { ...book.project.config, voices: defaultVoicesSettings("audiobook") },
          },
        }),
      }),
    );
    await openProjectSection("Audiobook");
    const section = await screen.findByRole("region", { name: "Audiobook" });
    await within(section).findAllByRole("button", { name: "Open folder" });
    // The listening file leads, from the title row, once; the video is the section's.
    expect(shown(".sl-btn--primary, .sl-key").map((one) => one.textContent?.trim())).toEqual([
      "Download audiobook (.m4b)",
    ]);
    const leads = screen.getAllByRole("link", { name: "Download audiobook (.m4b)" });
    expect(leads).toHaveLength(1);
    expect(leads[0]?.getAttribute("href")).toMatch(/\/files\/p1\/audio-m4b$/);
    expect(within(section).getByRole("link", { name: "Download video (.mp4)" })).not.toBeNull();
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

  it("keep Pause out of lime while the run is making things: nothing waits on the person", async () => {
    const running = body({
      status: "running",
      stages: [stage("article", "done"), stage("audio", "running"), stage("video", "pending")],
      outputs: [output("article_md", "article")],
    });
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(running) }),
    );
    const pause = await screen.findByRole("button", { name: "Pause" });
    expect(pause.className).not.toContain("sl-btn--primary");
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

describe("the players' play keys", () => {
  // jsdom applies no style sheet, so the colours are read where they are set.
  const css = readFileSync(join(import.meta.dirname, "../styles/kit.css"), "utf8");
  const block = (selector: string) => {
    const at = css.indexOf(`${selector} {`);
    return at === -1 ? "" : css.slice(at, css.indexOf("}", at));
  };

  it("are light, not lime, for a narration and for a grid of shorts", () => {
    expect(block(".sl-audio .sl-audio__key.sl-btn")).toContain("background: var(--player-ink)");
    expect(css).toMatch(
      /\.sl-player--quiet \.sl-player__big\.sl-btn,[^{]*\{\s*background: var\(--player-ink\)/u,
    );
  });
});
