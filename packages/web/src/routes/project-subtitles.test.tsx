import { defaultSubtitles, type SubtitleConfig } from "@app/slices/subtitles/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  downloadItem,
  jsonAnswer,
  openEditSection,
  openProjectEditor,
  openProjectSection,
  renderRouted,
  testOrigin,
} from "@/test-app";
import { ProjectRoute } from "./project";
import { body, deps, output, stage } from "./project-fixtures";
import { revisionRouteFixture } from "./project-revision.fake.js";

const fonts = [
  { id: "default", name: "Default font", family: "Arial", source: "bundled" },
  { id: "custom", name: "Custom font", family: "Custom", source: "uploaded" },
];
const fontRoute = { "GET /api/fonts": jsonAnswer({ fonts }) };
afterEach(cleanup);

function project(
  subtitles: SubtitleConfig = defaultSubtitles,
  status: "done" | "paused" | "running" = "done",
) {
  const value = body({
    status,
    stages: [
      stage("article", "done"),
      stage("audio", "done"),
      stage("video", status === "running" ? "running" : "done"),
    ],
    outputs: [
      output("video", "video"),
      output("audio_body", "audio"),
      output("subtitles_srt", "video"),
      output("subtitles_vtt", "video"),
    ],
  });
  return {
    ...value,
    project: { ...value.project, config: { ...value.project.config, subtitles } },
  };
}

function subtitleMode() {
  return screen.getByLabelText("Captions", { selector: "select" }) as HTMLSelectElement;
}

describe("existing project subtitles", () => {
  it("saves subtitle style with the revision and shows it in the settings opened again", async () => {
    const user = userEvent.setup();
    const fixture = revisionRouteFixture(project());
    renderRouted(<ProjectRoute projectId="p1" />, deps({ ...fixture.routes, ...fontRoute }));
    await openProjectEditor();
    await openEditSection("Captions");
    await screen.findByLabelText("Captions", { selector: "select" });
    await user.selectOptions(subtitleMode(), "burn-in");
    await screen.findByRole("option", { name: "Custom font · uploaded" });
    await user.selectOptions(screen.getByLabelText("Caption font"), "custom");
    await user.clear(screen.getByLabelText("Caption size"));
    await user.type(screen.getByLabelText("Caption size"), "64");
    await user.selectOptions(screen.getByLabelText("Caption position"), "upper-middle");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    // The settings open again on the version just saved, still at Captions.
    await screen.findByText("Saved as a new version. Nothing is made again until you choose to.");
    expect(fixture.save).toHaveBeenCalledOnce();
    expect(fixture.start).not.toHaveBeenCalled();
    expect(fixture.view().revision.config.subtitles).toEqual({
      ...defaultSubtitles,
      mode: "burn-in",
      fontId: "custom",
      fontSize: 64,
      position: "upper-middle",
    });
    expect(((await screen.findByLabelText("Caption size")) as HTMLInputElement).value).toBe("64");
    expect((screen.getByLabelText("Caption position") as HTMLSelectElement).value).toBe(
      "upper-middle",
    );
    expect(screen.queryByRole("button", { name: "Save subtitles" })).toBeNull();
    // ceiling: opens the editor, saves and waits for it to open again; alone 0.8 s, it timed
    // out once under a loaded full suite.
  }, 20_000);

  it("keeps refused subtitle edits and maps the server field path", async () => {
    const user = userEvent.setup();
    const fixture = revisionRouteFixture(project());
    const refusal = jsonAnswer(
      {
        title: "Invalid edit",
        status: 400,
        reason: "invalid-edit",
        fields: [
          { field: "edit.config.subtitles.fontSize", message: "Use a size from 16 to 120." },
        ],
      },
      400,
    );
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ ...fixture.routes, ...fontRoute, "POST /api/projects/p1/revisions": refusal }),
    );
    await openProjectEditor();
    await openEditSection("Captions");
    await screen.findByLabelText("Captions", { selector: "select" });
    await user.selectOptions(subtitleMode(), "files");
    await user.clear(screen.getByLabelText("Caption size"));
    await user.type(screen.getByLabelText("Caption size"), "64");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    // In the list above the settings, and under the field the server's path names.
    expect(await screen.findAllByText("Use a size from 16 to 120.")).toHaveLength(2);
    expect((screen.getByLabelText("Caption size") as HTMLInputElement).value).toBe("64");
    expect(fixture.start).not.toHaveBeenCalled();
  });

  it("allows saving a future subtitle revision while old rendering is active", async () => {
    const user = userEvent.setup();
    const fixture = revisionRouteFixture(
      project({ ...defaultSubtitles, mode: "files" }, "running"),
    );
    renderRouted(<ProjectRoute projectId="p1" />, deps({ ...fixture.routes, ...fontRoute }));
    await openProjectEditor();
    await openEditSection("Captions");
    await screen.findByLabelText("Captions", { selector: "select" });
    expect(subtitleMode().closest("fieldset")?.disabled).toBe(false);
    await user.selectOptions(subtitleMode(), "off");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fixture.save).toHaveBeenCalledOnce());
    expect(fixture.start).not.toHaveBeenCalled();
  });
});

describe("subtitle downloads and playback", () => {
  // The Video section names one captions file in words (the .srt YouTube Studio takes); the
  // .vtt is in All files with every other file.
  it("offers SRT/VTT downloads and a native English track in files mode", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        ...fontRoute,
        "GET /api/projects/p1": jsonAnswer(project({ ...defaultSubtitles, mode: "files" })),
      }),
    );
    const video = await screen.findByLabelText("Generated video");
    expect(video.querySelector("track")?.getAttribute("src")).toBe(
      `${testOrigin}/files/p1/subtitles-vtt`,
    );
    expect(video.querySelector("track")?.getAttribute("srclang")).toBe("en");
    expect((await downloadItem("Captions (.srt)")).getAttribute("href")).toBe(
      `${testOrigin}/files/p1/subtitles-srt`,
    );
    expect(screen.getByRole("link", { name: "Download captions (.srt)" }).textContent).toBe(
      "Download captions (.srt)",
    );
    await openProjectSection("All files");
    const files = await screen.findByRole("region", { name: "All files" });
    const captions = await within(files).findAllByRole("link", { name: /^Captions/ });
    expect(captions.map((link) => link.getAttribute("href"))).toContain(
      `${testOrigin}/files/p1/subtitles-vtt`,
    );
  });

  it.each(["done", "failed"] as const)(
    "avoids duplicate captions on a previous burned video while a files-mode replacement is %s",
    async (state) => {
      const current = project({ ...defaultSubtitles, mode: "files" });
      renderRouted(
        <ProjectRoute projectId="p1" />,
        deps({
          ...fontRoute,
          "GET /api/projects/p1": jsonAnswer({
            ...current,
            stages: [stage("video", state)],
            outputs: [
              ...current.outputs.filter((one) => one.role !== "video"),
              output("video", "video", { meta: { subtitlesMode: "burn-in" } }),
            ],
          }),
        }),
      );
      expect((await screen.findByLabelText("Generated video")).querySelector("track")).toBeNull();
      expect(await downloadItem("Captions (.srt)")).not.toBeNull();
    },
  );

  it("keeps native captions on a completed files-mode video until the burn-in replacement succeeds", async () => {
    const current = project({ ...defaultSubtitles, mode: "burn-in" }, "running");
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        ...fontRoute,
        "GET /api/projects/p1": jsonAnswer({
          ...current,
          outputs: [
            ...current.outputs.filter((one) => one.role !== "video"),
            output("video", "video", { meta: { subtitlesMode: "files" } }),
          ],
        }),
      }),
    );
    expect((await screen.findByLabelText("Generated video")).querySelector("track")).not.toBeNull();
  });

  it("keeps file downloads for WAV exports without mounting a separate subtitle editor", async () => {
    const current = project({ ...defaultSubtitles, mode: "files" });
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        ...fontRoute,
        "GET /api/projects/p1": jsonAnswer({
          ...current,
          project: {
            ...current.project,
            config: {
              ...current.project.config,
              sources: { ...current.project.config.sources, video: "off", images: "off" },
            },
          },
          outputs: [
            ...current.outputs.filter((one) => one.role !== "video"),
            output("audio_export", "video"),
          ],
        }),
      }),
    );
    await screen.findByLabelText("Combined narration");
    expect(await downloadItem("Captions (.srt)")).not.toBeNull();
    expect(screen.queryByLabelText("Captions", { selector: "select" })).toBeNull();
    expect(screen.queryByLabelText("Generated video")).toBeNull();
  });
});

it("shows persisted missing narration notes alongside downloadable subtitles", async () => {
  const current = project({ ...defaultSubtitles, mode: "files" });
  const value = {
    ...current,
    outputs: current.outputs.map((item) =>
      item.role === "video"
        ? {
            ...item,
            meta: {
              ...item.meta,
              subtitleOmissions: [{ start: 161, text: "The missing transcript passage." }],
            },
          }
        : item,
    ),
  };
  renderRouted(
    <ProjectRoute projectId="p1" />,
    deps({ ...fontRoute, "GET /api/projects/p1": jsonAnswer(value) }),
  );
  await userEvent.click(await screen.findByText("Passages left out of the captions"));
  expect(screen.getByText(/The missing transcript passage\./)).not.toBeNull();
  expect(screen.getByRole("button", { name: "Play from 2:41" })).not.toBeNull();
  expect(await downloadItem("Captions (.srt)")).not.toBeNull();
});
