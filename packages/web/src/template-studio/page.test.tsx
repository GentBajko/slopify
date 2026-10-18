import { templateSections } from "@app/slices/template-studio/model.js";
import type { StudioView } from "@app/slices/template-studio/schema.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { freshDraftDocument } from "@/play/draft-state";
import { jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { TemplateStudioPage } from "./page";

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
      id === "thumbnail" ? "The thumbnail is off." : "No sample yet. Press Save to make one.",
  })),
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

it("lists the free checks, each failing one with its fix as a link", async () => {
  open();
  const checks = await screen.findByRole("region", { name: "Checks" });
  expect(within(checks).getByText("1 to fix")).not.toBeNull();
  expect(
    within(checks).getByRole("link", { name: "Choose one in Voice" }).getAttribute("href"),
  ).toBe(`/templates/${templateId}?section=voice`);
});

it("saves a change through the template's own PUT as the next version", async () => {
  const user = userEvent.setup();
  const sent = vi.fn(async (request: Request) => {
    const body = (await request.json()) as { baseVersion: number; document: typeof document };
    expect(body.baseVersion).toBe(3);
    expect(body.document.form.format).toBe("9:16");
    return Response.json({ ...view.template, version: 4, document: body.document });
  });
  open("video", { [`PUT /api/project-templates/${templateId}`]: sent });
  const save = await screen.findByRole("button", { name: "Save" });
  expect(save.hasAttribute("disabled")).toBe(true);
  await user.click(screen.getByRole("button", { name: "Vertical 9:16" }));
  expect(screen.getByText("Unsaved changes.")).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent).toHaveBeenCalledOnce());
});

it("says why a save was refused, in the server's words", async () => {
  const user = userEvent.setup();
  open("video", {
    [`PUT /api/project-templates/${templateId}`]: () =>
      Response.json(
        {
          title: "Conflict",
          status: 409,
          detail:
            "This template or its project changed while you were editing. Reload the page to see the latest, then make your change again.",
          reason: "conflict",
        },
        { status: 409 },
      ),
  });
  await user.click(await screen.findByRole("button", { name: "Square 1:1" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(
    await screen.findByText(
      "The template wasn't saved: This template or its project changed while you were editing. Reload the page to see the latest, then make your change again.",
    ),
  ).not.toBeNull();
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
