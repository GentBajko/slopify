import type { DesignStep, DesignView } from "@app/slices/designs/model.js";
import type { CostEstimate } from "@app/slices/estimate/index.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { DesignRoute } from "./design-page";
import { blankDocument } from "./document";

afterEach(cleanup);

const at = "2026-10-18T10:00:00.000Z";
const step = (n: number, patch: Partial<DesignStep> = {}): DesignStep => ({
  id: `s${String(n)}`,
  designId: "d1",
  n,
  parentId: n === 1 ? null : `s${String(n - 1)}`,
  kind: n === 1 ? "upload" : "edit",
  instruction: n === 1 ? null : "Warmer light",
  provider: n === 1 ? null : "fal",
  model: n === 1 ? null : "fal-ai/flux-2",
  inputs: { castMemberIds: [] },
  state: "ready",
  error: null,
  sha256: "a".repeat(64),
  width: 1080,
  height: 1080,
  createdAt: at,
  settledAt: at,
  ...patch,
});

function design(patch: Partial<DesignView> = {}): DesignView {
  return {
    id: "d1",
    kind: "edit",
    name: "Band photo",
    channelId: "c1",
    projectId: null,
    templateId: null,
    templateVersion: null,
    scheduleId: null,
    scheduleRunId: null,
    document: null,
    values: {},
    headStepId: "s2",
    sampleOf: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    steps: [step(1), step(2)],
    ...patch,
  };
}

const quote = (high: number): CostEstimate => ({
  currency: "USD",
  rows: [],
  low: high,
  high,
  unknown: 0,
  expectedWords: 0,
  catalogueDate: null,
  assumptions: [],
});

function deps(view: DesignView, extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({
    "GET /api/designs/d1": jsonAnswer(view),
    "POST /api/designs/d1/quote": jsonAnswer(quote(0.04)),
    "POST /api/designs/d1/artwork/quote": jsonAnswer(quote(0.04)),
    "GET /api/providers": jsonAnswer({
      providers: [
        {
          id: "fal",
          family: "image",
          displayName: "fal.ai",
          readiness: { kind: "keyed", hasKey: true },
        },
      ],
    }),
    "GET /api/providers/fal/models": jsonAnswer({
      models: [{ id: "fal-ai/flux-2", name: "FLUX.2" }],
      allowsCustom: false,
    }),
    "GET /api/projects": jsonAnswer({ projects: [] }),
    "GET /api/fonts": jsonAnswer({ fonts: [] }),
    ...extra,
  });
}

const primary = () => screen.getByRole("button", { name: /^(Edit|Make artwork) · / });
// The button's words, without the hidden reason a disabled one carries.
const label = () => primary().firstChild?.textContent;

describe("a design's page", () => {
  it("shows the newest version, and the one before it with Before", async () => {
    const user = userEvent.setup();
    renderRouted(<DesignRoute designId="d1" />, deps(design()));
    const picture = await screen.findByRole("img", { name: "Version 2 of Band photo" });
    expect(picture.getAttribute("src")).toContain("/steps/s2/picture");
    await user.click(screen.getByRole("button", { name: "Before" }));
    expect(
      screen.getByRole("img", { name: "Version 1 of Band photo" }).getAttribute("src"),
    ).toContain("/steps/s1/picture");
  });

  it("shows a designed piece as drawn with its text, in the format picked", async () => {
    const user = userEvent.setup();
    const doc = {
      ...blankDocument("picture"),
      formats: [{ format: "a4" as const }, { format: "square" as const }],
    };
    renderRouted(
      <DesignRoute designId="d1" />,
      deps(design({ kind: "design", name: "Jazz night", document: doc })),
    );
    const drawn = await screen.findByRole("img", { name: "Jazz night as drawn, Poster A4" });
    expect(drawn.getAttribute("src")).toContain(
      `/api/designs/d1/files/a4.png?v=${encodeURIComponent(at)}`,
    );
    await user.selectOptions(screen.getByLabelText("Format shown"), "square");
    expect(
      screen.getByRole("img", { name: "Jazz night as drawn, Square 1:1" }).getAttribute("src"),
    ).toContain("/files/square.png");
    // Before is the bare picture the edit started from.
    await user.click(screen.getByRole("button", { name: "Before" }));
    expect(screen.getByRole("img", { name: "Version 1 of Jazz night" })).not.toBeNull();
  });

  it("carries only the open tab's actions in the bar", async () => {
    const user = userEvent.setup();
    renderRouted(
      <DesignRoute designId="d1" />,
      deps(design({ kind: "design", document: blankDocument("picture") })),
    );
    await waitFor(() => expect(primary()).not.toBeNull());
    await user.click(screen.getByRole("tab", { name: "Text" }));
    expect(screen.queryByRole("button", { name: /^(Edit|Make artwork) · / })).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Formats" }));
    expect(screen.queryByRole("button", { name: /^(Edit|Make artwork) · / })).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Edit" }));
    expect(primary()).not.toBeNull();
  });

  it("can't show Before for a picture with no version before it", async () => {
    renderRouted(
      <DesignRoute designId="d1" />,
      deps(design({ steps: [step(1)], headStepId: "s1" })),
    );
    await screen.findByRole("img", { name: "Version 1 of Band photo" });
    expect(screen.getByRole("button", { name: "Before" }).hasAttribute("disabled")).toBe(true);
  });

  it("continues from an earlier version, for free", async () => {
    const user = userEvent.setup();
    let asked: unknown;
    renderRouted(
      <DesignRoute designId="d1" />,
      deps(design(), {
        "PUT /api/designs/d1/head": async (request) => {
          asked = await request.json();
          return jsonAnswer(design({ headStepId: "s1" }))(request);
        },
      }),
    );
    const versions = await screen.findByRole("list", { name: "Versions" });
    const buttons = within(versions).getAllByRole("button", { name: "Continue from here" });
    // Newest first: the current version can't be continued from again.
    expect(buttons[0]?.hasAttribute("disabled")).toBe(true);
    await user.click(buttons[1] as HTMLElement);
    await waitFor(() => expect(asked).toEqual({ stepId: "s1" }));
    expect(await screen.findByText("The next edit starts from that version.")).not.toBeNull();
  });

  it("keeps the paid Edit on screen with its price, and starts it at the price shown", async () => {
    const user = userEvent.setup();
    let sent: Record<string, unknown> | undefined;
    renderRouted(
      <DesignRoute designId="d1" />,
      deps(design(), {
        "POST /api/designs/d1/edit": async (request) => {
          sent = (await request.json()) as Record<string, unknown>;
          return jsonAnswer(
            design({ steps: [step(1), step(2), step(3, { state: "making", sha256: null })] }),
            202,
          )(request);
        },
      }),
    );
    await waitFor(() => expect(label()).toBe("Edit · about $0.04"));
    expect(primary().getAttribute("aria-disabled")).toBe("true");
    await user.type(screen.getByLabelText("What to change"), "Make the sky a sunset");
    expect(primary().getAttribute("aria-disabled")).toBeNull();
    await user.click(primary());
    await waitFor(() =>
      expect(sent).toMatchObject({
        fromStepId: "s2",
        instruction: "Make the sky a sunset",
        provider: "fal",
        model: "fal-ai/flux-2",
        acknowledgedHigh: 0.04,
      }),
    );
    // While the new version is made the button stays, disabled.
    await waitFor(() =>
      expect(screen.getByText(/Making version 3 with fal-ai\/flux-2/)).not.toBeNull(),
    );
    expect(primary().getAttribute("aria-disabled")).toBe("true");
  });

  it("shows the new price when it changed, and the server's sentence", async () => {
    const user = userEvent.setup();
    renderRouted(
      <DesignRoute designId="d1" />,
      deps(design(), {
        "POST /api/designs/d1/edit": () =>
          new Response(
            JSON.stringify({
              title: "Conflict",
              status: 409,
              detail: "The price changed since you looked: this edit now costs up to $0.06.",
              reason: "cost-changed",
              quote: quote(0.06),
            }),
            { status: 409, headers: { "content-type": "application/problem+json" } },
          ),
      }),
    );
    await waitFor(() => expect(label()).toBe("Edit · about $0.04"));
    await user.type(screen.getByLabelText("What to change"), "Brighter");
    await user.click(primary());
    expect(await screen.findByText(/The price changed since you looked/)).not.toBeNull();
    expect(label()).toBe("Edit · about $0.06");
  });

  it("offers Try again for a version that failed, at its price", async () => {
    const user = userEvent.setup();
    let retried: unknown = false;
    renderRouted(
      <DesignRoute designId="d1" />,
      deps(
        design({
          steps: [
            step(1),
            step(2),
            step(3, {
              state: "failed",
              sha256: null,
              error: "The picture couldn't be made: The model is busy. Press Try again.",
            }),
          ],
        }),
        {
          "POST /api/designs/d1/steps/s3/retry": async (request) => {
            retried = await request.clone().json();
            return jsonAnswer(design(), 202)(request);
          },
        },
      ),
    );
    await screen.findAllByText(/The model is busy/);
    const bar = document.querySelector("[data-slot='action-bar']") as HTMLElement;
    expect(within(bar).getByText(/The model is busy/)).not.toBeNull();
    await user.click(within(bar).getByRole("button", { name: "Try again" }));
    // Asking again is paid again: the first press says the price, the second pays it.
    await within(bar).findByText(/is paid again/);
    expect(retried).toBe(false);
    await user.click(within(bar).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(retried).toMatchObject({ acknowledgedHigh: expect.any(Number) }));
  });

  it("warns that the AI may misspell the text it draws", async () => {
    const user = userEvent.setup();
    renderRouted(
      <DesignRoute designId="d1" />,
      deps(design({ kind: "design", document: blankDocument("picture") }), {
        "PUT /api/designs/d1": (request) => jsonAnswer(design({ kind: "design" }))(request),
      }),
    );
    await user.click(await screen.findByRole("tab", { name: "Text" }));
    expect(screen.queryByText(/may misspell/)).toBeNull();
    await user.click(screen.getByRole("switch", { name: "Let the AI draw the text" }));
    expect(
      screen.getByText(
        "The AI may misspell names, dates and prices. Check every word before you print.",
      ),
    ).not.toBeNull();
  });

  it("downloads each chosen format, PNG and PDF where a PDF is offered", async () => {
    const user = userEvent.setup();
    const doc = blankDocument("picture");
    renderRouted(
      <DesignRoute designId="d1" />,
      deps(
        design({
          kind: "design",
          document: {
            ...doc,
            formats: [
              { format: "a4", focus: { x: 0.5, y: 0.5 } },
              { format: "square", focus: { x: 0.5, y: 0.5 } },
            ],
          },
        }),
      ),
    );
    await user.click(await screen.findByRole("tab", { name: "Formats" }));
    expect(
      screen.getByRole("link", { name: "Download Poster A4 PNG" }).getAttribute("href"),
    ).toMatch(/\/api\/designs\/d1\/files\/a4\.png\?v=/);
    expect(
      screen.getByRole("link", { name: "Download Poster A4 PDF" }).getAttribute("href"),
    ).toMatch(/\/files\/a4\.pdf/);
    expect(screen.getByRole("link", { name: "Download Square 1:1 PNG" })).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Download Square 1:1 PDF" })).toBeNull();
  });

  it("asks a picture edit to become a designed piece before it has text or formats", async () => {
    const user = userEvent.setup();
    renderRouted(<DesignRoute designId="d1" />, deps(design()));
    await user.click(await screen.findByRole("tab", { name: "Text" }));
    expect(screen.getByRole("button", { name: "Turn into a designed piece" })).not.toBeNull();
  });
});
