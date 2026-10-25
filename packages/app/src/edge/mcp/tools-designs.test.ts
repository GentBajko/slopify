import { afterEach, expect, it } from "vitest";
import { assistantCostlyTools } from "../../slices/assistant/gate.js";
import { pngOf } from "../../slices/designs/designs.fake.js";
import { connectAgent, mcpFixture } from "./mcp.fake.js";
import { designTools } from "./tools-designs.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

const textOf = (result: object): string =>
  ("content" in result && Array.isArray(result.content)
    ? (result.content as { text?: string }[])
    : []
  )
    .map((part) => part.text ?? "")
    .join("");

it("uploads a picture as bytes, starts an edit from it and lists it", async () => {
  const h = mcpFixture({ designs: true });
  open.push(h);
  const agent = await connectAgent(h.app);
  const uploaded = await agent.callTool({
    name: "upload_design_picture",
    arguments: {
      file: {
        name: "me.png",
        contentType: "image/png",
        base64: Buffer.from(pngOf(640, 480)).toString("base64"),
      },
    },
  });
  const { sha256 } = JSON.parse(textOf(uploaded)) as { sha256: string };
  const made = await agent.callTool({
    name: "create_design",
    arguments: {
      body: {
        id: "d1",
        mutationId: "mutation-0001",
        kind: "edit",
        name: "Me",
        fromStepSha: sha256,
      },
    },
  });
  expect(made.isError).toBeUndefined();
  const listed = JSON.parse(
    textOf(await agent.callTool({ name: "list_designs", arguments: {} })),
  ) as {
    designs: { id: string; steps: { width: number }[] }[];
  };
  expect(listed.designs.map((design) => [design.id, design.steps[0]?.width])).toEqual([
    ["d1", 640],
  ]);
  const edit = await agent.callTool({
    name: "edit_design_picture",
    arguments: {
      id: "d1",
      body: {
        mutationId: "edit-000001",
        fromStepId: "x",
        instruction: "Darker",
        provider: "fal",
        model: "fal-ai/flux-2",
        acknowledgedHigh: 0.06,
      },
    },
  });
  expect(edit.isError).toBe(true);
  expect(textOf(edit)).toContain("The version to edit has no picture yet.");
});

it("asks for confirmed: true before marking a template version ready", async () => {
  const h = mcpFixture({ designs: true });
  open.push(h);
  const agent = await connectAgent(h.app);
  expect(agent.getInstructions()).toContain("never show in needs_attention");
  expect(agent.getInstructions()).toContain("needs the acknowledgedHigh its quote tool gave");
  const unconfirmed = await agent.callTool({
    name: "mark_design_template_ready",
    arguments: { id: "t1", body: { version: 1 } },
  });
  expect(unconfirmed.isError).toBe(true);
  expect(textOf(unconfirmed)).toContain("Schedules start making posters from this version.");
});

it("says Try again is paid again, with the acknowledgement it needs, and the assistant asks first", () => {
  const retry = designTools.find((tool) => tool.name === "retry_design_step");
  expect(retry?.description).toContain("paid again");
  expect(retry?.description).toContain("acknowledgedHigh");
  expect(retry?.description).toContain("acknowledgedUnknown: true");
  expect(assistantCostlyTools).toContain("retry_design_step");
});
