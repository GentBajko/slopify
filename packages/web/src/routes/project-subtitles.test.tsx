import {
  defaultSubtitles,
  type SubtitleConfig,
  subtitleConfigSchema,
} from "@app/slices/subtitles/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderRouted, testOrigin } from "@/test-app";
import { ProjectRoute } from "./project";
import { body, deps, output, stage } from "./project-fixtures";

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
  return screen.getByLabelText("Subtitles", { selector: "select" }) as HTMLSelectElement;
}

describe("existing project subtitles", () => {
  it("saves only subtitle settings and keeps the returned font selection after refresh", async () => {
    const user = userEvent.setup();
    let current = project();
    const save = vi.fn(async (request: Request) => {
      const subtitles = (await request.json()) as SubtitleConfig;
      current = {
        ...current,
        project: { ...current.project, config: { ...current.project.config, subtitles } },
      };
      return jsonAnswer(current)(request);
    });
    const app = deps({
      ...fontRoute,
      "GET /api/projects/p1": (request) => jsonAnswer(current)(request),
      "PATCH /api/projects/p1/subtitles": save,
    });
    const mounted = renderRouted(<ProjectRoute projectId="p1" />, app);
    await screen.findByRole("heading", { name: "Rope Tricks" });
    await user.selectOptions(subtitleMode(), "burn-in");
    await screen.findByRole("option", { name: "Custom font · uploaded" });
    await user.selectOptions(screen.getByLabelText("Subtitle font"), "custom");
    const size = screen.getByLabelText("Subtitle font size");
    await user.clear(size);
    await user.type(size, "64");
    await user.selectOptions(screen.getByLabelText("Subtitle position"), "upper-middle");
    await user.click(screen.getByRole("button", { name: "Save subtitles" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Save subtitles" }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    expect(current.project.config.subtitles).toEqual({
      ...defaultSubtitles,
      mode: "burn-in",
      fontId: "custom",
      fontSize: 64,
      position: "upper-middle",
    });
    mounted.unmount();
    renderRouted(<ProjectRoute projectId="p1" />, app);
    await screen.findByLabelText("Subtitle font");
    expect(subtitleMode().value).toBe("burn-in");
    expect((screen.getByLabelText("Subtitle font") as HTMLSelectElement).value).toBe("custom");
    expect((screen.getByLabelText("Subtitle font size") as HTMLInputElement).value).toBe("64");
    expect((screen.getByLabelText("Subtitle position") as HTMLSelectElement).value).toBe(
      "upper-middle",
    );
  });

  it("holds Resume while subtitle edits are unsaved, and saves separately on paused projects", async () => {
    const user = userEvent.setup();
    let current = project(defaultSubtitles, "paused");
    const resume = vi.fn(jsonAnswer(current));
    const save = vi.fn(async (request: Request) => {
      const subtitles = (await request.json()) as SubtitleConfig;
      current = {
        ...current,
        project: { ...current.project, config: { ...current.project.config, subtitles } },
      };
      return jsonAnswer(current)(request);
    });
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        ...fontRoute,
        "GET /api/projects/p1": (request) => jsonAnswer(current)(request),
        "PATCH /api/projects/p1/subtitles": save,
        "POST /api/projects/p1/resume": resume,
      }),
    );
    await screen.findByRole("button", { name: "Resume" });
    await user.selectOptions(subtitleMode(), "files");
    expect((screen.getByRole("button", { name: "Resume" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.click(screen.getByRole("button", { name: "Discard subtitle changes" }));
    expect(subtitleMode().value).toBe("off");
    expect((screen.getByRole("button", { name: "Resume" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    await user.selectOptions(subtitleMode(), "files");
    await user.click(screen.getByRole("button", { name: "Save subtitles" }));
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Resume" }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(resume).not.toHaveBeenCalled();
  });

  it("keeps refused changes for correction and never enables Save for an invalid font size", async () => {
    const user = userEvent.setup();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        ...fontRoute,
        "GET /api/projects/p1": jsonAnswer(project()),
        "PATCH /api/projects/p1/subtitles": problemAnswer("Pause the active run first.", 409),
      }),
    );
    await screen.findByRole("button", { name: "Save subtitles" });
    await user.selectOptions(subtitleMode(), "files");
    const size = screen.getByLabelText("Subtitle font size");
    await user.clear(size);
    await user.type(size, "150");
    expect(
      (screen.getByRole("button", { name: "Save subtitles" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.clear(size);
    await user.type(size, "64");
    await user.click(screen.getByRole("button", { name: "Save subtitles" }));
    await screen.findByText("Pause the active run first.");
    expect(subtitleMode().value).toBe("files");
    expect((size as HTMLInputElement).value).toBe("64");
  });

  it.each(["", "150"])(
    "can disable subtitles after entering an invalid font size '%s'",
    async (size) => {
      const user = userEvent.setup();
      let current = project({ ...defaultSubtitles, mode: "files" }, "paused");
      const save = vi.fn(async (request: Request) => {
        const subtitles = subtitleConfigSchema.parse(await request.json());
        current = {
          ...current,
          project: { ...current.project, config: { ...current.project.config, subtitles } },
        };
        return jsonAnswer(current)(request);
      });
      renderRouted(
        <ProjectRoute projectId="p1" />,
        deps({
          ...fontRoute,
          "GET /api/projects/p1": (request) => jsonAnswer(current)(request),
          "PATCH /api/projects/p1/subtitles": save,
        }),
      );
      await screen.findByLabelText("Subtitle font size");
      await user.clear(screen.getByLabelText("Subtitle font size"));
      if (size) await user.type(screen.getByLabelText("Subtitle font size"), size);
      await user.selectOptions(subtitleMode(), "off");
      expect(screen.queryByLabelText("Subtitle font size")).toBeNull();
      await user.click(screen.getByRole("button", { name: "Save subtitles" }));
      await waitFor(() =>
        expect((screen.getByRole("button", { name: "Resume" }) as HTMLButtonElement).disabled).toBe(
          false,
        ),
      );
      expect(save).toHaveBeenCalledTimes(1);
      expect(current.project.config.subtitles).toMatchObject({ mode: "off", fontSize: 48 });
    },
  );

  it("disables editing while any stage is active", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        ...fontRoute,
        "GET /api/projects/p1": jsonAnswer(
          project({ ...defaultSubtitles, mode: "files" }, "running"),
        ),
      }),
    );
    await screen.findByLabelText("Subtitle font");
    expect(subtitleMode().closest("fieldset")?.disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Save subtitles" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/Pause the run and wait for active requests/)).not.toBeNull();
  });
});

describe("subtitle downloads and playback", () => {
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
    expect(screen.getByRole("link", { name: "Download .srt" }).getAttribute("href")).toBe(
      `${testOrigin}/files/p1/subtitles-srt`,
    );
    expect(screen.getByRole("link", { name: "Download .vtt" }).getAttribute("href")).toBe(
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
      expect(screen.getByRole("link", { name: "Download .srt" })).not.toBeNull();
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

  it("keeps file downloads for WAV exports and disables the burn-in option", async () => {
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
    expect(screen.getByRole("link", { name: "Download .srt" })).not.toBeNull();
    expect(
      (screen.getByRole("option", { name: "Burn into video + files" }) as HTMLOptionElement)
        .disabled,
    ).toBe(true);
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
  await screen.findByText(/Subtitles recovered after missing narration/);
  expect(screen.getByText(/The missing transcript passage\./)).not.toBeNull();
  expect(screen.getByText("00:02:41")).not.toBeNull();
  expect(screen.getByRole("link", { name: "Download .srt" })).not.toBeNull();
});
