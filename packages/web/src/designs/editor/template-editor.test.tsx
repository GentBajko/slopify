import type { DesignDocument } from "@app/slices/designs/schema.js";
import type { CostEstimate } from "@app/slices/estimate/index.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { type Answer, jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import type { SampleView, TemplateView } from "../api";
import { blankTemplate } from "../document";
import { DesignTemplateRoute } from "./template-editor";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

const at = "2026-10-18T10:00:00.000Z";
const quote = (
  high: number,
  extra: Record<string, unknown> = {},
): CostEstimate & Record<string, unknown> => ({
  currency: "USD",
  rows: [],
  low: high,
  high,
  unknown: 0,
  expectedWords: 0,
  catalogueDate: null,
  assumptions: [],
  ...extra,
});

function template(
  patch: Partial<TemplateView> = {},
  doc: DesignDocument = blankTemplate(),
): TemplateView {
  return {
    id: "t1",
    channelId: "c1",
    headVersion: 2,
    name: "Gig poster",
    document: doc,
    gate: "unchecked",
    checks: [],
    readyVersion: null,
    versions: [],
    createdAt: at,
    updatedAt: at,
    sample: null,
    ...patch,
  };
}

const done: SampleView = {
  state: "done",
  version: 2,
  designId: "s1",
  heldReason: null,
  quotedHigh: 0.04,
};

function deps(view: TemplateView, extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({
    "GET /api/design-templates/t1": jsonAnswer(view),
    "POST /api/design-templates/t1/quote": jsonAnswer(
      quote(0.04, { sections: ["picture"], makesPicture: true }),
    ),
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
    "GET /api/fonts": jsonAnswer({ fonts: [] }),
    "GET /api/schedules": jsonAnswer({ schedules: [] }),
    ...extra,
  });
}

// The settings on show in the open section: fields, groups of fields and the model line, not
// counting what is folded away or a field inside a group.
function visibleSettings(): number {
  const section = screen.getByRole("region", { name: /^(Picture|Text layout|Formats|Schedule)$/ });
  const all = [
    ...section.querySelectorAll<HTMLElement>("[data-slot='field'], fieldset, [data-setting]"),
  ];
  return all.filter(
    (one) =>
      one.closest("details") === null && !all.some((other) => other !== one && other.contains(one)),
  ).length;
}

const saveButton = () => screen.getByRole("button", { name: /^Save( ·|$)/ });
const words = (button: HTMLElement) => button.firstChild?.textContent;

describe("the design template editor", () => {
  it("has four sections, each with at most four settings on show", async () => {
    const user = userEvent.setup();
    renderRouted(<DesignTemplateRoute templateId="t1" />, deps(template()));
    const rail = await screen.findByText("Picture", { selector: "span" });
    expect(rail).not.toBeNull();
    for (const name of ["Picture", "Text layout", "Formats", "Schedule"]) {
      await user.click(screen.getByRole("button", { name }));
      await screen.findByRole("region", { name });
      expect(visibleSettings()).toBeGreaterThan(0);
      expect(visibleSettings()).toBeLessThanOrEqual(4);
    }
  });

  it("prices a Save: free when only the text changed, the artwork when the picture did", async () => {
    const user = userEvent.setup();
    let saved: Record<string, unknown> | undefined;
    renderRouted(
      <DesignTemplateRoute templateId="t1" />,
      deps(template({ sample: done }), {
        "POST /api/design-templates/t1/quote": async (request) => {
          const body = (await request.json()) as { document: DesignDocument };
          const picture = body.document.picture.prompt !== blankTemplate().picture.prompt;
          return jsonAnswer(
            picture
              ? quote(0.04, { sections: ["picture"], makesPicture: true })
              : quote(0, { sections: ["text"], makesPicture: false }),
          )(request);
        },
        "PUT /api/design-templates/t1": async (request) => {
          saved = (await request.json()) as Record<string, unknown>;
          return jsonAnswer({ template: template({ headVersion: 3 }), saved: true, sample: done })(
            request,
          );
        },
      }),
    );
    expect(words(await waitFor(saveButton))).toBe("Save");
    expect(saveButton().getAttribute("aria-disabled")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Text layout" }));
    await user.click(screen.getByRole("button", { name: "Centre" }));
    await waitFor(() => expect(words(saveButton())).toBe("Save · free"));
    await user.click(screen.getByRole("button", { name: "Picture" }));
    await user.type(screen.getByLabelText("Describe the artwork"), " at night");
    await waitFor(() => expect(words(saveButton())).toBe("Save · about $0.04"));
    await user.click(saveButton());
    await waitFor(() =>
      expect(saved).toMatchObject({ baseVersion: 2, sample: "make", acknowledgedHigh: 0.04 }),
    );
    expect(await screen.findByText("Saved as version 3.")).not.toBeNull();
  });

  it("shows the sample, and makes a held one at its price on Make sample", async () => {
    const user = userEvent.setup();
    let asked: unknown;
    renderRouted(
      <DesignTemplateRoute templateId="t1" />,
      deps(
        template({
          sample: {
            state: "held",
            version: 2,
            designId: "s1",
            heldReason:
              "Waiting: this sample now costs about $0.04, more than the $0.00 you saw. Press Make sample ($0.04) to make it.",
            quotedHigh: 0.04,
          },
        }),
        {
          "POST /api/design-templates/t1/sample": async (request) => {
            asked = await request.json();
            return jsonAnswer({ ...done, state: "making" }, 202)(request);
          },
        },
      ),
    );
    const panel = await screen.findByRole("region", { name: "Sample" });
    expect(within(panel).getByText(/Waiting: this sample now costs/)).not.toBeNull();
    const make = await within(panel).findByRole("button", { name: "Make sample · about $0.04" });
    await user.click(make);
    await waitFor(() => expect(asked).toEqual({ version: 2, acknowledgedHigh: 0.04 }));
  });

  it("draws a finished sample from the sample design", async () => {
    renderRouted(<DesignTemplateRoute templateId="t1" />, deps(template({ sample: done })));
    const image = await screen.findByRole("img", { name: "Sample of Gig poster, Poster A4" });
    expect(image.getAttribute("src")).toContain("/api/designs/s1/files/a4.png?v=2");
  });

  it("lists what Mark ready found, each with the section to open", async () => {
    const user = userEvent.setup();
    renderRouted(
      <DesignTemplateRoute templateId="t1" />,
      deps(template(), {
        "POST /api/design-templates/t1/ready": () =>
          new Response(
            JSON.stringify({
              title: "Conflict",
              status: 409,
              detail: "Version 2 can't be marked ready yet: {{Place}} has no sample value.",
              reason: "not-ready",
              checks: [
                {
                  id: "samples",
                  ok: false,
                  sentence: "{{Place}} has no sample value. Fill it in under Text → Sample values.",
                  fix: { label: "Open", href: "/library/design-templates/t1#text" },
                },
              ],
            }),
            { status: 409, headers: { "content-type": "application/problem+json" } },
          ),
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Mark ready" }));
    expect(await screen.findByText(/{{Place}} has no sample value. Fill it in/)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Open Text layout" }));
    expect(await screen.findByRole("region", { name: "Text layout" })).not.toBeNull();
  });

  it("starts a schedule from rows, each with its date", async () => {
    const user = userEvent.setup();
    let created: Record<string, unknown> | undefined;
    const doc: DesignDocument = {
      ...blankTemplate(),
      schedule: { dateField: "Date", daysBefore: 7, time: "09:00" },
    };
    renderRouted(
      <DesignTemplateRoute templateId="t1" />,
      deps(template({ readyVersion: 2 }, doc), {
        "POST /api/schedules": async (request) => {
          created = (await request.json()) as Record<string, unknown>;
          return problemAnswer("Stopped here: this test reads only what was sent.", 409)(request);
        },
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Schedule" }));
    await user.click(screen.getByRole("button", { name: "Add a row" }));
    const date = screen.getByLabelText("Date of row 1");
    expect(date.getAttribute("type")).toBe("date");
    await user.type(screen.getByLabelText("Event of row 1"), "Late Set");
    await user.type(date, "2026-11-14");
    await user.click(screen.getByRole("button", { name: "Start the schedule" }));
    await waitFor(() =>
      expect(created).toMatchObject({
        templateKind: "design",
        templateId: "t1",
        cadence: { kind: "by-date", time: "09:00" },
        topicGeneration: { mode: "off" },
        items: [{ title: "Late Set", values: { Event: "Late Set", Date: "2026-11-14" } }],
      }),
    );
  });
});
