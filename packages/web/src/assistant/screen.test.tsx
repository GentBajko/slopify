import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderRouted, testDeps } from "@/test-app";
import {
  AssistantScreenProvider,
  screenOf,
  useAssistantContext,
  useAssistantScreen,
  useAssistantSelection,
} from "./screen";

afterEach(cleanup);

describe("screenOf", () => {
  it("reads the project, schedule, channel and template from the address", () => {
    expect(screenOf("/projects/p1", { tab: "narration" })).toEqual({
      path: "/projects/p1",
      projectId: "p1",
      section: "narration",
    });
    expect(screenOf("/channels/c1", {})).toMatchObject({ channelId: "c1" });
    expect(screenOf("/schedules/s1", {})).toMatchObject({ scheduleId: "s1" });
    expect(screenOf("/calendar", { tab: "schedules", schedule: "s2" })).toMatchObject({
      scheduleId: "s2",
      section: "schedules",
    });
    expect(screenOf("/templates", { item: "t1" })).toMatchObject({ templateId: "t1" });
    expect(screenOf("/settings", { section: "providers" })).toEqual({
      path: "/settings",
      section: "providers",
    });
  });

  it("lets an editor name its template and section, and caps the selection", () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      id: `p${String(index)}`,
      label: "x".repeat(300),
    }));
    const read = screenOf(
      "/library",
      {},
      { templateId: "t9", section: "Upload pack" },
      {
        kind: "project",
        rows,
      },
    );
    expect(read).toMatchObject({ templateId: "t9", section: "Upload pack" });
    expect(read.selection).toHaveLength(20);
    expect(read.selection?.[0]?.label).toHaveLength(200);
  });

  it("leaves out ids the server would refuse", () => {
    expect(
      screenOf("/projects/a%2Fb", {}, {}, { kind: "project", rows: [{ id: "../x", label: "" }] }),
    ).toEqual({
      path: "/projects/a%2Fb",
    });
  });
});

function Probe(): ReactElement {
  return <output>{JSON.stringify(useAssistantScreen())}</output>;
}
function Selects({ rows }: { readonly rows: readonly { id: string; label: string }[] }) {
  useAssistantSelection("project", rows);
  return null;
}
function Edits() {
  useAssistantContext({ templateId: "t1", section: "Narration" });
  return null;
}

describe("useAssistantScreen", () => {
  it("adds what a list selected and an editor names, while they show", async () => {
    const view = renderRouted(
      <AssistantScreenProvider>
        <Selects rows={[{ id: "p1", label: "Rope" }]} />
        <Edits />
        <Probe />
      </AssistantScreenProvider>,
      testDeps({}),
    );
    const shown = await screen.findByText(/"path":"\/"/);
    expect(JSON.parse(shown.textContent ?? "{}")).toEqual({
      path: "/",
      templateId: "t1",
      section: "Narration",
      selection: [{ kind: "project", id: "p1", label: "Rope" }],
    });
    view.unmount();
  });

  it("is a no-op without the provider", () => {
    expect(() => render(<Selects rows={[{ id: "p1", label: "Rope" }]} />)).not.toThrow();
  });
});
