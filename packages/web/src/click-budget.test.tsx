import type { DraftView } from "@app/slices/play-drafts/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/kit/toast";
import { draftView, generatedRun, mountPlay } from "@/play/play-test-fixture";
import { revisionView } from "@/project/revision-fixture";
import { ProjectRoute } from "@/routes/project";
import { body, finished, output, deps as projectDeps } from "@/routes/project-fixtures";
import { PromptEditorRoute } from "@/routes/prompt-editor";
import { PromptsRoute } from "@/routes/prompts";
import { SchedulesRoute } from "@/routes/schedules";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";

// The five common tasks, each counted in clicks from the screen it starts on to done, the way a
// person does it. docs/design-system.md ("Fewer clicks") keeps the table: a task that needs
// more clicks than its budget fails here, so a new step has to earn its place.
//
// What counts: a press on a button, link, row or field (focusing a field to type in it is one;
// Enter and typing are not); picking from a select is two (open it, choose).

// Play's style preview has its own tests; here it would only render in the background.
vi.mock("@/video/style-preview", () => ({ StylePreview: () => null }));
vi.mock("@/tutorial/context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/tutorial/context")>()),
  useTutorialEvent: () => () => undefined,
  useTutorialProgress: () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// A person, counting their own clicks.
function person() {
  const user = userEvent.setup();
  let clicks = 0;
  return {
    clicks: () => clicks,
    click: async (element: Element): Promise<void> => {
      clicks += 1;
      await user.click(element);
    },
    pick: async (select: Element, value: string): Promise<void> => {
      clicks += 2;
      await user.selectOptions(select, value);
    },
    // Types into a field, clicking it first unless it already has the focus.
    type: async (field: Element, text: string): Promise<void> => {
      const focused = field.ownerDocument.activeElement === field;
      if (!focused) clicks += 1;
      await user.type(field, text, { skipClick: focused });
    },
    paste: async (field: Element, text: string): Promise<void> => {
      clicks += 1;
      await user.click(field);
      await user.paste(text);
    },
  };
}

// The most clicks each task may take. The table in docs/design-system.md says what each took
// before; where the old path still exists beside the new one, it is measured here too.
const clickBudget = {
  queueVideo: 4,
  regenerateImage: 3,
  copyDescription: 1,
  editPrompt: 3,
  changeScheduleTopics: 1,
} as const;

const templateId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";

describe("clicks from the landing screen to done", () => {
  it("queues a video: pick the template, type the topic, press Start", async () => {
    const template = {
      id: templateId,
      name: "Rope lore",
      version: 1,
      updatedAt: "2026-09-13T00:00:00.000Z",
    };
    const made = new Map<string, DraftView>();
    const document = {
      ...generatedRun,
      templateSource: { id: templateId, version: 1 },
      form: {
        ...generatedRun.form,
        title: "Rope Lore: {{topic}}",
        values: { ...generatedRun.form.values, topic: "" },
      },
    };
    const { created } = await mountPlay({
      "GET /api/project-templates": jsonAnswer({ templates: [template] }),
      [`POST /api/project-templates/${templateId}/instantiate`]: async (request) => {
        const { id } = (await request.json()) as { id: string };
        const view: DraftView = {
          ...draftView(id),
          draft: { ...draftView(id).draft, document },
        };
        made.set(id, view);
        return jsonAnswer(view, 201)(request);
      },
      "GET /api/drafts/:id": (request) => {
        const id = new URL(request.url).pathname.split("/")[3] ?? "";
        return jsonAnswer(made.get(id) ?? draftView(id))(request);
      },
    });
    const you = person();

    await screen.findByRole("option", { name: "Rope lore" });
    await you.pick(screen.getByRole("combobox", { name: "Template" }), templateId);
    const topic = await screen.findByRole("textbox", { name: "topic" });
    await you.type(topic, "Bowlines");
    const start = await screen.findByRole("button", { name: "Start run" });
    await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false), {
      timeout: 4000,
    });
    await you.click(start);
    await waitFor(() => expect(created).toHaveBeenCalledWith("p1"));

    expect(you.clicks()).toBeLessThanOrEqual(clickBudget.queueVideo);
    expect(you.clicks()).toBe(4);
  });

  it("regenerates an image: open Images, press Regenerate on the image, confirm", async () => {
    const regenerated = vi.fn();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      projectDeps({
        "POST /api/projects/p1/images/o-image-1/regenerate": (request) => {
          regenerated();
          return jsonAnswer(finished)(request);
        },
      }),
    );
    const you = person();

    const rail = await screen.findByRole("navigation", { name: "Project sections" });
    await you.click(within(rail).getByRole("button", { name: /^Images/ }));
    await you.click(await screen.findByRole("button", { name: "Regenerate image 1" }));
    // Regenerating spends money on a paid model, so the one confirmation stays.
    const dialog = await screen.findByRole("dialog");
    await you.click(within(dialog).getByRole("button", { name: "Regenerate the image" }));
    await waitFor(() => expect(regenerated).toHaveBeenCalledOnce());

    expect(you.clicks()).toBeLessThanOrEqual(clickBudget.regenerateImage);
  });

  it("copies the description: one press on Copy description, which the Video section shows first", async () => {
    // user-event puts its own clipboard in place when it is set up, so the stub goes after.
    const you = person();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const youtube = [output("youtube_description", "video"), output("youtube_tags", "video")];
    const made = body({
      status: "done",
      stages: finished.stages,
      outputs: [...finished.outputs, ...youtube],
    });
    const config = { ...made.project.config, youtubeDescription: true };
    const view = {
      ...revisionView(),
      revision: { ...revisionView().revision, config },
      outputs: youtube.map((one) => ({
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
      <ProjectRoute projectId="p1" />,
      projectDeps({
        "GET /api/projects/p1": jsonAnswer({
          ...made,
          revisionId: "r1",
          project: { ...made.project, config },
        }),
        "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }),
        "GET /files/p1/revisions/r1/youtube_description": () =>
          new Response("How rope holds.\n\n0:00 Opening\n0:20 Knots\n0:40 Close\n\n#Rope"),
        "GET /files/p1/revisions/r1/youtube_tags": () => new Response("rope"),
        "GET /api/projects/p1/youtube-edits": jsonAnswer({ fields: {}, links: [] }),
        "GET /api/settings/channel-links": jsonAnswer({ links: [] }),
      }),
    );

    // The page opens on YouTube for a finished video with its description written.
    const rail = await screen.findByRole("navigation", { name: "Project sections" });
    await waitFor(() =>
      expect(
        within(rail)
          .getByRole("button", { name: /^YouTube/ })
          .getAttribute("aria-current"),
      ).toBe("true"),
    );
    const summary = await screen.findByRole("region", { name: "Summary" });
    await waitFor(() => expect(summary.textContent).toBe("How rope holds."));
    await you.click(screen.getByRole("button", { name: "Copy description" }));
    expect(writeText).toHaveBeenLastCalledWith(
      "How rope holds.\n\n0:00 Opening\n0:20 Knots\n0:40 Close\n\n#Rope",
    );

    expect(you.clicks()).toBeLessThanOrEqual(clickBudget.copyDescription);
  });

  it("edits a prompt: Edit on its row, change the text, Save", async () => {
    const dossier = {
      id: "p1",
      kind: "article" as const,
      name: "Documentary dossier",
      body: "Compose a dossier on {{topic}}.",
      slots: ["topic"],
      updatedAt: "2026-09-01T10:00:00.000Z",
    };
    const saved = vi.fn();
    const routes = {
      "GET /api/prompts": jsonAnswer({ prompts: [dossier] }),
      "GET /api/prompts/p1/used-by": jsonAnswer({ templates: [], schedules: [], projects: [] }),
      "PUT /api/prompts/p1": async (request: Request) => {
        const draft = (await request.json()) as { body: string };
        saved(draft.body);
        return jsonAnswer({ ...dossier, ...draft })(request);
      },
    };
    renderRouted(<PromptsRoute kind="article" onKind={() => undefined} />, testDeps(routes));
    const you = person();

    const edit = await screen.findByRole("link", { name: "Edit Documentary dossier" });
    expect(edit.getAttribute("href")).toBe("/prompts/p1");
    await you.click(edit);
    // The router opens the editor at that address; here it is mounted in its place.
    cleanup();
    const left = vi.fn();
    renderRouted(
      <PromptEditorRoute promptId="p1" kind="article" from={undefined} onLeave={left} />,
      testDeps(routes),
    );
    const text = await screen.findByLabelText("Body");
    await waitFor(() =>
      expect((text as HTMLTextAreaElement).value).toBe("Compose a dossier on {{topic}}."),
    );
    await you.paste(text, " Keep it short.");
    await you.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith("Compose a dossier on {{topic}}. Keep it short."),
    );

    expect(you.clicks()).toBeLessThanOrEqual(clickBudget.editPrompt);
  });

  it("changes a schedule's topics in place, with fewer clicks than the full form", async () => {
    const summary = {
      id: scheduleId,
      name: "Morning stories",
      templateId,
      templateVersion: 1,
      cadence: { kind: "daily", time: "09:00" },
      timezone: "UTC",
      missedPolicy: "skip",
      overlapPolicy: "skip",
      spendLimitCents: null,
      items: [{ title: "Owlbears", values: {} }],
      topicKeyword: "Topic",
      status: "active",
      version: 1,
      nextRunAt: "2026-09-14T09:00:00.000Z",
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
      deletedAt: null,
    };
    const saved = vi.fn();
    const routes = {
      "GET /api/schedules": jsonAnswer({ schedules: [summary] }),
      "GET /api/project-templates": jsonAnswer({
        templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: summary.updatedAt }],
      }),
      [`GET /api/project-templates/${templateId}`]: jsonAnswer({
        template: {
          id: templateId,
          name: "Stories",
          version: 1,
          updatedAt: summary.updatedAt,
          document: {
            ...generatedRun,
            form: { ...generatedRun.form, title: "Lore: {{Topic}}", values: { Topic: "" } },
          },
        },
      }),
      [`GET /api/schedules/${scheduleId}`]: jsonAnswer({ schedule: summary, runs: [] }),
      [`PUT /api/schedules/${scheduleId}/topics`]: async (request: Request) => {
        const { items } = (await request.json()) as { items: { title: string }[] };
        saved(items.map((one) => one.title));
        return jsonAnswer({ ...summary, items, version: 2 })(request);
      },
      [`PUT /api/schedules/${scheduleId}`]: async (request: Request) => {
        const { items } = (await request.json()) as { items: { title: string }[] };
        saved(items.map((one) => one.title));
        return jsonAnswer({ ...summary, items, version: 2 })(request);
      },
    };

    // Now: the picked schedule's queue takes the new topic where it is shown.
    renderRouted(
      <ToastProvider>
        <SchedulesRoute />
      </ToastProvider>,
      testDeps(routes),
    );
    const now = person();
    const queue = await screen.findByRole("region", { name: "Queued topics" });
    await now.type(within(queue).getByRole("textbox", { name: "New topic" }), "Mimics{Enter}");
    await waitFor(() => expect(saved).toHaveBeenLastCalledWith(["Owlbears", "Mimics"]));
    expect(now.clicks()).toBeLessThanOrEqual(clickBudget.changeScheduleTopics);
    cleanup();

    // Before 3.0: Edit, the topics field, Save changes. That path stays for a topic's own
    // keyword values and the table and YAML ways of writing topics.
    renderRouted(
      <ToastProvider>
        <SchedulesRoute />
      </ToastProvider>,
      testDeps(routes),
    );
    const before = person();
    await before.click(await screen.findByRole("button", { name: "Edit Morning stories" }));
    await screen.findByLabelText("Each topic fills");
    await before.type(screen.getByRole("textbox", { name: /topic · next/ }), "{Enter}Mimics");
    await before.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saved).toHaveBeenLastCalledWith(["Owlbears", "Mimics"]));
    expect(before.clicks()).toBe(3);
    expect(now.clicks()).toBeLessThan(before.clicks());
  });
});
