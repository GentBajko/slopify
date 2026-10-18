import { templateSections } from "@app/slices/template-studio/model.js";
import type { SampleQuoteView, StudioView } from "@app/slices/template-studio/schema.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { freshDraftDocument } from "@/play/draft-state";
import { jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { TemplateStudioPage } from "./page";
import { priceLabel } from "./save-bar";

afterEach(cleanup);
const templateId = "33333333-3333-4333-8333-333333333333";
const labels = [
  "Subject & research",
  "Script",
  "Voice",
  "Pictures",
  "Video & captions",
  "Thumbnail & title",
  "Shorts",
  "Document (PDF)",
  "Reviews & checkpoints",
  "Upload pack",
  "Schedule",
];
const document = {
  ...freshDraftDocument,
  form: {
    ...freshDraftDocument.form,
    title: "History: {{Topic}}",
    llm: { provider: "openrouter", model: "claude" },
  },
};
const view: StudioView = {
  template: {
    id: templateId,
    name: "Weekly documentary",
    version: 3,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    document,
  },
  gate: "unchecked",
  runnableVersion: 2,
  sample: { topic: "The history of the lighthouse", topicSource: "fixed", fullScript: false },
  sections: templateSections.map((id, index) => ({
    id,
    label: labels[index] ?? id,
    state: id === "thumbnail" ? "off" : "stale",
    sentence:
      id === "thumbnail"
        ? "The thumbnail is off."
        : "No sample yet. Press Save to make one, or Make sample.",
  })),
  free: {
    video: {
      state: "current",
      sentence: "30 seconds in your frame.",
      url: "/api/style-preview/abc.mp4?v=1",
    },
    loudness: {
      state: "current",
      sentence: "Before and after.",
      url: `/api/template-studio/${templateId}/loudness/after.mp3?v=1`,
      beforeUrl: `/api/template-studio/${templateId}/loudness/before.mp3`,
      beforeLufs: -19.4,
      afterLufs: -14,
    },
    document: { state: "off", sentence: "The PDF document is off.", url: null },
  },
  schedule: {
    runs: [
      {
        at: "2026-10-19T20:00:00.000Z",
        scheduleId: "s1",
        scheduleName: "Weekdays",
        title: "History: Salt roads",
        topic: true,
      },
    ],
    cost: { runs: 8.7, high: 4.35, unknown: 0, problem: null },
  },
  paid: {
    projectId: null,
    revisionId: null,
    state: null,
    sentence: null,
    quotedHigh: null,
    article: null,
    outputs: [],
    versions: [],
  },
  reviews: [
    {
      id: "checkpoint:video",
      name: "Before the video",
      kind: "checkpoint",
      by: "you",
      detail: "The run waits here until you approve it.",
    },
  ],
};
const checks = {
  version: 3,
  checks: [
    { id: "keywords", ok: true, sentence: "Every keyword has a value or is filled per video." },
    {
      id: "providers",
      ok: false,
      sentence: "No voice is chosen, so the run can't start.",
      fix: { label: "Choose one in Voice", href: `/templates/${templateId}?section=voice` },
    },
  ],
};
const routes = {
  [`GET /api/template-studio/${templateId}`]: jsonAnswer(view),
  [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(checks),
  "GET /api/providers": jsonAnswer({
    providers: [
      {
        id: "openrouter",
        family: "llm",
        displayName: "OpenRouter",
        readiness: { kind: "keyed", hasKey: true },
      },
    ],
  }),
};

function open(section: (typeof templateSections)[number] = "subject", extra = {}) {
  return renderRouted(
    <TemplateStudioPage templateId={templateId} section={section} />,
    testDeps({ ...routes, ...extra }),
  );
}

it("lists the sections in pipeline order, each with its sample's state in words", async () => {
  open();
  const rail = await screen.findByRole("navigation", { name: "Template sections" });
  const links = within(rail).getAllByRole("link");
  expect(links.map((link) => link.textContent)).toEqual(
    labels.map(
      (label, index) =>
        `${label}${templateSections[index] === "thumbnail" ? "Off" : "No current sample"}`,
    ),
  );
  expect(links[0]?.getAttribute("aria-current")).toBe("page");
  expect(links[2]?.getAttribute("href")).toBe(`/templates/${templateId}?section=voice`);
});

it("names the version, what schedules run and the sample topic in the header", async () => {
  open();
  expect(
    await screen.findByRole("heading", { name: "Weekly documentary", level: 1 }),
  ).not.toBeNull();
  expect(
    screen.getByText("Version 3 · Not checked in the studio · schedules run version 2"),
  ).not.toBeNull();
  expect(screen.getByText("Sample topic: The history of the lighthouse")).not.toBeNull();
});

it.each(templateSections)(
  "shows at most four settings in %s, Fine-tune folded",
  async (section) => {
    open(section);
    const panel = await screen.findByRole("region", {
      name: `${labels[templateSections.indexOf(section)] ?? section} settings`,
    });
    const controls = panel.querySelector('[data-slot="studio-controls"]');
    expect(controls?.children.length ?? 0).toBeLessThanOrEqual(4);
    const fold = panel.querySelector("details");
    expect(fold?.open).toBe(false);
    expect(fold?.querySelector("summary")?.textContent).toMatch(/^Fine-tune /);
  },
);

it("says what the script is made with, and Change opens Fine-tune", async () => {
  const user = userEvent.setup();
  open("script");
  expect(await screen.findByText("Made with OpenRouter · claude")).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Change" }));
  await waitFor(() =>
    expect(
      screen.getByRole("region", { name: "Script settings" }).querySelector("details")?.open,
    ).toBe(true),
  );
});

it("shows the studio at once while its checks are still being looked up", async () => {
  open("subject", {
    [`GET /api/template-studio/${templateId}/checks`]: () => new Promise<Response>(() => undefined),
  });
  expect(
    await screen.findByRole("heading", { name: "Weekly documentary", level: 1 }),
  ).not.toBeNull();
  const pending = screen.getByRole("region", { name: "Checks" });
  expect(within(pending).getByRole("status", { name: "Checking the template" })).not.toBeNull();
});

it("says why the checks didn't load, and keeps the rest of the studio", async () => {
  open("subject", {
    [`GET /api/template-studio/${templateId}/checks`]: problemAnswer(
      "Slopify couldn't look up your providers.",
      500,
    ),
  });
  const region = await screen.findByRole("region", { name: "Checks" });
  expect(
    await within(region).findByText(
      /The checks didn't load: Slopify couldn't look up your providers\./,
    ),
  ).not.toBeNull();
  expect(screen.getByRole("heading", { name: "Weekly documentary", level: 1 })).not.toBeNull();
});

it("lists the free checks, each failing one with its fix as a link", async () => {
  open();
  const checks = await screen.findByRole("region", { name: "Checks" });
  expect(await within(checks).findByText("1 to fix")).not.toBeNull();
  expect(
    within(checks).getByRole("link", { name: "Choose one in Voice" }).getAttribute("href"),
  ).toBe(`/templates/${templateId}?section=voice`);
});

const quote = (over: Partial<SampleQuoteView> = {}): SampleQuoteView => ({
  version: 3,
  first: false,
  sections: ["video", "shorts", "upload"],
  rows: [{ stage: "Export / subtitles", low: 0, high: 0, detail: "Local." }],
  low: 0.08,
  high: 0.12,
  unknown: 0,
  onPlan: false,
  budget: { budget: 2, spent: 0, left: 2 },
  fits: true,
  problem: null,
  ...over,
});

it("prices the Save on its button and saves at that price", async () => {
  const user = userEvent.setup();
  const sent = vi.fn(async (request: Request) => {
    const body = (await request.json()) as {
      baseVersion: number;
      sample: string;
      acknowledgedHigh: number;
      document: typeof document;
    };
    expect(body).toMatchObject({ baseVersion: 3, sample: "make", acknowledgedHigh: 0.12 });
    expect(body.document.form.format).toBe("9:16");
    return Response.json({
      template: { ...view.template, version: 4 },
      sample: "queued",
      quote: null,
      replayed: false,
    });
  });
  open("video", {
    [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer(quote()),
    [`POST /api/template-studio/${templateId}/save`]: sent,
  });
  const save = await screen.findByRole("button", { name: "Save" });
  expect(save.hasAttribute("disabled")).toBe(true);
  await user.click(screen.getByRole("button", { name: "Vertical 9:16" }));
  expect(screen.getByText("Unsaved changes.")).not.toBeNull();
  const priced = await screen.findByRole("button", { name: "Save · about $0.12" });
  await waitFor(() => expect(priced.hasAttribute("disabled")).toBe(false));
  await user.click(priced);
  await waitFor(() => expect(sent).toHaveBeenCalledOnce());
});

it("saves without a sample, which spends nothing", async () => {
  const user = userEvent.setup();
  const sent = vi.fn(async (request: Request) => {
    expect(await request.json()).toMatchObject({ sample: "skip", acknowledgedHigh: 0 });
    return Response.json({
      template: { ...view.template, version: 4 },
      sample: "skipped",
      quote: null,
      replayed: false,
    });
  });
  open("video", {
    [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer(quote()),
    [`POST /api/template-studio/${templateId}/save`]: sent,
  });
  await user.click(await screen.findByRole("button", { name: "Square 1:1" }));
  await user.click(screen.getByRole("button", { name: "Save without a sample" }));
  await waitFor(() => expect(sent).toHaveBeenCalledOnce());
});

it("puts a higher price back on the button, in the server's words, when the Save is refused", async () => {
  const user = userEvent.setup();
  open("video", {
    [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer(quote()),
    [`POST /api/template-studio/${templateId}/save`]: () =>
      Response.json(
        {
          title: "Conflict",
          status: 409,
          detail:
            "The sample now costs about $0.61, more than the $0.12 you saw. Press Save again to accept the new price, or Save without a sample.",
          reason: "cost-changed",
          quote: quote({ high: 0.61 }),
        },
        { status: 409, headers: { "content-type": "application/problem+json" } },
      ),
  });
  await user.click(await screen.findByRole("button", { name: "Square 1:1" }));
  const priced = await screen.findByRole("button", { name: "Save · about $0.12" });
  await waitFor(() => expect(priced.hasAttribute("disabled")).toBe(false));
  await user.click(priced);
  expect(
    await screen.findByText(
      "The template wasn't saved: The sample now costs about $0.61, more than the $0.12 you saw. Press Save again to accept the new price, or Save without a sample.",
    ),
  ).not.toBeNull();
  expect(await screen.findByRole("button", { name: "Save · about $0.61" })).not.toBeNull();
});

it("says a first sample that costs nothing is free, and a change no sample shows needs none", async () => {
  expect(priceLabel(quote({ high: 0, first: true, sections: [] }))).toBe("Save · free");
  expect(priceLabel(quote({ high: 0, first: false, sections: [] }))).toBe("Save · no paid change");
  expect(priceLabel(quote({ onPlan: true }))).toBe("Save · plan usage");
});

it("keeps Save on screen but off at today's budget, linking to where it is raised", async () => {
  const user = userEvent.setup();
  open("video", {
    [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer(
      quote({ fits: false, budget: { budget: 2, spent: 1.95, left: 0.05 } }),
    ),
  });
  await user.click(await screen.findByRole("button", { name: "Square 1:1" }));
  const priced = await screen.findByRole("button", { name: "Save · about $0.12" });
  expect(priced.hasAttribute("disabled") || priced.getAttribute("aria-disabled") === "true").toBe(
    true,
  );
  expect(
    screen.getByRole("link", { name: "Settings → Template studio" }).getAttribute("href"),
  ).toBe("/settings?section=template-studio");
  expect(
    screen.getByRole("button", { name: "Save without a sample" }).hasAttribute("disabled"),
  ).toBe(false);
});

it("asks to accept steps with no known price before a priced Save", async () => {
  const user = userEvent.setup();
  open("video", {
    [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer(quote({ unknown: 2 })),
  });
  await user.click(await screen.findByRole("button", { name: "Square 1:1" }));
  const priced = await screen.findByRole("button", { name: "Save · about $0.12" });
  const accept = await screen.findByRole("switch", { name: "Accept 2 steps with no known price" });
  expect(priced.hasAttribute("disabled") || priced.getAttribute("aria-disabled") === "true").toBe(
    true,
  );
  await user.click(accept);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Save · about $0.12" }).hasAttribute("disabled"),
    ).toBe(false),
  );
});

it("shows a failed sample's own sentence and Make sample at its price", async () => {
  const user = userEvent.setup();
  const failed = "OpenRouter refused the key. Paste a new one in Settings → Providers.";
  const made = vi.fn(async (request: Request) => {
    expect(await request.json()).toMatchObject({ version: 3, acknowledgedHigh: 0.3 });
    return Response.json({ queued: true, version: 3 }, { status: 202 });
  });
  open("script", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      sections: view.sections.map((one) =>
        one.id === "script" ? { ...one, state: "needs-fix", sentence: failed } : one,
      ),
      paid: { ...view.paid, state: "failed", sentence: failed, quotedHigh: 0.3 },
    }),
    [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer(quote()),
    [`POST /api/template-studio/${templateId}/samples/make`]: made,
  });
  const sample = await screen.findByRole("region", { name: "Script sample" });
  expect(within(sample).getByText(failed)).not.toBeNull();
  await user.click(within(sample).getByRole("button", { name: "Make sample · about $0.30" }));
  await waitFor(() => expect(made).toHaveBeenCalledOnce());
});

it("shows the paid sample's pictures and its earlier versions", async () => {
  open("pictures", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      paid: {
        ...view.paid,
        projectId: "P1",
        revisionId: "R1",
        state: "done",
        outputs: [
          { section: "pictures", role: "image", url: "/files/P1/revisions/R1/a", name: "001.png" },
          { section: "pictures", role: "image", url: "/files/P1/revisions/R1/b", name: "002.png" },
        ],
        versions: [
          { version: 3, state: "done", updatedAt: "2026-10-02T00:00:00.000Z" },
          { version: 2, state: "skipped", updatedAt: "2026-10-01T00:00:00.000Z" },
        ],
      },
    }),
  });
  const grid = await screen.findByRole("region", { name: "Sample pictures" });
  expect(
    within(grid)
      .getAllByRole("img")
      .map((img) => img.getAttribute("alt")),
  ).toEqual(["001.png", "002.png"]);
  expect(screen.getByText("Earlier samples · 1")).not.toBeNull();
  expect(screen.getByText("Version 2 · Saved without a sample")).not.toBeNull();
});

it("shows a prompt's anatomy, part by part, once opened", async () => {
  const user = userEvent.setup();
  open("script", {
    [`GET /api/template-studio/${templateId}/anatomy`]: jsonAnswer({
      section: "script",
      items: [{ key: "article", label: "Article prompt" }],
      item: "article",
      segments: [
        { origin: "yours", text: "Write about " },
        { origin: "keyword", name: "Topic", text: "lighthouses" },
        { origin: "slopify", text: "\n\nThis is a short sample of the script." },
      ],
      fromSample: true,
      problem: null,
    }),
  });
  const summary = await screen.findByText("Prompt anatomy");
  await user.click(summary);
  expect(await screen.findByText("lighthouses")).not.toBeNull();
  expect(screen.getByTitle("Your keywords: Topic")).not.toBeNull();
  expect(screen.getByText("As the sample sent it.")).not.toBeNull();
});

it("changes the sample topic at the price the drawer shows", async () => {
  const user = userEvent.setup();
  const changed = vi.fn(async (request: Request) => {
    expect(await request.json()).toMatchObject({ topic: "Salt roads", acknowledgedHigh: 0.9 });
    return Response.json({ topic: "Salt roads", topicSource: "fixed", fullScript: false });
  });
  open("subject", {
    [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer(
      quote({ high: 0.9, first: true }),
    ),
    [`PUT /api/template-studio/${templateId}/topic`]: changed,
  });
  await user.click(
    await screen.findByRole("button", { name: "Sample topic: The history of the lighthouse" }),
  );
  const input = await screen.findByRole("textbox", { name: "Topic" });
  await user.clear(input);
  await user.type(input, "Salt roads");
  const use = await screen.findByRole("button", { name: "Use topic · about $0.90" });
  await waitFor(() => expect(use.hasAttribute("disabled")).toBe(false));
  await user.click(use);
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
});

it("switches between sections, settings and sample with tabs on a narrow screen", async () => {
  const user = userEvent.setup();
  open();
  const tabs = await screen.findByRole("tablist", { name: "Studio panes" });
  expect(
    within(tabs)
      .getAllByRole("tab")
      .map((tab) => tab.textContent),
  ).toEqual(["Sections", "Settings", "Sample"]);
  const settings = screen.getByRole("region", { name: "Subject & research settings" });
  const sample = screen.getByRole("region", { name: "Subject & research sample" });
  expect(settings.className).not.toContain("max-md:hidden");
  expect(sample.parentElement?.className).toContain("max-md:hidden");
  await user.click(within(tabs).getByRole("tab", { name: "Sample" }));
  expect(screen.getByRole("region", { name: "Subject & research settings" }).className).toContain(
    "max-md:hidden",
  );
  expect(
    screen.getByRole("region", { name: "Subject & research sample" }).parentElement?.className,
  ).not.toContain("max-md:hidden");
});

it("says plainly when the studio can't be read", async () => {
  renderRouted(
    <TemplateStudioPage templateId={templateId} section="subject" />,
    testDeps({
      [`GET /api/template-studio/${templateId}`]: problemAnswer(
        "This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates.",
        404,
      ),
    }),
  );
  expect(
    await screen.findByText(
      "The studio didn't open: This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates.",
    ),
  ).not.toBeNull();
});

it("plays the 30-second video sample in the template's frame", async () => {
  open("video");
  const sample = await screen.findByRole("region", { name: "Video & captions sample" });
  const video = sample.querySelector("video");
  expect(video?.getAttribute("src")).toBe("http://slopify.test/api/style-preview/abc.mp4?v=1");
  expect(
    within(sample).getByRole("button", { name: "Make samples" }).hasAttribute("disabled"),
  ).toBe(true);
});

it("plays the loudness before and after, each with its level", async () => {
  open("voice");
  const sample = await screen.findByRole("region", { name: "Voice sample" });
  expect(within(sample).getByText("Before · -19.4 LUFS")).not.toBeNull();
  expect(within(sample).getByText("After · -14.0 LUFS")).not.toBeNull();
  expect([...sample.querySelectorAll("audio")].map((one) => one.getAttribute("src"))).toEqual([
    `http://slopify.test/api/template-studio/${templateId}/loudness/before.mp3`,
    `http://slopify.test/api/template-studio/${templateId}/loudness/after.mp3?v=1`,
  ]);
});

it("lists the schedule's next runs with their titles and the cost a month", async () => {
  open("schedule");
  const sample = await screen.findByRole("region", { name: "Schedule sample" });
  const table = within(sample).getByRole("table", { name: "The next runs" });
  expect(within(table).getByText("History: Salt roads")).not.toBeNull();
  expect(
    within(sample).getByText("About $4.35 a month at most, for about 8.7 runs."),
  ).not.toBeNull();
});

it("shows where a run stops and who answers", async () => {
  open("reviews");
  const steps = await screen.findByRole("list", { name: "Where a run stops" });
  expect(steps.textContent).toContain("Before the video");
  expect(steps.textContent).toContain("The run waits here until you approve it.");
});

it("asks for a version's free samples by itself once, and again from Make samples", async () => {
  const user = userEvent.setup();
  const asked = vi.fn(() => Response.json({ queued: true, version: 3 }, { status: 202 }));
  const stale = {
    ...view,
    free: {
      ...view.free,
      video: { state: "stale", sentence: "No 30-second video for this version yet.", url: null },
    },
  };
  open("video", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer(stale),
    [`POST /api/template-studio/${templateId}/free-samples`]: asked,
  });
  await waitFor(() => expect(asked).toHaveBeenCalledOnce());
  const sample = await screen.findByRole("region", { name: "Video & captions sample" });
  const make = within(sample).getByRole("button", { name: "Make samples" });
  await waitFor(() => expect(make.hasAttribute("disabled")).toBe(false));
  await user.click(make);
  await waitFor(() => expect(asked).toHaveBeenCalledTimes(2));
});

it("says when the samples couldn't be asked for", async () => {
  const stale = {
    ...view,
    free: { ...view.free, video: { state: "stale", sentence: "Not yet.", url: null } },
  };
  open("video", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer(stale),
    [`POST /api/template-studio/${templateId}/free-samples`]: problemAnswer(
      "This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates.",
      404,
    ),
  });
  expect(
    await screen.findByText(
      "The samples weren't asked for: This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates. Press Make samples again.",
    ),
  ).not.toBeNull();
});
