import type { DesignView } from "@app/slices/designs/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { DesignsRoute, type DesignsTab } from "./designs-route";
import { blankTemplate } from "./document";
import { ProjectDesigns } from "./project-designs";
import { StartFromPicture } from "./start";

afterEach(cleanup);

const at = "2026-10-18T10:00:00.000Z";
const view = (id: string, name: string, kind: DesignView["kind"] = "edit"): DesignView => ({
  id,
  kind,
  name,
  channelId: "c1",
  projectId: null,
  templateId: null,
  templateVersion: null,
  scheduleId: null,
  scheduleRunId: null,
  document: null,
  values: {},
  headStepId: `${id}-s1`,
  sampleOf: null,
  createdAt: at,
  updatedAt: at,
  deletedAt: null,
  steps: [
    {
      id: `${id}-s1`,
      designId: id,
      n: 1,
      parentId: null,
      kind: "upload",
      instruction: null,
      provider: null,
      model: null,
      inputs: { castMemberIds: [] },
      state: "ready",
      error: null,
      sha256: "a".repeat(64),
      width: 800,
      height: 800,
      createdAt: at,
      settledAt: at,
    },
  ],
});

function deps(extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({
    "GET /api/designs": jsonAnswer({ designs: [view("d1", "Band photo")] }),
    "GET /api/design-templates": jsonAnswer({
      templates: [
        {
          id: "t1",
          channelId: "c1",
          headVersion: 3,
          name: "Gig poster",
          document: blankTemplate(),
          gate: "ready",
          checks: [],
          readyVersion: 2,
          versions: [],
          createdAt: at,
          updatedAt: at,
        },
      ],
    }),
    ...extra,
  });
}

describe("Library → Designs", () => {
  it("shows the designs with their pictures, and the templates on their own tab", async () => {
    function Harness() {
      const [tab, setTab] = useState<DesignsTab>("designs");
      return <DesignsRoute tab={tab} onTab={setTab} />;
    }
    renderRouted(<Harness />, deps());
    const grid = await screen.findByRole("list", { name: "Designs" });
    expect(within(grid).getByRole("img", { name: "Band photo" }).getAttribute("src")).toContain(
      "/api/designs/d1/steps/d1-s1/picture",
    );
    expect(screen.getByRole("button", { name: "Edit a picture" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Design a poster" })).not.toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Templates" }));
    const list = await screen.findByRole("list", { name: "Design templates" });
    expect(within(list).getByText("Ready · v2")).not.toBeNull();
    expect(screen.getByRole("button", { name: "New design template" })).not.toBeNull();
  });

  it("deletes a design from its tile", async () => {
    let deleted = false;
    renderRouted(
      <DesignsRoute tab="designs" onTab={() => {}} />,
      deps({
        "DELETE /api/designs/d1": () => {
          deleted = true;
          return new Response(null, { status: 204 });
        },
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Delete Band photo" }));
    await waitFor(() => expect(deleted).toBe(true));
  });

  it("says what failed when a picture can't be used", async () => {
    renderRouted(
      <DesignsRoute tab="designs" onTab={() => {}} />,
      deps({
        "POST /api/designs/pictures": () =>
          new Response(
            JSON.stringify({
              title: "Bad Request",
              status: 400,
              detail: "This file isn't a PNG or JPEG picture. Save it as one and upload it again.",
              reason: "not-an-image",
            }),
            { status: 400, headers: { "content-type": "application/problem+json" } },
          ),
      }),
    );
    await screen.findByRole("list", { name: "Designs" });
    await userEvent.upload(
      screen.getByLabelText("Picture to edit"),
      new File(["x"], "notes.png", { type: "image/png" }),
    );
    expect(await screen.findByText(/isn't a PNG or JPEG picture/)).not.toBeNull();
  });
});

describe("Create's way to start from a picture", () => {
  it("designs a poster without a project", async () => {
    let made: Record<string, unknown> | undefined;
    renderRouted(
      <StartFromPicture />,
      testDeps({
        "POST /api/designs": async (request) => {
          made = (await request.json()) as Record<string, unknown>;
          return jsonAnswer(view("d9", "New poster", "design"), 201)(request);
        },
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Design a poster" }));
    await waitFor(() =>
      expect(made).toMatchObject({
        kind: "design",
        name: "New poster",
        document: { picture: { source: "generate" } },
      }),
    );
    expect(made?.projectId).toBeUndefined();
    expect(screen.getByRole("button", { name: "Edit a picture" })).not.toBeNull();
  });
});

describe("a project's designs", () => {
  it("lists the designs kept with the project, and starts one for it", async () => {
    let made: Record<string, unknown> | undefined;
    renderRouted(
      <ProjectDesigns projectId="p1" open onClose={() => {}} />,
      testDeps({
        "GET /api/designs": (request) => {
          expect(new URL(request.url).searchParams.get("projectId")).toBe("p1");
          return jsonAnswer({ designs: [view("d1", "Episode poster", "design")] })(request);
        },
        "POST /api/designs": async (request) => {
          made = (await request.json()) as Record<string, unknown>;
          return jsonAnswer(view("d2", "New poster", "design"), 201)(request);
        },
      }),
    );
    const list = await screen.findByRole("list", { name: "The project's designs" });
    expect(within(list).getByRole("link", { name: "Episode poster" })).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Design a poster" }));
    await waitFor(() => expect(made).toMatchObject({ projectId: "p1", kind: "design" }));
  });
});
