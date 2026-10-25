import { setupSectionNames, setupSections } from "@app/slices/project-templates/setup-sections.js";
import { setupSectionOf, templateSections } from "@app/slices/template-studio/model.js";
import type { SampleQuoteView, StudioView } from "@app/slices/template-studio/schema.js";
import { useLocation } from "@tanstack/react-router";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AssistantScreenProvider, useAssistantScreen } from "@/assistant/screen";
import { freshDraftDocument } from "@/play/draft-state";
import { packs, xPack } from "@/social/post.fake";
import type { PlayHandoff } from "@/templates/play-handoff";
import { jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { TemplateStudioPage } from "./page";
import { checks, labels, routes, templateId, view } from "./studio.fake";

afterEach(cleanup);

function open(
  section: (typeof templateSections)[number] = "subject",
  extra = {},
  play?: PlayHandoff,
) {
  return renderRouted(
    <TemplateStudioPage templateId={templateId} section={section} play={play} />,
    testDeps({ ...routes, ...extra }),
  );
}

const quote = (over: Partial<SampleQuoteView> = {}): SampleQuoteView => ({
  version: 3,
  first: true,
  sections: [],
  rows: [{ stage: "Article", low: 0.1, high: 0.3, detail: "One call." }],
  low: 0.08,
  high: 0.3,
  unknown: 0,
  onPlan: false,
  usesPlan: false,
  budget: { budget: 2, spent: 0, unpriced: 0, left: 2, plans: false },
  fits: true,
  problem: null,
  ...over,
});

// Nothing fails a check: the sample's own button shows.
const passing = { version: 3, checks: checks.checks.map((check) => ({ ...check, ok: true })) };

it("names its sections from the one list Create and a project share, in run order", () => {
  expect(templateSections.map((id) => setupSectionOf[id])).toEqual(setupSections);
  expect(templateSections.map((id) => setupSectionNames[setupSectionOf[id]])).toEqual(labels);
});

it("lists the sections, a lamp and its word only where a section's sample says something", async () => {
  open();
  const rail = await screen.findByRole("navigation", { name: "Template sections" });
  const links = within(rail).getAllByRole("link");
  expect(links.map((link) => link.textContent)).toEqual(
    labels.map((label, index) =>
      templateSections[index] === "thumbnail" ? `${label}, Off` : label,
    ),
  );
  // No lamp stands without its word.
  expect(rail.querySelectorAll(".sl-lamp")).toHaveLength(1);
  expect(links[0]?.getAttribute("aria-current")).toBe("page");
  expect(links[2]?.getAttribute("href")).toBe(`/templates/${templateId}?section=voice`);
});

it("is titled Edit template, names the template and its version, and says what schedules run", async () => {
  open();
  expect(await screen.findByRole("heading", { name: "Edit template", level: 1 })).not.toBeNull();
  expect(
    screen.getByText("Weekly documentary · version 3 · Not ready for schedules"),
  ).not.toBeNull();
  expect(
    await screen.findByText(
      "Schedules run version 2 until you approve this one: More → Approve for schedules. First fix 1 check.",
    ),
  ).not.toBeNull();
});

it("says nothing about schedules on a template no schedule runs", async () => {
  open("subject", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      gated: false,
      runnableVersion: 3,
      schedule: { runs: [], cost: null },
    }),
  });
  expect(await screen.findByText("Weekly documentary · version 3")).not.toBeNull();
  expect(screen.queryByText(/schedules/i)).toBeNull();
  await userEvent.setup().click(screen.getByRole("button", { name: "More for this template" }));
  expect(await screen.findByRole("menuitem", { name: "Versions" })).not.toBeNull();
  expect(screen.queryByRole("menuitem", { name: /Approve/ })).toBeNull();
});

it("lays each section's whole editor out at once, in Create's words, with nothing said twice", async () => {
  open("video");
  const panel = await screen.findByRole("region", { name: "Video and style settings" });
  const folds = [...panel.querySelectorAll("details > summary")].map((one) => one.textContent);
  expect(folds.filter((one) => /^(All|More) /.test(one ?? ""))).toEqual([]);
  // One shape setting, named as Create names it.
  expect(within(panel).getAllByText("Frame format")).toHaveLength(1);
  expect(within(panel).queryByText("Shape")).toBeNull();
  expect(within(panel).queryByText("Image motion")).toBeNull();
  expect(within(panel).getAllByRole("textbox", { name: /^Seconds per image/ })).toHaveLength(1);
});

it("shows the thumbnail as Create's Extras shows it: its tick, how it is made and its prompt", async () => {
  open("thumbnail", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      template: {
        ...view.template,
        document: {
          ...view.template.document,
          form: {
            ...view.template.document.form,
            sources: { ...view.template.document.form.sources, thumbnail: "from_prompt" },
          },
        },
      },
    }),
  });
  const panel = await screen.findByRole("region", { name: "Thumbnail settings" });
  expect(await within(panel).findByRole("combobox", { name: "Thumbnail prompt" })).not.toBeNull();
  expect(within(panel).getAllByRole("checkbox", { name: /^Thumbnail/ })).toHaveLength(1);
  expect(panel.querySelector("details > summary")?.textContent ?? "").not.toMatch(/settings/);
  expect(within(panel).getAllByText("How many thumbnails")).toHaveLength(1);
});

it("shows Images whole: its source, who makes them and Scenes from the article, once each", async () => {
  open("pictures");
  const panel = await screen.findByRole("region", { name: "Images settings" });
  expect(
    await within(panel).findAllByRole("switch", { name: /^Scenes from the article/ }),
  ).toHaveLength(1);
  expect(within(panel).getAllByRole("group", { name: "Images by" })).toHaveLength(1);
  expect(panel.querySelector("details > summary")?.textContent ?? "").not.toMatch(/settings/);
});

it("shows only the Images switch while images are off: there is nothing more to set", async () => {
  open("pictures", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      template: {
        ...view.template,
        document: {
          ...view.template.document,
          form: {
            ...view.template.document.form,
            sources: { ...view.template.document.form.sources, images: "off", video: "off" },
          },
        },
      },
    }),
  });
  const panel = await screen.findByRole("region", { name: "Images settings" });
  expect(within(panel).queryByRole("group", { name: "Images by" })).toBeNull();
  expect(within(panel).queryByRole("switch", { name: /^Scenes from the article/ })).toBeNull();
});

it("shows Title and keywords's name, title and language under no fold, and Research once, in Article", async () => {
  open("subject");
  const panel = await screen.findByRole("region", { name: "Title and keywords settings" });
  expect(await within(panel).findByRole("combobox", { name: "Language" })).not.toBeNull();
  expect(within(panel).getByRole("textbox", { name: "Video title" })).not.toBeNull();
  expect(panel.querySelector("details")).toBeNull();
  expect(within(panel).queryByText("Research")).toBeNull();
});

it("shows PDF as Create's Extras shows it: one tick and, once on, its look", async () => {
  const user = userEvent.setup();
  open("document");
  const panel = await screen.findByRole("region", { name: "PDF settings" });
  expect(within(panel).queryByRole("combobox", { name: "PDF look" })).toBeNull();
  expect(
    within(panel).getByText("Laid out on this computer from the article and title · free."),
  ).not.toBeNull();
  await user.click(within(panel).getByRole("checkbox", { name: /^PDF of the article/ }));
  expect(within(panel).getByRole("combobox", { name: "PDF look" })).not.toBeNull();
  expect(
    within(panel)
      .getByRole("link", { name: /^Edit PDF looks/ })
      .getAttribute("href"),
  ).toBe("/document-themes");
});

it("sends a thumbnail drawn by the images' service to Images to change it", async () => {
  open("thumbnail", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      template: {
        ...view.template,
        document: {
          ...view.template.document,
          form: {
            ...view.template.document.form,
            sources: { ...view.template.document.form.sources, thumbnail: "from_prompt" },
          },
        },
      },
    }),
  });
  const panel = await screen.findByRole("region", { name: "Thumbnail settings" });
  const link = await within(panel).findByRole("link", { name: /in Images$/ });
  expect(link.getAttribute("href")).toBe(`/templates/${templateId}?section=pictures`);
  expect(within(panel).queryByRole("button", { name: "Change" })).toBeNull();
});

it.each(["shorts", "reviews", "upload"] as const)(
  "shows the whole of %s at once, under no All … settings fold",
  async (section) => {
    open(section);
    const panel = await screen.findByRole("region", {
      name: `${labels[templateSections.indexOf(section)] ?? section} settings`,
    });
    const folds = [...panel.querySelectorAll("details > summary")].map((one) => one.textContent);
    expect(folds.filter((one) => one?.startsWith("All "))).toEqual([]);
    expect(folds).toContainEqual(expect.stringMatching(/^What the .* sent/));
  },
);

it("puts each setting in one section: the shorts in Shorts, each site's post in YouTube description and posts", async () => {
  open("shorts");
  const shorts = await screen.findByRole("region", { name: "Shorts settings" });
  expect(within(shorts).queryByRole("group", { name: "Post to" })).toBeNull();
  cleanup();
  open("upload");
  const upload = await screen.findByRole("region", {
    name: "YouTube description and posts settings",
  });
  expect(within(upload).getAllByRole("group", { name: "Post to" })).toHaveLength(1);
  expect(within(upload).queryByText(/How many/)).toBeNull();
});

it("shows Pauses and checks' pauses and AI checks at once", async () => {
  open("reviews");
  const panel = await screen.findByRole("region", { name: "Pauses and checks settings" });
  expect(within(panel).getAllByRole("checkbox").length).toBeGreaterThan(0);
  expect(within(panel).getByRole("combobox", { name: "Article: check" })).not.toBeNull();
});

it("shows who writes the article in Create's own Written by group, once", async () => {
  open("script");
  const panel = await screen.findByRole("region", { name: "Article settings" });
  const group = await within(panel).findByRole("group", { name: "Written by" });
  expect(within(panel).getAllByRole("group", { name: "Written by" })).toHaveLength(1);
  expect(within(group).getByRole("combobox", { name: /Service$/ })).not.toBeNull();
  expect(within(panel).queryByRole("button", { name: "Change" })).toBeNull();
});

it("shows an unchosen writer as this computer's default, as every video made from it gets it, with nothing red", async () => {
  open("script", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      template: {
        ...view.template,
        document: {
          ...view.template.document,
          form: {
            ...view.template.document.form,
            llm: { provider: "", model: "" },
            images: { provider: "fal", model: "flux" },
          },
        },
      },
    }),
    "GET /api/providers/first-run": jsonAnswer({
      firstRun: false,
      detected: [],
      defaults: { llm: { provider: "openrouter", model: "claude" } },
    }),
  });
  expect(
    await screen.findByText(
      /^Each video is written by your default, OpenRouter \(.+\): no writer is saved with this template yet\.$/,
    ),
  ).not.toBeNull();
  const panel = screen.getByRole("region", { name: "Article settings" });
  const group = within(panel).getByRole("group", { name: "Written by" });
  expect(
    (within(group).getByRole("combobox", { name: /Service$/ }) as HTMLSelectElement).value,
  ).toBe("openrouter");
  expect(within(panel).queryByText(/No writing service is chosen/)).toBeNull();
});

it("draws the writer's pickers once, and says a run can't start, when there is no choice and no default", async () => {
  open("script", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      template: {
        ...view.template,
        document: {
          ...view.template.document,
          form: { ...view.template.document.form, llm: { provider: "", model: "" } },
        },
      },
    }),
  });
  const panel = await screen.findByRole("region", { name: "Article settings" });
  const group = await within(panel).findByRole("group", { name: "Written by" });
  expect(within(panel).getAllByRole("group", { name: "Written by" })).toHaveLength(1);
  expect(
    (within(group).getByRole("combobox", { name: /Service$/ }) as HTMLSelectElement).value,
  ).toBe("");
  expect(within(panel).queryByText(/your default/)).toBeNull();
});

it("shows the page at once while its checks are still being looked up", async () => {
  open("subject", {
    [`GET /api/template-studio/${templateId}/checks`]: () => new Promise<Response>(() => undefined),
  });
  expect(await screen.findByRole("heading", { name: "Edit template", level: 1 })).not.toBeNull();
  const pending = screen.getByRole("region", { name: "Checks" });
  expect(within(pending).getByRole("status", { name: "Checking the template" })).not.toBeNull();
});

it("says why the checks didn't load, and keeps the rest of the page", async () => {
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
  expect(screen.getByRole("heading", { name: "Edit template", level: 1 })).not.toBeNull();
});

it("lists one line per thing to fix, first, each with its link, and counts them", async () => {
  open("subject", {
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer({
      version: 3,
      checks: [
        { id: "keywords", ok: true, sentence: "Every keyword has a value or is filled per video." },
        {
          id: "providers",
          ok: false,
          sentence: "No writing service is chosen, so a run can't start.",
          fix: { label: "Choose one in Article", href: `/templates/${templateId}?section=script` },
        },
        {
          id: "providers",
          ok: false,
          sentence: "No image service is chosen, so a run can't start.",
          fix: { label: "Choose one in Images", href: `/templates/${templateId}?section=pictures` },
        },
        {
          id: "providers",
          ok: false,
          sentence: "OpenAI, the voice service, isn't set up on this computer.",
          fix: { label: "Set it up in Settings → Providers", href: "/settings?section=providers" },
        },
      ],
    }),
  });
  const region = await screen.findByRole("region", { name: "Checks" });
  expect(await within(region).findByText("3 to fix")).not.toBeNull();
  const lines = within(within(region).getByRole("list", { name: "To fix" })).getAllByRole(
    "listitem",
  );
  expect(lines.map((line) => line.textContent?.slice(0, 22))).toEqual([
    "No writing service is ",
    "No image service is ch",
    "OpenAI, the voice serv",
  ]);
  expect(region.querySelector("details > summary")?.textContent).toBe("What passes1");
  expect(
    within(region).getByRole("link", { name: "Choose one in Images" }).getAttribute("href"),
  ).toBe(`/templates/${templateId}?section=pictures`);
});

it("has no Save until something changed, and one Save that never spends", async () => {
  const user = userEvent.setup();
  const sent = vi.fn(async (request: Request) => {
    const body = (await request.json()) as Record<string, unknown> & {
      document: { form: { format: string } };
    };
    expect(body).toMatchObject({
      baseVersion: 3,
      name: "Weekly documentary",
      sample: "skip",
      acknowledgedHigh: 0,
    });
    expect(body.document.form.format).toBe("9:16");
    return Response.json({
      template: { ...view.template, version: 4 },
      sample: "skipped",
      quote: null,
      replayed: false,
    });
  });
  open("video", { [`POST /api/template-studio/${templateId}/save`]: sent });
  await screen.findByRole("region", { name: "Video and style settings" });
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  await user.click(screen.getByRole("radio", { name: "9:16 Portrait" }));
  expect(screen.getByText("Unsaved changes. Save them before you make a video.")).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent).toHaveBeenCalledOnce());
});

it("says the checks are the saved version's while a change is unsaved", async () => {
  const user = userEvent.setup();
  open("subject");
  const region = await screen.findByRole("region", { name: "Checks" });
  const note = "Checked on the saved version: Save to check your changes.";
  expect(within(region).queryByText(note)).toBeNull();
  await user.type(screen.getByRole("textbox", { name: "Template name" }), " two");
  expect(within(region).getByText(note)).not.toBeNull();
});

it("renames the template from Title and keywords, saved with the next Save", async () => {
  const user = userEvent.setup();
  const sent = vi.fn(async (request: Request) => {
    expect(await request.json()).toMatchObject({ name: "Monthly documentary" });
    return Response.json({
      template: { ...view.template, version: 4 },
      sample: "skipped",
      quote: null,
      replayed: false,
    });
  });
  open("subject", { [`POST /api/template-studio/${templateId}/save`]: sent });
  const name = await screen.findByRole("textbox", { name: "Template name" });
  await user.clear(name);
  await user.type(name, "Monthly documentary");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent).toHaveBeenCalledOnce());
});

it("makes a section's sample at the price on its button", async () => {
  const user = userEvent.setup();
  const made = vi.fn(async (request: Request) => {
    expect(await request.json()).toMatchObject({ version: 3, acknowledgedHigh: 0.3 });
    return Response.json({ queued: true, version: 3 }, { status: 202 });
  });
  open("script", {
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(passing),
    [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer(quote()),
    [`POST /api/template-studio/${templateId}/samples/make`]: made,
  });
  const sample = await screen.findByRole("region", { name: "Article sample" });
  expect(
    within(sample).getByText("Make sample shows what this section makes, about the sample topic."),
  ).not.toBeNull();
  await user.click(
    await within(sample).findByRole("button", { name: "Make sample · about $0.30" }),
  );
  await waitFor(() => expect(made).toHaveBeenCalledOnce());
});

it("never prices a sample at $0: free, plan usage, or why none can be made", async () => {
  open("script", {
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(passing),
    [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer(quote({ high: 0 })),
  });
  let sample = await screen.findByRole("region", { name: "Article sample" });
  expect(await within(sample).findByRole("button", { name: "Make sample · free" })).not.toBeNull();
  expect(
    await within(sample).findByRole("switch", {
      name: "Write the whole article in the sample (free)",
    }),
  ).not.toBeNull();
  cleanup();
  open("script", {
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(passing),
    [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer(
      quote({ high: 0, onPlan: true, usesPlan: true }),
    ),
  });
  sample = await screen.findByRole("region", { name: "Article sample" });
  expect(
    await within(sample).findByRole("button", { name: "Make sample · plan usage" }),
  ).not.toBeNull();
  cleanup();
  open("script", {
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(passing),
    [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer(
      quote({ high: 0, problem: "No sample can be made of this setup: pick an article prompt." }),
    ),
  });
  sample = await screen.findByRole("region", { name: "Article sample" });
  expect(
    await within(sample).findByText("No sample can be made of this setup: pick an article prompt."),
  ).not.toBeNull();
  expect(within(sample).queryByRole("button", { name: /^Make sample/ })).toBeNull();
  // The whole-article choice has nothing to change then, and no price to show.
  expect(within(sample).queryByRole("switch", { name: /Write the whole article/ })).toBeNull();
});

it("never calls a sample with unpriced steps free, and links the plan setting instead of a wait", async () => {
  open("script", {
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(passing),
    [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer(quote({ high: 0, unknown: 5 })),
  });
  let sample = await screen.findByRole("region", { name: "Article sample" });
  expect(
    await within(sample).findByRole("button", { name: "Make sample · price not known" }),
  ).not.toBeNull();
  cleanup();
  open("script", {
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(passing),
    [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer(quote({ high: 0.3, unknown: 2 })),
  });
  sample = await screen.findByRole("region", { name: "Article sample" });
  expect(
    await within(sample).findByRole("button", { name: "Make sample · at least $0.30" }),
  ).not.toBeNull();
  cleanup();
  open("script", {
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(passing),
    [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer(
      quote({
        high: 0,
        onPlan: true,
        usesPlan: true,
        fits: false,
        budget: { budget: 2, spent: 0, unpriced: 0, left: 2, plans: false },
      }),
    ),
  });
  sample = await screen.findByRole("region", { name: "Article sample" });
  const link = await within(sample).findByRole("link", { name: "Settings → Production defaults" });
  expect(link.getAttribute("href")).toBe("/settings?section=playback");
  expect(link.parentElement?.textContent).toContain(
    "Turn on Let samples use my Claude Code or Codex plan in Settings → Production defaults.",
  );
  expect(within(sample).queryByRole("button", { name: /^Make sample/ })).toBeNull();
});

it("links the plan setting in place of Make sample for a sample that already waits on it", async () => {
  const waiting =
    "Waiting: this sample runs on your Claude Code or Codex plan, and samples may not use it.";
  open("script", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      sections: view.sections.map((one) =>
        one.id === "script" ? { ...one, state: "waiting", sentence: waiting } : one,
      ),
      paid: { ...view.paid, state: "held", sentence: waiting, quotedHigh: 0 },
    }),
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(passing),
    [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer(
      quote({
        high: 0,
        onPlan: true,
        usesPlan: true,
        fits: false,
        budget: { budget: 2, spent: 0, unpriced: 0, left: 2, plans: false },
      }),
    ),
  });
  const sample = await screen.findByRole("region", { name: "Article sample" });
  expect(
    await within(sample).findByRole("link", { name: "Settings → Production defaults" }),
  ).not.toBeNull();
  expect(within(sample).queryByRole("button", { name: /^Make sample/ })).toBeNull();
});

it("puts a failing check's fix where Make sample would be", async () => {
  open("script");
  const sample = await screen.findByRole("region", { name: "Article sample" });
  const fix = await within(sample).findByRole("link", { name: "Choose one in Narration first" });
  expect(fix.getAttribute("href")).toBe(`/templates/${templateId}?section=voice`);
  expect(within(sample).queryByRole("button", { name: /^Make sample/ })).toBeNull();
});

it("says a fix that belongs to the open section in place, not as a link to the same page", async () => {
  open("voice");
  const sample = await screen.findByRole("region", { name: "Narration sample" });
  expect(
    await within(sample).findByText(
      "No voice service is chosen, so a run can't start. Choose one in this section's settings, then Save.",
    ),
  ).not.toBeNull();
  expect(within(sample).queryByRole("link", { name: /first$/ })).toBeNull();
});

it("puts the open section's own fix before another section's", async () => {
  open("pictures", {
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer({
      version: 3,
      checks: [
        {
          id: "providers",
          ok: false,
          sentence: "No writing service is chosen, so a run can't start.",
          fix: { label: "Choose one in Article", href: `/templates/${templateId}?section=script` },
        },
        {
          id: "providers",
          ok: false,
          sentence: "No image service is chosen, so a run can't start.",
          fix: { label: "Choose one in Images", href: `/templates/${templateId}?section=pictures` },
        },
      ],
    }),
  });
  const sample = await screen.findByRole("region", { name: "Images sample" });
  expect(
    await within(sample).findByText(
      "No image service is chosen, so a run can't start. Choose one in this section's settings, then Save.",
    ),
  ).not.toBeNull();
  expect(within(sample).queryByRole("link", { name: "Choose one in Article first" })).toBeNull();
});

it("says On, not Sample ready, for Pauses and checks and Schedule, which have no sample", async () => {
  open("subject", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      sections: view.sections.map((one) =>
        one.id === "reviews" || one.id === "schedule" || one.id === "script"
          ? { ...one, state: "current" }
          : one,
      ),
    }),
  });
  const rail = await screen.findByRole("navigation", { name: "Template sections" });
  const names = within(rail)
    .getAllByRole("link")
    .map((link) => link.textContent);
  expect(names).toContain("Pauses and checks, On");
  expect(names).toContain("Schedule, On");
  expect(names).toContain("Article, Sample ready");
});

it("shows a failed sample's own sentence and Make sample at its price", async () => {
  const user = userEvent.setup();
  const failed = "OpenRouter refused the key. Paste a new one in Settings → Providers.";
  const made = vi.fn(() => Response.json({ queued: true, version: 3 }, { status: 202 }));
  open("script", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      sections: view.sections.map((one) =>
        one.id === "script" ? { ...one, state: "needs-fix", sentence: failed } : one,
      ),
      paid: { ...view.paid, state: "failed", sentence: failed, quotedHigh: 0.3 },
    }),
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(passing),
    [`POST /api/template-studio/${templateId}/samples/make`]: made,
  });
  const sample = await screen.findByRole("region", { name: "Article sample" });
  expect(within(sample).getByText(failed)).not.toBeNull();
  await user.click(within(sample).getByRole("button", { name: "Make sample · about $0.30" }));
  await waitFor(() => expect(made).toHaveBeenCalledOnce());
});

it("shows the paid sample's images and its earlier versions", async () => {
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
  const grid = await screen.findByRole("region", { name: "Sample images" });
  expect(
    within(grid)
      .getAllByRole("img")
      .map((img) => img.getAttribute("alt")),
  ).toEqual(["001.png", "002.png"]);
  expect(screen.getByText("Earlier samples")).not.toBeNull();
  expect(screen.getByText("Version 2 · No sample made")).not.toBeNull();
});

it("shows what the writer is sent, part by part, once opened", async () => {
  const user = userEvent.setup();
  const anatomy = vi.fn(() =>
    Response.json({
      section: "script",
      items: [{ key: "article", label: "Article prompt" }],
      item: "article",
      segments: [
        { origin: "yours", text: "Write about " },
        { origin: "keyword", name: "Topic", text: "lighthouses" },
        { origin: "slopify", text: "\n\nThis is a short sample of the article." },
      ],
      fromSample: true,
      problem: null,
    }),
  );
  open("script", { [`GET /api/template-studio/${templateId}/anatomy`]: anatomy });
  const summary = await screen.findByText("What the writer is sent");
  expect(anatomy).not.toHaveBeenCalled();
  await user.click(summary);
  expect(await screen.findByText("lighthouses")).not.toBeNull();
  expect(screen.getByTitle("Your keywords: Topic")).not.toBeNull();
  expect(screen.getByText("As the sample sent it.")).not.toBeNull();
});

it("names the sample topic over the sample, and changes it at the price the drawer shows", async () => {
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
  expect(await screen.findByText("Sample topic")).not.toBeNull();
  expect(screen.getByText("The history of the lighthouse")).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Change the sample topic" }));
  const input = await screen.findByRole("textbox", { name: "Your topic" });
  await user.clear(input);
  await user.type(input, "Salt roads");
  const use = await screen.findByRole("button", { name: "Use this topic · about $0.90" });
  await waitFor(() => expect(use.hasAttribute("disabled")).toBe(false));
  await user.click(use);
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
});

it("switches between sections, settings and sample with tabs on a narrow screen", async () => {
  const user = userEvent.setup();
  open();
  const tabs = await screen.findByRole("tablist", { name: "Edit template panes" });
  // The checks are under the Sample tab on a phone: its name says one thing is to fix.
  await within(tabs).findByRole("tab", { name: "Sample · 1 to fix" });
  expect(
    within(tabs)
      .getAllByRole("tab")
      .map((tab) => tab.textContent),
  ).toEqual(["Sections", "Settings", "Sample · 1 to fix"]);
  const settings = screen.getByRole("region", { name: "Title and keywords settings" });
  const sample = screen.getByRole("region", { name: "Title and keywords sample" });
  expect(settings.className).not.toContain("max-md:hidden");
  expect(sample.parentElement?.className).toContain("max-md:hidden");
  await user.click(within(tabs).getByRole("tab", { name: "Sample · 1 to fix" }));
  expect(screen.getByRole("region", { name: "Title and keywords settings" }).className).toContain(
    "max-md:hidden",
  );
  expect(
    screen.getByRole("region", { name: "Title and keywords sample" }).parentElement?.className,
  ).not.toContain("max-md:hidden");
});

it("says plainly when the template can't be read", async () => {
  renderRouted(
    <TemplateStudioPage templateId={templateId} section="subject" />,
    testDeps({
      [`GET /api/template-studio/${templateId}`]: problemAnswer(
        "This template no longer exists; it may have been deleted. Go to Templates to see your templates.",
        404,
      ),
    }),
  );
  expect(
    await screen.findByText(
      "This template didn't open: This template no longer exists; it may have been deleted. Go to Templates to see your templates.",
    ),
  ).not.toBeNull();
});

it("plays the 30-second video sample in the template's frame, with no button while it is ready", async () => {
  open("video");
  const sample = await screen.findByRole("region", { name: "Video and style sample" });
  const video = sample.querySelector("video");
  expect(video?.getAttribute("src")).toBe("http://slopify.test/api/style-preview/abc.mp4?v=1");
  expect(within(sample).queryByRole("button", { name: /^Make sample/ })).toBeNull();
});

it("plays the narration before and after levelling in one player, its levels on the choices' titles", async () => {
  const user = userEvent.setup();
  open("voice");
  const sample = await screen.findByRole("region", { name: "Narration sample" });
  expect(within(sample).getByText("Before levelling").getAttribute("title")).toBe("-19.4 LUFS");
  expect(within(sample).getByText("After levelling (YouTube loudness)").getAttribute("title")).toBe(
    "-14.0 LUFS",
  );
  // One play key in the column: the choice above it picks what it plays.
  const sources = () => [...sample.querySelectorAll("audio")].map((one) => one.getAttribute("src"));
  expect(sources()).toEqual([
    `http://slopify.test/api/template-studio/${templateId}/loudness/after.mp3?v=1`,
  ]);
  await user.click(within(sample).getByRole("button", { name: "Before levelling" }));
  expect(sources()).toEqual([
    `http://slopify.test/api/template-studio/${templateId}/loudness/before.mp3`,
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
  const sample = await screen.findByRole("region", { name: "Narration sample" });
  expect(
    within(sample).getByText(
      "Held back 1.2 LU from YouTube's -12.0 LUFS so its peaks stay under -2.5 dBTP.",
    ),
  ).not.toBeNull();
});

it("lists the schedule's next runs with their titles and the cost a month", async () => {
  open("schedule");
  const section = await screen.findByRole("region", { name: "Schedule settings" });
  const table = within(section).getByRole("table", { name: "The next runs" });
  expect(within(table).getByText("History: Salt roads")).not.toBeNull();
  expect(
    within(section).getByText("About $4.35 a month at most, for about 9 runs."),
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
          unpriced: [],
          problem: null,
          paused: { schedules: 1, runs: 8.7, high: 4.35 },
        },
      },
    }),
  });
  const section = await screen.findByRole("region", { name: "Schedule settings" });
  const table = within(section).getByRole("table", { name: "The next runs" });
  expect(within(table).getByText("Weekdays (paused)")).not.toBeNull();
  expect(
    within(section).getByText(
      "1 paused schedule uses this template: nothing runs while it is paused. Resumed, about $4.35 a month at most, for about 9 runs.",
    ),
  ).not.toBeNull();
});

it("starts a new schedule with this template picked", async () => {
  const user = userEvent.setup();
  let path = "";
  function Probe(): null {
    path = useLocation().href;
    return null;
  }
  renderRouted(
    <>
      <TemplateStudioPage templateId={templateId} section="schedule" />
      <Probe />
    </>,
    testDeps(routes),
  );
  await user.click(await screen.findByRole("button", { name: "New schedule" }));
  await waitFor(() => expect(path).toBe("/calendar?tab=schedules"));
  // One button does it: the section itself has none of its own.
  cleanup();
  open("schedule");
  await screen.findByRole("region", { name: "Schedule settings" });
  expect(screen.getAllByRole("button", { name: /^New schedule/ })).toHaveLength(1);
});

it("names the steps a scheduled run has no price for, and says the cost is the least, in whole runs", async () => {
  open("schedule", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      schedule: {
        runs: view.schedule.runs.map((run) => ({ ...run, topic: false, title: "{{Topic}}" })),
        cost: {
          runs: 30.4,
          high: 6.08,
          unknown: 2,
          unpriced: ["Narration descriptions", "Delivery cue overhead"],
          problem: null,
          paused: { schedules: 0, runs: 0, high: 0 },
        },
      },
    }),
  });
  const section = await screen.findByRole("region", { name: "Schedule settings" });
  expect(
    within(section).getByText(
      "At least $6.08 a month, for about 30 runs. Not counted, with no known price: Narration descriptions and Delivery cue overhead.",
    ),
  ).not.toBeNull();
  const table = within(section).getByRole("table", { name: "The next runs" });
  expect(within(table).getAllByText("No topic queued yet").length).toBeGreaterThan(0);
  expect(within(table).queryByText(/\{\{Topic\}\}/)).toBeNull();
});

it("shows where a run pauses and which AI checks run", async () => {
  open("reviews");
  const steps = await screen.findByRole("list", { name: "Where a run pauses" });
  expect(steps.textContent).toContain("Before the video");
  expect(steps.textContent).toContain("The run waits here until you approve it.");
});

it("asks for a version's free samples by itself once, and again from Make sample · free", async () => {
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
  const sample = await screen.findByRole("region", { name: "Video and style sample" });
  const make = within(sample).getByRole("button", { name: "Make sample · free" });
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
      "This template no longer exists; it may have been deleted. Go to Templates to see your templates.",
      404,
    ),
  });
  expect(
    await screen.findByText(
      "The samples weren't asked for: This template no longer exists; it may have been deleted. Go to Templates to see your templates. Press Make sample again.",
    ),
  ).not.toBeNull();
});

it("says a section's sample sentence once, beside the sample", async () => {
  open("script");
  await screen.findByRole("region", { name: "Article sample" });
  expect(
    screen.getAllByText("Make sample shows what this section makes, about the sample topic."),
  ).toHaveLength(1);
});

it("opens the sample's article in a wide reading drawer instead of the narrow column", async () => {
  const user = userEvent.setup();
  const article = `# The lighthouse\n\n${"The keeper climbed the stairs at dusk. ".repeat(40)}\n\n## Chapter 1\n\nThe lamp was lit.`;
  open("script", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      paid: { ...view.paid, projectId: "P1", revisionId: "R1", state: "done", article },
    }),
  });
  const sample = await screen.findByRole("region", { name: "Article sample" });
  expect(within(sample).queryByText("The lamp was lit.")).toBeNull();
  await user.click(within(sample).getByRole("button", { name: "Read the whole article" }));
  const drawer = await screen.findByRole("dialog", { name: "Sample article" });
  expect(within(drawer).getByText("The lamp was lit.")).not.toBeNull();
});

it("lists the names to check in the narration's sample only once its article names some", async () => {
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
  const sample = await screen.findByRole("region", { name: "Narration sample" });
  expect(await within(sample).findByRole("listitem", { name: "Kish" })).not.toBeNull();
  cleanup();
  open("voice", {
    [`GET /api/template-studio/${templateId}/pronunciations`]: jsonAnswer({
      names: [],
      aliasesOn: false,
      voice: null,
      problem: "The names to check come from the sample's article.",
    }),
  });
  const empty = await screen.findByRole("region", { name: "Narration sample" });
  await screen.findByText("Before levelling");
  expect(within(empty).queryByText("Names the voice may say wrong")).toBeNull();
});

const settledView: StudioView = {
  ...view,
  sections: view.sections.map((one) => ({
    ...one,
    state: one.id === "thumbnail" ? "off" : "current",
  })),
};

it("says in the More menu what to do before approving for schedules", async () => {
  const user = userEvent.setup();
  open();
  await user.click(await screen.findByRole("button", { name: "More for this template" }));
  const approve = await screen.findByRole("menuitem", {
    name: "Approve for schedules (fix 1 check first)",
  });
  expect(approve.getAttribute("aria-disabled")).toBe("true");
});

it("approves the version for schedules after saying they start running it", async () => {
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
  await user.click(await screen.findByRole("button", { name: "More for this template" }));
  await user.click(await screen.findByRole("menuitem", { name: "Approve for schedules" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Approve version 3 for schedules?",
  });
  expect(
    within(dialog).getByText(
      "Its schedules run this version from their next run. Until now they ran version 2.",
    ),
  ).not.toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Approve for schedules" }));
  await waitFor(() => expect(ready).toHaveBeenCalledOnce());
  expect(asked).toEqual({ version: 3 });
});

it("says schedules run each saved version until a first approval holds later ones back", async () => {
  const user = userEvent.setup();
  open("subject", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...settledView,
      gated: false,
      runnableVersion: 3,
    }),
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(passing),
  });
  expect(
    await screen.findByText("Weekly documentary · version 3 · Schedules run each version you save"),
  ).not.toBeNull();
  await user.click(await screen.findByRole("button", { name: "More for this template" }));
  await user.click(await screen.findByRole("menuitem", { name: "Approve for schedules" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Approve version 3 for schedules?",
  });
  expect(
    within(dialog).getByText(
      "Its schedules keep running this version. From now on a version you save waits for your approval before they run it, so an edit never changes the next run by itself.",
    ),
  ).not.toBeNull();
});

it("shows the approval's refusal with each thing to fix", async () => {
  const user = userEvent.setup();
  open("subject", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer(settledView),
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(passing),
    [`POST /api/template-studio/${templateId}/ready`]: jsonAnswer(
      {
        title: "Conflict",
        reason: "not-ready",
        detail: "Version 3 can't be approved yet. Narration: Press Make sample.",
        problems: [{ label: "Narration", sentence: "Press Make sample.", section: "voice" }],
      },
      409,
    ),
  });
  await user.click(await screen.findByRole("button", { name: "More for this template" }));
  await user.click(await screen.findByRole("menuitem", { name: "Approve for schedules" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Approve for schedules" }));
  expect(
    await screen.findByText("Version 3 can't be approved yet. Narration: Press Make sample."),
  ).not.toBeNull();
});

it("says an approved version is ready for schedules, with nothing to approve again", async () => {
  const user = userEvent.setup();
  open("subject", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...settledView,
      gate: "ready",
      runnableVersion: 3,
    }),
    [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(passing),
  });
  expect(
    await screen.findByText("Weekly documentary · version 3 · Ready for schedules"),
  ).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "More for this template" }));
  await screen.findByRole("menuitem", { name: "Versions" });
  expect(screen.queryByRole("menuitem", { name: /Approve/ })).toBeNull();
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
          unpriced: [],
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

it("makes a video from the saved template, and waits for a Save while something changed", async () => {
  const user = userEvent.setup();
  const applied = vi.fn(() => true);
  const instantiate = vi.fn(async (request: Request) => {
    expect(await request.json()).toMatchObject({ version: 3 });
    return Response.json({
      draft: {
        draft: {
          id: "55555555-5555-4555-8555-555555555555",
          version: 1,
          createdAt: "now",
          updatedAt: "now",
          document: freshDraftDocument,
        },
        attachments: [],
        review: null,
        pendingStart: null,
        start: null,
      },
    });
  });
  open(
    "video",
    { [`POST /api/project-templates/${templateId}/instantiate`]: instantiate },
    { onApplied: applied },
  );
  const make = await screen.findByRole("button", { name: "Make a video" });
  await user.click(screen.getByRole("radio", { name: "1:1 Square" }));
  expect(make.hasAttribute("disabled") || make.getAttribute("aria-disabled") === "true").toBe(true);
  expect(screen.getByText("Unsaved changes. Save them before you make a video.")).not.toBeNull();
  await user.click(screen.getByRole("radio", { name: "16:9 Landscape" }));
  await waitFor(() => expect(make.hasAttribute("disabled")).toBe(false));
  await user.click(make);
  await waitFor(() => expect(applied).toHaveBeenCalledOnce());
  expect(instantiate).toHaveBeenCalledOnce();
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
      { templateId, section: "Narration" },
    ),
  );
});

it("opens a design template's editor when the address names a design template", async () => {
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

it("says the template didn't open when the address names no template of either kind", async () => {
  renderRouted(
    <TemplateStudioPage templateId={templateId} section="subject" />,
    testDeps({
      [`GET /api/template-studio/${templateId}`]: problemAnswer(
        "This template no longer exists; it may have been deleted. Go to Templates to see your templates.",
        404,
      ),
      [`GET /api/design-templates/${templateId}`]: problemAnswer("No such design template.", 404),
    }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "This template didn't open: This template no longer exists",
  );
});

it("exports the version schedules run as a file from More, and says why when it can't", async () => {
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
          "content-disposition": 'attachment; filename="weekly-documentary.slopify-template.zip"',
        },
      }),
  });
  await user.click(await screen.findByRole("button", { name: "More for this template" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Export version 2 as a file (.zip)" }),
  );
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(create).toHaveBeenCalledTimes(1);
  click.mockRestore();
  cleanup();

  open("subject", {
    [`GET /api/template-studio/${templateId}/pack`]: problemAnswer(
      "Something in this template looks like an API key or a login token.",
      400,
    ),
  });
  await user.click(await screen.findByRole("button", { name: "More for this template" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Export version 2 as a file (.zip)" }),
  );
  expect(
    await screen.findByText("Something in this template looks like an API key or a login token."),
  ).not.toBeNull();
});

it("shows the samples an imported template came with", async () => {
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
  const section = await screen.findByRole("region", { name: "Samples it came with" });
  expect(within(section).getByRole("img", { name: "The thumbnail it came with" })).not.toBeNull();
  expect(within(section).getByText(/Your own samples replace these/)).not.toBeNull();
});

it("turns a site on in YouTube description and posts with its defaults, saved with the template", async () => {
  const user = userEvent.setup();
  const saved: unknown[] = [];
  open("upload", {
    "GET /api/prompts": jsonAnswer({
      prompts: [{ id: "q1", kind: "post", name: "Hooky", body: "b", slots: [], updatedAt: "x" }],
    }),
    [`POST /api/template-studio/${templateId}/save`]: async (request: Request) => {
      saved.push(
        ((await request.json()) as { document: { form: { social?: unknown } } }).document.form
          .social,
      );
      return Response.json({
        template: { ...view.template, version: 4 },
        sample: "skipped",
        quote: null,
        replayed: false,
      });
    },
  });
  const postTo = (await screen.findAllByRole("group", { name: "Post to" }))[0];
  if (postTo === undefined) throw new Error("The section has a Post to row.");
  await user.click(within(postTo).getByRole("checkbox", { name: "Bluesky" }));
  const bluesky = (await screen.findAllByRole("region", { name: "Bluesky post" }))[0];
  if (bluesky === undefined) throw new Error("Bluesky's settings show once it is on.");
  expect((within(bluesky).getByLabelText("Bluesky text") as HTMLSelectElement).value).toBe(
    "summary",
  );
  await user.selectOptions(within(bluesky).getByLabelText("Bluesky text"), "prompt");
  await user.selectOptions(within(bluesky).getByLabelText("Post prompt"), "Hooky");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(saved.at(-1)).toEqual({
      bluesky: {
        text: "prompt",
        prompt: "Hooky",
        media: { pictures: 4 },
        hashtags: 2,
        link: false,
      },
    }),
  );
});

it("shows the sample's posts as each site shows them", async () => {
  open("upload", {
    [`GET /api/template-studio/${templateId}`]: jsonAnswer({
      ...view,
      paid: { ...view.paid, projectId: "P1", revisionId: "R1", state: "done" },
    }),
    "GET /api/social/packs/P1": jsonAnswer(packs([{ ...xPack, projectId: "P1" }])),
  });
  const preview = await screen.findByRole("region", { name: "X post preview" });
  expect(within(preview).getByText("A fox ran. #fox #cliff")).not.toBeNull();
  expect(within(preview).getByLabelText("X length").textContent).toBe(
    "22 / 280 · links count as 23",
  );
});
