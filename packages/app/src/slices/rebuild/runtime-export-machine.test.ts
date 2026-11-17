import { describe, expect, it } from "vitest";
import { type ExportExecutionDeps, exportMachine, warningsOf } from "./runtime-export.js";

const machine = {
  encode: { kind: "x264", clipSpeed: "fast" },
  priority: "background",
} as const;

describe("exportMachine", () => {
  it("renders as before when no render settings are wired", async () => {
    const chosen = await exportMachine({} as ExportExecutionDeps, "p1");
    expect(chosen.machine).toBeUndefined();
    expect(chosen.notices).toEqual([]);
  });

  it("reads the settings for this project's render, and gathers its notices", async () => {
    const asked: string[] = [];
    const chosen = await exportMachine(
      {
        renderMachine: async (projectId: string) => {
          asked.push(projectId);
          return { machine, notice: "Encoded on the processor." };
        },
      } as unknown as ExportExecutionDeps,
      "p1",
    );
    expect(asked).toEqual(["p1"]);
    expect(chosen.machine).toEqual(machine);
    chosen.notice("The card stopped.");
    expect(chosen.notices).toEqual(["Encoded on the processor.", "The card stopped."]);
  });

  it("asks for the project's video codec, and for H.264 when none is given (shorts)", async () => {
    const asked: unknown[] = [];
    const deps = {
      renderMachine: async (projectId: string, codec: unknown) => {
        asked.push([projectId, codec]);
        return { machine };
      },
    } as unknown as ExportExecutionDeps;
    await exportMachine(deps, "p1", "av1");
    await exportMachine(deps, "p2");
    expect(asked).toEqual([
      ["p1", "av1"],
      ["p2", "h264"],
    ]);
  });
});

describe("warningsOf", () => {
  it("adds nothing to the output when there is nothing to say", () => {
    expect(warningsOf([])).toEqual({});
    expect(warningsOf(["a"])).toEqual({ warnings: ["a"] });
  });
});
