import { templateSections } from "@app/slices/template-studio/model.js";
import type { SampleQuoteView, StudioView } from "@app/slices/template-studio/schema.js";
import { useLocation } from "@tanstack/react-router";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AssistantScreenProvider, useAssistantScreen } from "@/assistant/screen";
import { jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { TemplateStudioPage } from "./page";
import { priceLabel } from "./save-bar";
import { checks, type document, labels, routes, templateId, view } from "./studio.fake";

afterEach(cleanup);

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
  usesPlan: false,
  budget: { budget: 2, spent: 0, unpriced: 0, left: 2, plans: false },
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
      quote({
        fits: false,
        budget: { budget: 2, spent: 1.95, unpriced: 0, left: 0.05, plans: false },
      }),
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

it("says a sample on a CLI plan waits until samples may use plans, linking to the switch", async () => {
  const user = userEvent.setup();
  open("video", {
    [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer(
      quote({ high: 0, onPlan: true, usesPlan: true, fits: false }),
    ),
  });
  await user.click(await screen.findByRole("button", { name: "Square 1:1" }));
  const priced = await screen.findByRole("button", { name: "Save · plan usage" });
  expect(priced.getAttribute("aria-disabled") ?? priced.getAttribute("disabled")).not.toBeNull();
  expect(
    screen.getByText(/This sample runs on your CLI plan, and samples may not use CLI plans/),
  ).not.toBeNull();
  expect(
    screen.getByRole("link", { name: "Settings → Template studio" }).getAttribute("href"),
  ).toBe("/settings?section=template-studio");
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

it("says how far the limiter held the level back when it lands short of the target", async () => {
  open("voice", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      free: {
        ...view.free,
        loudness: { ...view.free.loudness, afterLufs: -13.2, targetLufs: -12 },
      },
    }),
  });
  const sample = await screen.findByRole("region", { name: "Voice sample" });
  expect(
    within(sample).getByText(
      "After · -13.2 LUFS: held back 1.2 LU from -12.0 so peaks stay under -2.5 dBTP",
    ),
  ).not.toBeNull();
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

it("lists a paused schedule's runs marked paused, and what it costs once resumed", async () => {
  open("schedule", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      schedule: {
        runs: view.schedule.runs.map((run) => ({ ...run, paused: true })),
        cost: {
          runs: 0,
          high: 0,
          unknown: 0,
          problem: null,
          paused: { schedules: 1, runs: 8.7, high: 4.35 },
        },
      },
    }),
  });
  const sample = await screen.findByRole("region", { name: "Schedule sample" });
  const table = within(sample).getByRole("table", { name: "The next runs" });
  expect(within(table).getByText("Weekdays (paused)")).not.toBeNull();
  expect(
    within(sample).getByText(
      "1 paused schedule uses this template: nothing runs while it is paused. Resumed, about $4.35 a month at most, for about 8.7 runs.",
    ),
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

it("says a section's sample sentence once, beside the sample", async () => {
  open("script");
  await screen.findByRole("region", { name: "Script sample" });
  expect(
    screen.getAllByText("No sample yet. Press Save to make one, or Make sample."),
  ).toHaveLength(1);
});

it("opens the sample's script in a wide reading drawer instead of the narrow column", async () => {
  const user = userEvent.setup();
  const article = `# The lighthouse\n\n${"The keeper climbed the stairs at dusk. ".repeat(40)}\n\n## Chapter 1\n\nThe lamp was lit.`;
  open("script", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      paid: { ...view.paid, projectId: "P1", revisionId: "R1", state: "done", article },
    }),
  });
  const sample = await screen.findByRole("region", { name: "Script sample" });
  expect(within(sample).queryByText("The lamp was lit.")).toBeNull();
  await user.click(within(sample).getByRole("button", { name: "Read the whole script" }));
  const drawer = await screen.findByRole("dialog", { name: "Sample script" });
  expect(within(drawer).getByText("The lamp was lit.")).not.toBeNull();
});

it("lists the names to check in the voice's sample", async () => {
  open("voice", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      paid: { ...view.paid, projectId: "P1", revisionId: "R1", state: "done" },
    }),
    [`GET /api/template-studio/${templateId}/pronunciations`]: jsonAnswer({
      names: [{ term: "Kish", ipa: ["kiːʃ"], line: "Kish was old.", spokenAs: null }],
      aliasesOn: true,
      voice: null,
      problem: null,
    }),
  });
  const sample = await screen.findByRole("region", { name: "Voice sample" });
  expect(await within(sample).findByRole("listitem", { name: "Kish" })).not.toBeNull();
});

const settledView: StudioView = {
  ...view,
  sections: view.sections.map((one) => ({
    ...one,
    state: one.id === "thumbnail" ? "off" : "current",
  })),
};
const passing = { version: 3, checks: checks.checks.map((check) => ({ ...check, ok: true })) };

it("keeps Mark ready visible but disabled, saying what to fix first", async () => {
  open();
  const button = await screen.findByRole("button", { name: "Mark ready" });
  await waitFor(() => expect(button.getAttribute("aria-disabled")).toBe("true"));
  expect(button.getAttribute("aria-describedby")).not.toBeNull();
});

it("marks the version ready after saying schedules start running it", async () => {
  const user = userEvent.setup();
  let asked: unknown;
  const ready = vi.fn(async (request: Request) => {
    asked = await request.json();
    return Response.json({ version: 3, gate: "ready", replayed: false });
  });
  open("subject", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer(settledView),
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(passing),
    [`POST /api/template-studio/${templateId}/ready`]: ready,
  });
  const button = await screen.findByRole("button", { name: "Mark ready" });
  await waitFor(() => expect(button.getAttribute("aria-disabled")).toBeNull());
  await user.click(button);
  const dialog = await screen.findByRole("dialog", { name: "Mark version 3 ready?" });
  expect(
    within(dialog).getByText(
      "Schedules start running this version from their next run. Until now they ran version 2.",
    ),
  ).not.toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Mark ready" }));
  await waitFor(() => expect(ready).toHaveBeenCalledOnce());
  expect(asked).toEqual({ version: 3 });
});

it("shows Mark ready's refusal with each thing to fix", async () => {
  const user = userEvent.setup();
  open("subject", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer(settledView),
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(passing),
    [`POST /api/template-studio/${templateId}/ready`]: jsonAnswer(
      {
        title: "Conflict",
        reason: "not-ready",
        detail: "Version 3 can't be marked ready yet. Voice: Press Make sample.",
        problems: [{ label: "Voice", sentence: "Press Make sample.", section: "voice" }],
      },
      409,
    ),
  });
  const button = await screen.findByRole("button", { name: "Mark ready" });
  await waitFor(() => expect(button.getAttribute("aria-disabled")).toBeNull());
  await user.click(button);
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Mark ready" }));
  expect(
    await screen.findByText("Version 3 can't be marked ready yet. Voice: Press Make sample."),
  ).not.toBeNull();
});

it("says a ready version is marked, with no button to press again", async () => {
  open("subject", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...settledView,
      gate: "ready",
      runnableVersion: 3,
    }),
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(passing),
  });
  const button = await screen.findByRole("button", { name: "Marked ready" });
  expect(button.getAttribute("aria-disabled")).toBe("true");
  expect(screen.getByText("Version 3 · Ready")).not.toBeNull();
});

it("asks for the free samples by itself when only the schedule's cost is still to work out", async () => {
  const asked = vi.fn(() => Response.json({ queued: true, version: 3 }, { status: 202 }));
  open("schedule", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      schedule: {
        ...view.schedule,
        cost: {
          runs: 4,
          high: 0,
          unknown: 1,
          problem:
            "The cost of the runs of Weekdays isn't worked out yet: it is, with the free samples.",
          paused: { schedules: 0, runs: 0, high: 0 },
        },
      },
    }),
    [`POST /api/template-studio/${templateId}/free-samples`]: asked,
  });
  await waitFor(() => expect(asked).toHaveBeenCalledOnce());
});

function ScreenProbe() {
  return <output aria-label="assistant screen">{JSON.stringify(useAssistantScreen())}</output>;
}

it("tells the assistant which template and section are open", async () => {
  renderRouted(
    <AssistantScreenProvider>
      <TemplateStudioPage templateId={templateId} section="voice" />
      <ScreenProbe />
    </AssistantScreenProvider>,
    testDeps(routes),
  );
  await waitFor(() =>
    expect(JSON.parse(screen.getByLabelText("assistant screen").textContent ?? "{}")).toMatchObject(
      { templateId, section: "Voice" },
    ),
  );
});

it("opens a design template's studio when the address names a design template", async () => {
  const designId = "44444444-4444-4444-8444-444444444444";
  let path = "";
  function Probe(): null {
    path = useLocation().pathname;
    return null;
  }
  renderRouted(
    <>
      <TemplateStudioPage templateId={designId} section="subject" />
      <Probe />
    </>,
    testDeps({
      [`GET /api/template-studio/${designId}`]: problemAnswer("No such template.", 404),
      [`GET /api/design-templates/${designId}`]: jsonAnswer({ id: designId, name: "Poster" }),
    }),
  );
  await waitFor(() => expect(path).toBe(`/design-templates/${designId}`));
});

it("says the studio didn't open when the address names no template of either kind", async () => {
  renderRouted(
    <TemplateStudioPage templateId={templateId} section="subject" />,
    testDeps({
      [`GET /api/template-studio/${templateId}`]: problemAnswer(
        "This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates.",
        404,
      ),
      [`GET /api/design-templates/${templateId}`]: problemAnswer("No such design template.", 404),
    }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "The studio didn't open: This template no longer exists",
  );
});

it("exports the version schedules run as a pack, and says why when there is none", async () => {
  const user = userEvent.setup();
  const create = vi.fn(() => "blob:pack");
  const revoke = vi.fn();
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  open("subject", {
    [`GET /api/template-studio/${templateId}/pack`]: () =>
      new Response(new Uint8Array([80, 75]), {
        headers: {
          "content-type": "application/zip",
          "content-disposition": 'attachment; filename="weekly-documentary.slopify-pack.zip"',
        },
      }),
  });
  await user.click(await screen.findByRole("button", { name: "Export pack (version 2)" }));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(create).toHaveBeenCalledTimes(1);
  click.mockRestore();
  cleanup();

  open("subject", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({ ...view, runnableVersion: null }),
  });
  const blocked = await screen.findByRole("button", { name: "Export pack" });
  expect(blocked.getAttribute("aria-disabled") ?? blocked.getAttribute("disabled")).not.toBeNull();
  cleanup();

  open("subject", {
    [`GET /api/template-studio/${templateId}/pack`]: problemAnswer(
      "Something in this template looks like an API key or a login token.",
      400,
    ),
  });
  await user.click(await screen.findByRole("button", { name: "Export pack (version 2)" }));
  expect(
    await screen.findByText("Something in this template looks like an API key or a login token."),
  ).not.toBeNull();
});

it("shows the samples an imported pack came with", async () => {
  open("subject", {
    [`GET /api/template-studio/${templateId}/pack-samples`]: jsonAnswer({
      samples: [
        {
          role: "thumbnail",
          name: "thumb.png",
          url: `/api/template-studio/${templateId}/pack-samples/thumbnail-1.png`,
        },
        {
          role: "narration",
          name: "n.mp3",
          url: `/api/template-studio/${templateId}/pack-samples/narration-2.mp3`,
        },
      ],
    }),
  });
  const section = await screen.findByRole("region", { name: "Samples from the pack" });
  expect(within(section).getByRole("img", { name: "The pack's thumbnail" })).not.toBeNull();
  expect(within(section).getByText(/Your own samples replace these/)).not.toBeNull();
});

it("names each choice row in Video & captions above its buttons", async () => {
  open("video");
  const panel = await screen.findByRole("region", { name: "Video & captions settings" });
  const names = [...panel.querySelectorAll('[data-slot="studio-choice"] .sl-field__label')].map(
    (label) => label.textContent,
  );
  expect(names).toEqual(["Format", "Captions", "Motion"]);
  expect(within(panel).getByRole("group", { name: "Captions" })).not.toBeNull();
});
