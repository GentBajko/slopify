import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, testVersion } from "@/test-app";
import { at, fill, guide, mount, next, nextHeld, skipTo, start } from "./test-fixture";

beforeEach(() => {
  // Layout is covered in spotlight tests. Give real page targets a visible box so
  // these tests exercise the controller and real interaction boundaries in happy-dom.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.closest("[hidden]")) return new DOMRect(0, 0, 0, 0);
    return this.dataset.tutorial === "card"
      ? new DOMRect(0, 0, 360, 260)
      : new DOMRect(40, 80, 600, 180);
  });
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the tutorial in the real app", () => {
  it("waits for first-run disclosure before opening Settings, then gates on saved provider readiness", async () => {
    let release: ((response: Response) => void) | undefined;
    const answer = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const user = userEvent.setup();
    const { router, requests } = await mount({ ready: false, notice: () => answer });
    await user.click(screen.getByRole("button", { name: "Start interactive tutorial" }));
    expect(screen.queryByRole("region", { name: "Interactive getting started guide" })).toBeNull();
    expect(router.state.location.pathname).toBe("/");
    await act(async () => {
      release?.(
        await jsonAnswer({ seen: false, appVersion: testVersion })(
          new Request("http://slopify.test"),
        ),
      );
    });
    await screen.findByRole("dialog", { name: "Anonymous usage stats" });
    expect(screen.queryByRole("region", { name: "Interactive getting started guide" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Got it" }));
    await at("text-key");
    expect(router.state.location.pathname).toBe("/settings");
    expect(nextHeld()).toBe(true);
    await user.type(screen.getByLabelText("OpenRouter API key"), "test-only-key");
    expect(nextHeld()).toBe(true);
    expect(guide().getByRole("heading", { name: "1. Connect a text provider" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Save OpenRouter key" }));
    await next(user, "audio-key");
    expect(nextHeld()).toBe(true);
    expect(guide().queryByText(/test-only-key/)).toBeNull();
    expect(
      requests.filter((request) => /^POST \/api\/drafts\/[^/]+\/start$/.test(request)),
    ).toHaveLength(0);
  });

  it("supports Back, skipping unfinished work, exit and restarting from step one", async () => {
    const user = userEvent.setup();
    const { requests } = await mount({ ready: false });
    await start(user);
    await user.click(guide().getByRole("button", { name: "Skip this step" }));
    await at("audio-key");
    await user.click(guide().getByRole("button", { name: "Back" }));
    await at("text-key");
    expect(nextHeld()).toBe(true);
    await user.click(guide().getByRole("button", { name: "Exit guide" }));
    expect(screen.queryByRole("region", { name: "Interactive getting started guide" })).toBeNull();
    await start(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Interactive getting started guide" })).toBeNull();
    expect(requests.some((request) => /\/start$/.test(request))).toBe(false);
  });

  it("waits for a successful article save's normal return, then opens a fresh image editor", async () => {
    const user = userEvent.setup();
    const { router, requests } = await mount();
    await start(user);
    await skipTo(user, "article-name");
    expect(nextHeld()).toBe(true);
    await fill(user, "Name", "Tutorial article");
    await next(user, "article-body");
    await fill(user, "Body", "Write a short article.");
    expect(nextHeld()).toBe(true);
    await fill(user, "Body", "Write a short article about {{topic}}.");
    await next(user, "article-keywords");
    await next(user, "article-save");
    expect(requests).not.toContain("POST /api/prompts");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");
    expect(router.state.location.pathname).toBe("/prompts/new");
    expect(guide().getByRole("heading", { name: "8. Save your article prompt" })).not.toBeNull();
    await waitFor(() => expect(router.state.location.search).toMatchObject({ kind: "image" }), {
      timeout: 4000,
    });
    await at("image-prompt");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Body") as HTMLTextAreaElement).value).toBe("");
    expect(nextHeld()).toBe(true);
    expect(requests.filter((request) => request === "POST /api/prompts")).toHaveLength(1);
    expect(requests).not.toContain("POST /api/projects");
  }, 10000);

  it("keeps a refused save on the same tutorial step and preserves its form", async () => {
    const user = userEvent.setup();
    const { router } = await mount({ refusePrompt: true });
    await start(user);
    await skipTo(user, "article-name");
    await fill(user, "Name", "Taken name");
    await next(user, "article-body");
    await fill(user, "Body", "Write about {{topic}}.");
    await next(user, "article-keywords");
    await next(user, "article-save");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findAllByText("Another prompt already has this name.");
    expect(router.state.location.pathname).toBe("/prompts/new");
    expect(router.state.location.search).toMatchObject({ kind: "article" });
    expect(guide().getByRole("heading", { name: "8. Save your article prompt" })).not.toBeNull();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Taken name");
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("continues to Play when the user saves directly from the highlighted image editor", async () => {
    const user = userEvent.setup();
    const { router, requests } = await mount();
    await start(user);
    await skipTo(user, "image-prompt");
    await fill(user, "Name", "Tutorial images");
    await fill(user, "Body", "An illustration of {{topic}}.");
    // This step highlights the complete image editor, so Save is available before
    // the user presses the guide's Next to reach the separate save explanation.
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");
    expect(nextHeld()).toBe(true);
    expect(guide().queryByRole("button", { name: "Back" })).toBeNull();
    expect(guide().queryByRole("button", { name: /^Skip/ })).toBeNull();
    await user.click(guide().getByRole("button", { name: "Next" }));
    expect(router.state.location.pathname).toBe("/prompts/new");
    await waitFor(() => expect(router.state.location.pathname).toBe("/play"), { timeout: 4000 });
    await at("play-options");
    expect(requests.filter((request) => request === "POST /api/prompts")).toHaveLength(1);
    expect(requests).not.toContain("POST /api/projects");
    await user.click(guide().getByRole("button", { name: "Exit guide" }));
    await act(() => router.navigate({ to: "/prompts/new", search: { kind: "image" } }));
    expect(((await screen.findByLabelText("Name")) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Body") as HTMLTextAreaElement).value).toBe("");
  }, 10000);

  it("gates Play steps on the real form and follows the ID created only by the user's PLAY click", async () => {
    const user = userEvent.setup();
    const { router, requests } = await mount();
    await start(user);
    await skipTo(user, "play-options");
    await fill(user, "Project title", "My first video");
    await user.selectOptions(screen.getByLabelText("LLM"), "claude-code");
    await user.selectOptions(screen.getByLabelText("Text model"), "sonnet");
    await next(user, "play-article");
    expect(nextHeld()).toBe(true);
    await user.selectOptions(screen.getByLabelText("Article prompt"), "My article");
    await next(user, "play-keywords");
    await fill(user, "topic", "Albanian mountains");
    await next(user, "play-audio");
    expect(nextHeld()).toBe(true);
    await user.selectOptions(screen.getByLabelText("TTS"), "elevenlabs");
    await user.selectOptions(screen.getByLabelText("TTS model"), "eleven_multilingual_v2");
    expect(nextHeld()).toBe(true);
    await user.selectOptions(screen.getByLabelText("Voice"), "narrator-1");
    await next(user, "play-images");
    expect(nextHeld()).toBe(true);
    await user.selectOptions(screen.getByLabelText("Provider"), "fal");
    await user.selectOptions(
      within(document.querySelector('[data-tour="play-images"]') as HTMLElement).getByLabelText(
        "Model",
      ),
      "fal-ai/flux-2",
    );
    expect(nextHeld()).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "My images" }));
    await next(user, "play-video");
    await next(user, "play-subtitles");
    await next(user, "play-start");
    expect(requests).not.toContain("POST /api/projects");
    expect(
      String((screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled),
    ).toBe("false");
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    await user.click(await screen.findByRole("button", { name: "Start run" }));
    await at("project");
    expect(router.state.location.pathname).toBe("/projects/actual-created-project");
    expect(
      screen
        .getByRole("navigation", { name: "Project stages" })
        .closest('[data-tour="project-controls"]'),
    ).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Edit" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Run settings/ })).toBeNull();
    expect(
      requests.filter((request) => /^POST \/api\/drafts\/[^/]+\/start$/.test(request)),
    ).toHaveLength(1);
    await next(user, "download");
    await screen.findByRole("region", { name: "Video workspace" });
    expect(
      screen.getByRole("button", { name: "Video, pending" }).getAttribute("aria-current"),
    ).toBe("step");
    expect(screen.queryByRole("region", { name: "Article workspace" })).toBeNull();
    await user.click(guide().getByRole("button", { name: "Finish tutorial" }));
    expect(screen.queryByRole("region", { name: "Interactive getting started guide" })).toBeNull();
    expect(
      requests.filter((request) => /^POST \/api\/drafts\/[^/]+\/start$/.test(request)),
    ).toHaveLength(1);
    await act(() => router.navigate({ to: "/play" }));
    expect(((await screen.findByLabelText("Project title")) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Article prompt") as HTMLSelectElement).value).toBe("");
  }, 10000);

  it("can finish the walkthrough without saving prompts or starting generation", async () => {
    const user = userEvent.setup();
    const { requests, router } = await mount({ ready: false });
    await start(user);
    await skipTo(user, "play-start");
    await user.click(guide().getByRole("button", { name: "Finish without generating" }));
    expect(screen.queryByRole("region", { name: "Interactive getting started guide" })).toBeNull();
    expect(router.state.location.pathname).toBe("/play");
    expect(requests.some((request) => /\/start$/.test(request))).toBe(false);
  });

  it.each(["audio", "article"] as const)(
    "guides an optional-stage %s run to its actual final download",
    async (final) => {
      const user = userEvent.setup();
      const { requests } = await mount({ completeProject: true });
      const source = (kind: string, value: string) =>
        user.click(
          within(screen.getByRole("radiogroup", { name: `${kind} source` })).getByRole("radio", {
            name: value,
          }),
        );
      await start(user);
      await skipTo(user, "play-options");
      await fill(user, "Project title", "Optional stages");
      await user.click(guide().getByRole("button", { name: /^Skip/ }));
      await at("play-article");
      await source("article", "Provide");
      await fill(user, "Article text", "My finished article.");
      await next(user, "play-keywords");
      await next(user, "play-audio");
      if (final === "article") await source("audio", "Off");
      else {
        await user.selectOptions(screen.getByLabelText("TTS"), "elevenlabs");
        await user.selectOptions(screen.getByLabelText("TTS model"), "eleven_multilingual_v2");
        await user.selectOptions(screen.getByLabelText("Voice"), "narrator-1");
      }
      await next(user, "play-images");
      await source("images", "Off");
      await next(user, "play-video");
      expect(
        within(screen.getByRole("radiogroup", { name: "video source" }))
          .getByRole("radio", { name: "Off" })
          .getAttribute("aria-checked"),
      ).toBe("true");
      await next(user, "play-subtitles");

      await next(user, "play-start");
      expect(requests).not.toContain("POST /api/projects");
      await waitFor(() =>
        expect(
          (screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled,
        ).toBe(false),
      );
      await user.click(await screen.findByRole("button", { name: "Start run" }));
      await at("project");
      await next(user, "download");
      const workspace = await screen.findByRole("region", {
        name: final === "audio" ? "Audio export workspace" : "Article workspace",
      });
      expect(workspace.hasAttribute("hidden")).toBe(false);
      if (final === "audio") {
        expect(guide().getByText("Download .wav")).not.toBeNull();
        expect(screen.getByRole("link", { name: "Download .wav" }).getAttribute("href")).toContain(
          "/files/actual-created-project/audio-export",
        );
        expect(screen.getByLabelText("Combined narration")).not.toBeNull();
      } else {
        expect(guide().getByText(/Audio and Video are Off/)).not.toBeNull();
        // The guide's interaction boundary allows the Article download, proving the
        // final spotlight moved off the skipped Video stage.
        const download = screen.getByRole("link", { name: "Download" });
        expect(download.getAttribute("href")).toContain("/article-md");
        const clicked = vi.fn((event: Event) => event.preventDefault());
        download.addEventListener("click", clicked);
        await user.click(download);
        expect(clicked).toHaveBeenCalledTimes(1);
      }
      await user.click(guide().getByRole("button", { name: "Finish tutorial" }));
      expect(
        requests.filter((request) => /^POST \/api\/drafts\/[^/]+\/start$/.test(request)),
      ).toHaveLength(1);
    },
  );

  it("keeps an existing prompt draft when launching the guide", async () => {
    const user = userEvent.setup();
    await mount({ initial: "/prompts/new?kind=article" });
    await fill(user, "Name", "Already in progress");
    await fill(user, "Body", "My existing instructions about {{topic}}.");
    await start(user);
    await skipTo(user, "article-name");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Already in progress");
    expect((screen.getByLabelText("Body") as HTMLTextAreaElement).value).toBe(
      "My existing instructions about {{topic}}.",
    );
  });

  it("discards a prompt draft when the user explicitly presses Cancel", async () => {
    const user = userEvent.setup();
    const { router } = await mount({ initial: "/prompts/new?kind=article" });
    await fill(user, "Name", "Canceled draft");
    await fill(user, "Body", "Canceled instructions.");
    await user.click(screen.getByRole("link", { name: "Cancel" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/prompts"));
    await act(() => router.navigate({ to: "/prompts/new", search: { kind: "article" } }));
    expect(((await screen.findByLabelText("Name")) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Body") as HTMLTextAreaElement).value).toBe("");
  });

  it("preserves separate Image and Play drafts when Back crosses their page boundaries", async () => {
    const user = userEvent.setup();
    await mount();
    await start(user);
    await skipTo(user, "image-prompt");
    await fill(user, "Name", "Unsaved image idea");
    await fill(user, "Body", "My image instructions about {{topic}}.");
    await user.click(guide().getByRole("button", { name: "Back" }));
    await at("article-save");
    await user.click(guide().getByRole("button", { name: "Skip without saving" }));
    await at("image-prompt");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Unsaved image idea");
    expect((screen.getByLabelText("Body") as HTMLTextAreaElement).value).toBe(
      "My image instructions about {{topic}}.",
    );
    await next(user, "image-save");
    await user.click(guide().getByRole("button", { name: "Skip without saving" }));
    await at("play-options");
    await user.click(guide().getByRole("button", { name: /^Skip/ }));
    await at("play-article");
    await user.selectOptions(screen.getByLabelText("Article prompt"), "My article");
    await user.click(guide().getByRole("button", { name: "Back" }));
    await at("play-options");
    await user.click(guide().getByRole("button", { name: "Back" }));
    await at("image-save");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Unsaved image idea");
    await user.click(guide().getByRole("button", { name: "Skip without saving" }));
    await at("play-options");
    expect((screen.getByLabelText("Article prompt") as HTMLSelectElement).value).toBe("My article");
    await user.click(guide().getByRole("button", { name: /^Skip/ }));
    await at("play-article");
    expect(nextHeld()).toBe(false);
  });

  it("retains Play configuration and finishes a pending upload while the guide is on Settings", async () => {
    let attachmentId = "";
    let finish: ((response: Response) => void) | undefined;
    const uploaded = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const user = userEvent.setup();
    const { router } = await mount({
      initial: "/play",
      uploadAudio: (request) => {
        attachmentId = new URL(request.url).pathname.split("/")[5] ?? "";
        return uploaded;
      },
    });
    await fill(user, "Project title", "Draft with narration");
    await user.click(screen.getByRole("button", { name: "Content" }));
    await user.selectOptions(await screen.findByLabelText("Article prompt"), "My article");
    await user.click(screen.getByRole("button", { name: "Outputs" }));
    await user.click(
      within(screen.getByRole("radiogroup", { name: "audio source" })).getByRole("radio", {
        name: "Provide",
      }),
    );
    await user.upload(
      screen.getByLabelText("Narration file"),
      new File(["audio"], "narration.wav", { type: "audio/wav" }),
    );
    expect(screen.getByText("Copying")).not.toBeNull();
    await start(user);
    await act(async () => {
      finish?.(
        await jsonAnswer({
          id: attachmentId,
          kind: "audio",
          name: "narration.wav",
          stagedFileId: "uploaded-audio",
          bytes: 5,
          state: "ready",
          error: null,
        })(new Request("http://slopify.test")),
      );
    });
    await user.click(guide().getByRole("button", { name: "Exit guide" }));
    await act(() => router.navigate({ to: "/play" }));
    await user.click(await screen.findByRole("button", { name: "Content" }));
    expect(((await screen.findByLabelText("Project title")) as HTMLInputElement).value).toBe(
      "Draft with narration",
    );
    expect((screen.getByLabelText("Article prompt") as HTMLSelectElement).value).toBe("My article");
    await user.click(screen.getByRole("button", { name: "Outputs" }));
    expect(screen.getByText("narration.wav")).not.toBeNull();
    expect(screen.getByText("Staged")).not.toBeNull();
    expect(screen.queryByText("Copying")).toBeNull();
  });

  it("does not restore an old upload after successful creation clears the Play draft", async () => {
    let attachmentId = "";
    let finish: ((response: Response) => void) | undefined;
    const uploaded = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const user = userEvent.setup();
    const { router, requests } = await mount({
      initial: "/play",
      uploadAudio: (request) => {
        attachmentId = new URL(request.url).pathname.split("/")[5] ?? "";
        return uploaded;
      },
    });
    await user.click(screen.getByRole("button", { name: "Outputs" }));
    const audioSource = () => within(screen.getByRole("radiogroup", { name: "audio source" }));
    await user.click(screen.getByRole("button", { name: "Outputs" }));
    await user.click(audioSource().getByRole("radio", { name: "Provide" }));
    await user.upload(
      screen.getByLabelText("Narration file"),
      new File(["audio"], "old-narration.wav", { type: "audio/wav" }),
    );
    await user.click(audioSource().getByRole("radio", { name: "Generate" }));
    await user.click(screen.getByRole("button", { name: "Content" }));
    await user.selectOptions(await screen.findByLabelText("Article prompt"), "My article");
    await user.click(screen.getByRole("button", { name: "Outputs" }));
    await user.selectOptions(screen.getByLabelText("TTS"), "elevenlabs");
    await user.selectOptions(screen.getByLabelText("TTS model"), "eleven_multilingual_v2");
    await user.selectOptions(screen.getByLabelText("Voice"), "narrator-1");
    await user.selectOptions(screen.getByLabelText("Provider"), "fal");
    await user.selectOptions(
      within(document.querySelector('[data-tour="play-images"]') as HTMLElement).getByLabelText(
        "Model",
      ),
      "fal-ai/flux-2",
    );
    await user.click(screen.getByRole("checkbox", { name: "My images" }));
    await user.click(screen.getByRole("button", { name: "Content" }));
    await fill(user, "Project title", "Generated narration instead");
    await user.selectOptions(screen.getByLabelText("LLM"), "claude-code");
    await user.selectOptions(screen.getByLabelText("Text model"), "sonnet");
    await fill(user, "topic", "Mountains");
    await user.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    await user.click(await screen.findByRole("button", { name: "Start run" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/projects/actual-created-project"),
    );
    await act(() => router.navigate({ to: "/play" }));
    await act(async () => {
      finish?.(
        await jsonAnswer({
          id: attachmentId,
          kind: "audio",
          name: "old-narration.wav",
          stagedFileId: "old-upload",
          bytes: 5,
          state: "ready",
          error: null,
        })(new Request("http://slopify.test")),
      );
    });
    await user.click(await screen.findByRole("button", { name: "Content" }));
    expect(((await screen.findByLabelText("Project title")) as HTMLInputElement).value).toBe("");
    await user.click(screen.getByRole("button", { name: "Outputs" }));
    await user.click(audioSource().getByRole("radio", { name: "Provide" }));
    expect(screen.queryByText("old-narration.wav")).toBeNull();
    expect(screen.queryByText("Staged")).toBeNull();
    expect(
      requests.filter((request) => /^POST \/api\/drafts\/[^/]+\/start$/.test(request)),
    ).toHaveLength(1);
  });
});
