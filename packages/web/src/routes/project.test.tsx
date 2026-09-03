import type { StageKind, StageState } from "@app/kernel/pipeline.js";
import type { Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Answer } from "@/test-app";
import {
  jsonAnswer,
  problemAnswer,
  renderRouted,
  testDeps,
  testOrigin,
  testVersion,
} from "@/test-app";
import { ProjectRoute } from "./project.js";

afterEach(cleanup);

function stage(kind: StageKind, state: StageState, over: Partial<Stage> = {}): Stage {
  return {
    id: `s-${kind}`,
    projectId: "p1",
    kind,
    source: state === "provided" ? "provide" : state === "skipped" ? "off" : "generate",
    state,
    failureReason: null,
    attemptCount: 0,
    progressCurrent: state === "running" ? 1 : null,
    progressTotal: state === "running" ? 4 : null,
    startedAt: null,
    finishedAt: null,
    ...over,
  };
}

function output(role: Output["role"], stageKind: StageKind, over: Partial<Output> = {}): Output {
  return {
    id: `o-${role}-${String(over.meta?.index ?? 0)}`,
    projectId: "p1",
    stageKind,
    role,
    path: `${role}.bin`,
    originalFilename: null,
    bytes: 12,
    durationMs: null,
    meta: {},
    createdAt: "2026-09-03T00:00:00.000Z",
    ...over,
  };
}

function body(options: {
  readonly status: "running" | "done" | "failed" | "canceled";
  readonly stages: readonly Stage[];
  readonly outputs: readonly Output[];
}) {
  return {
    project: {
      id: "p1",
      title: "Rope Tricks",
      format: "16:9",
      status: options.status,
      config: {
        title: "Rope Tricks",
        format: "16:9",
        articlePrompt: "Documentary dossier",
        imagePrompts: [{ name: "Oil painting scenes", number: 2 }],
        sources: {
          research: "generate",
          article: "generate",
          audio: "generate",
          images: "generate",
          thumbnail: "from_prompt",
          video: "generate",
        },
        llm: { provider: "openrouter", model: "m" },
        audio: { provider: "elevenlabs", model: "v3", voice: "narrator-m" },
        images: { provider: "fal", model: "flux" },
        chunking: { mode: "words", words: 500 },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    stages: options.stages,
    outputs: options.outputs,
  };
}

const twoImages = [
  output("image", "images", { meta: { promptName: "Oil painting scenes", index: 1 } }),
  output("image", "images", { meta: { promptName: "Oil painting scenes", index: 2 } }),
];

const finished = body({
  status: "done",
  stages: [
    stage("research", "skipped"),
    stage("article", "done"),
    stage("audio", "done"),
    stage("images", "done"),
    stage("thumbnail", "done"),
    stage("video", "done"),
  ],
  outputs: [
    output("article_md", "article"),
    output("sources", "article"),
    output("glossary", "article"),
    output("audio_intro", "audio", { durationMs: 7000 }),
    output("audio_body", "audio", { durationMs: 60_000 }),
    output("audio_outro", "audio", { durationMs: 5000 }),
    ...twoImages,
    output("thumbnail", "thumbnail", { meta: { prompt: "A cracked skull with gemstone eyes" } }),
    output("video", "video", { durationMs: 72_000 }),
  ],
});

const ready = [
  {
    id: "openrouter",
    family: "llm",
    displayName: "OpenRouter",
    readiness: { kind: "keyed", hasKey: true },
  },
  {
    id: "elevenlabs",
    family: "tts",
    displayName: "ElevenLabs",
    readiness: { kind: "keyed", hasKey: true },
  },
  { id: "fal", family: "image", displayName: "fal.ai", readiness: { kind: "keyed", hasKey: true } },
];

function deps(routes: Readonly<Record<string, Answer>> = {}) {
  return testDeps({
    "GET /api/projects/p1": jsonAnswer(finished),
    "GET /api/providers": jsonAnswer({ providers: ready }),
    "GET /api/prompts": jsonAnswer({
      prompts: [{ id: "t1", kind: "article", name: "Documentary dossier", body: "b" }],
    }),
    "GET /api/settings/voices": jsonAnswer({
      voices: [{ id: "v1", provider: "elevenlabs", name: "Narrator M", voiceId: "narrator-m" }],
    }),
    "GET /files/p1/article-md": textAnswer("# The Archlich\n\nMost villains want something."),
    "GET /files/p1/notes": textAnswer("Chapter 1 of 7."),
    ...routes,
  });
}

function textAnswer(text: string): Answer {
  return () =>
    new Response(text, {
      status: 200,
      headers: { "content-type": "text/plain", "X-Slopify-Version": testVersion },
    });
}

describe("the project rundown", () => {
  it("shows a skeleton in the final shape while the project is coming", async () => {
    const { container } = renderRouted(<ProjectRoute projectId="p1" />, testDeps({}));
    await waitFor(() => {
      expect(container.querySelectorAll(".rounded-full").length).toBe(6);
    });
  });

  it("names the problem when the project cannot be read", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": problemAnswer("No project has that id.", 404) }),
    );
    expect(await screen.findByText("No project has that id.")).not.toBeNull();
  });

  it("gives every stage a lamp, a state word and a live announcement", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    await screen.findByText("Research");
    const announced = screen.getAllByRole("status").map((live) => live.textContent);
    expect(announced).toContain("Video: done");
    expect(announced).toContain("Research: skipped");
  });

  it("carries a back link to the projects list", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    const back = await screen.findByText("< Projects");
    expect(back.getAttribute("href")).toBe("/");
  });
});

describe("a failed stage", () => {
  const verbatim = "fal.ai: 429 Too Many Requests after 4 attempts (2s, 8s, 30s, Retry-After 45s)";
  const failed = body({
    status: "failed",
    stages: [
      stage("research", "skipped"),
      stage("article", "done"),
      stage("audio", "done"),
      stage("images", "failed", { failureReason: verbatim, attemptCount: 4 }),
      stage("thumbnail", "done"),
      stage("video", "pending"),
    ],
    outputs: [output("article_md", "article")],
  });

  it("shows the provider's own words, unaltered, with the attempt count and a Retry", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(failed) }),
    );

    const line = await screen.findByText(verbatim);
    // Verbatim: the whole sentence is one text node, neither truncated nor rewritten.
    expect(line.textContent).toBe(verbatim);
    const row = line.closest("div");
    expect(within(row as HTMLElement).getByText("4 attempts")).not.toBeNull();
    expect(within(row as HTMLElement).getByRole("button", { name: "Retry stage" })).not.toBeNull();
  });

  it("retries the failed stage without a dialog, because a retry destroys nothing", async () => {
    const retried = vi.fn();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(failed),
        "POST /api/projects/p1/stages/images/retry": (request) => {
          retried();
          return jsonAnswer({ ...failed, redone: ["images"] })(request);
        },
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Retry stage" }));
    await waitFor(() => {
      expect(retried).toHaveBeenCalledTimes(1);
    });
  });

  it("disables Retry and names the missing key when the provider has none", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(failed),
        "GET /api/providers": jsonAnswer({
          providers: [{ ...ready[2], readiness: { kind: "keyed", hasKey: false } }],
        }),
      }),
    );

    const control = await screen.findByRole("button", { name: "Key missing" });
    expect(control.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("link", { name: "Open Settings" })).not.toBeNull();
  });
});

describe("cancelling a run", () => {
  const running = body({
    status: "running",
    stages: [
      stage("research", "skipped"),
      stage("article", "done"),
      stage("audio", "running"),
      stage("images", "pending"),
      stage("thumbnail", "pending"),
      stage("video", "pending"),
    ],
    outputs: [output("article_md", "article")],
  });

  it("asks with the design's own copy before it stops anything", async () => {
    const canceled = vi.fn();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(running),
        "POST /api/projects/p1/cancel": (request) => {
          canceled();
          return jsonAnswer(running)(request);
        },
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Cancel run" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Cancel this run?")).not.toBeNull();
    expect(
      within(dialog).getByText("Stops every running stage; finished outputs are kept."),
    ).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Keep running" })).not.toBeNull();
    // Nothing has been stopped by opening the dialog.
    expect(canceled).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel run" }));
    await waitFor(() => {
      expect(canceled).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the run when the dialog is dismissed, and closes on Escape", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(running) }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Cancel run" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep running" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Cancel run" }));
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("offers no Cancel once the run is over", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    await screen.findByText("Research");
    expect(screen.queryByRole("button", { name: "Cancel run" })).toBeNull();
  });

  it("disables every edit and re-run while a stage is running", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(running) }),
    );
    const edit = await screen.findByRole("button", { name: "Edit" });
    expect(edit.hasAttribute("disabled")).toBe(true);
  });
});

describe("the stage bodies", () => {
  it("plays the three narration segments and offers each for download", async () => {
    const { container } = renderRouted(<ProjectRoute projectId="p1" />, deps());
    await screen.findByText("Audio");

    const players = [...container.querySelectorAll("audio")];
    expect(players.map((player) => player.getAttribute("src"))).toEqual([
      `${testOrigin}/files/p1/audio-intro`,
      `${testOrigin}/files/p1/audio-body`,
      `${testOrigin}/files/p1/audio-outro`,
    ]);
    expect(screen.getByLabelText("Body narration")).not.toBeNull();
    expect(await screen.findByText("Narrator M")).not.toBeNull();
    expect(screen.getByText("Chunking: every 500 words")).not.toBeNull();
  });

  it("draws the image grid from the run's own prompt groups", async () => {
    const { container } = renderRouted(<ProjectRoute projectId="p1" />, deps());
    await screen.findByText("Images");

    expect(screen.getByText("Oil painting scenes × 2")).not.toBeNull();
    const tiles = [...container.querySelectorAll("figure img")];
    expect(tiles.map((tile) => tile.getAttribute("src"))).toEqual([
      `${testOrigin}/files/p1/image-1`,
      `${testOrigin}/files/p1/image-2`,
    ]);
    expect(screen.getByRole("link", { name: "Download all" }).getAttribute("href")).toBe(
      `${testOrigin}/files/p1/images.zip`,
    );
  });

  it("plays the video and offers the mp4", async () => {
    const { container } = renderRouted(<ProjectRoute projectId="p1" />, deps());
    await screen.findByText("Video");

    expect(container.querySelector("video")?.getAttribute("src")).toBe(
      `${testOrigin}/files/p1/video`,
    );
    const download = screen.getByRole("link", { name: "Download .mp4" });
    expect(download.getAttribute("href")).toBe(`${testOrigin}/files/p1/video`);
    expect(download.hasAttribute("download")).toBe(true);
  });

  it("renders the article and links its end matter beside the title", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    expect(await screen.findByText("Most villains want something.")).not.toBeNull();
    expect(screen.getByText("The Archlich")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Sources" }).getAttribute("href")).toBe(
      `${testOrigin}/files/p1/sources`,
    );
    expect(screen.getByRole("link", { name: "Glossary" }).getAttribute("href")).toBe(
      `${testOrigin}/files/p1/glossary`,
    );
  });

  it("shows the thumbnail with the prompt that made it", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    await screen.findByText("Thumbnail");
    expect(screen.getByText("A cracked skull with gemstone eyes")).not.toBeNull();
  });

  it("keeps a pending stage collapsed", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(
          body({
            status: "running",
            stages: [stage("video", "pending")],
            outputs: [output("video", "video")],
          }),
        ),
      }),
    );
    await screen.findByText("Video");
    expect(screen.queryByRole("button", { name: "Re-render" })).toBeNull();
  });
});

describe("the destructive actions", () => {
  it("confirms before deleting an image, and says what the deletion costs", async () => {
    const deleted = vi.fn();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "DELETE /api/projects/p1/images/o-image-1": (request) => {
          deleted();
          return jsonAnswer(finished)(request);
        },
      }),
    );

    await screen.findByText("Images");
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete this image?")).not.toBeNull();
    expect(
      within(dialog).getByText("Removed from the slideshow; the video re-renders."),
    ).not.toBeNull();
    expect(deleted).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(deleted).toHaveBeenCalledTimes(1);
    });
  });

  it("shows the server's own refusal when the last image cannot go", async () => {
    const refusal = "At least one image must remain, so the last one cannot be deleted.";
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "DELETE /api/projects/p1/images/o-image-1": problemAnswer(refusal, 409) }),
    );

    await screen.findByText("Images");
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0] as HTMLElement);
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );

    const said = await screen.findByRole("alert");
    expect(said.textContent).toBe(refusal);
  });

  it("confirms before regenerating an image", async () => {
    const made = vi.fn();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "POST /api/projects/p1/images/o-image-1/regenerate": (request) => {
          made();
          return jsonAnswer(finished)(request);
        },
      }),
    );

    await screen.findByText("Images");
    await userEvent.click(screen.getAllByRole("button", { name: "Regenerate" })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Regenerate this image?")).not.toBeNull();
    expect(made).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Regenerate" }));
    await waitFor(() => {
      expect(made).toHaveBeenCalledTimes(1);
    });
  });

  it("confirms before re-running a stage", async () => {
    const rerun = vi.fn();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "POST /api/projects/p1/stages/video/rerun": (request) => {
          rerun();
          return jsonAnswer(finished)(request);
        },
      }),
    );

    await screen.findByText("Video");
    await userEvent.click(screen.getByRole("button", { name: "Re-render" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Replaces the video with a fresh render.")).not.toBeNull();
    expect(rerun).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Re-run" }));
    await waitFor(() => {
      expect(rerun).toHaveBeenCalledTimes(1);
    });
  });
});

describe("editing the article", () => {
  it("confirms the save and sends the edited markdown", async () => {
    let sent = "";
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "PUT /api/projects/p1/article": async (request) => {
          sent = ((await request.json()) as { markdown: string }).markdown;
          return jsonAnswer(finished)(request);
        },
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const editor = await screen.findByLabelText("Article");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Rewritten.");

    await userEvent.click(screen.getByRole("button", { name: "Save & re-run from audio" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Save the edited article?")).not.toBeNull();
    expect(sent).toBe("");

    await userEvent.click(within(dialog).getByRole("button", { name: "Save & re-run from audio" }));
    await waitFor(() => {
      expect(sent).toBe("Rewritten.");
    });
  });

  it("keeps the typing in the editor when the server refuses the save", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "PUT /api/projects/p1/article": problemAnswer("An article cannot be saved empty.", 400),
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const editor = await screen.findByLabelText("Article");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Still mine.");
    await userEvent.click(screen.getByRole("button", { name: "Save & re-run from audio" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Save & re-run from audio",
      }),
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "An article cannot be saved empty.",
    );
    expect((screen.getByLabelText("Article") as HTMLTextAreaElement).value).toBe("Still mine.");
  });

  it("confirms a discard before it throws the typing away", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.type(await screen.findByLabelText("Article"), " and mine");
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Discard these edits?")).not.toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Article")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Discard" }),
    );
    await waitFor(() => {
      expect(screen.queryByLabelText("Article")).toBeNull();
    });
  });
});
