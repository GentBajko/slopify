import type { ImagePromptChoice } from "@app/slices/admission/model.js";
import type { Prompt } from "@app/slices/library/model.js";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImagePrompts } from "@/play/image-prompts";

afterEach(cleanup);

function prompt(name: string): Prompt {
  return {
    id: name,
    kind: "image",
    name,
    body: `A picture of {{topic}} as ${name}`,
    slots: ["topic"],
    updatedAt: "2026-09-03T00:00:00.000Z",
  };
}

const prompts: readonly Prompt[] = [prompt("Oils"), prompt("Maps"), prompt("Portraits")];

function list(picked: readonly ImagePromptChoice[], onPick = vi.fn()) {
  render(
    <ImagePrompts prompts={prompts} picked={picked} problem={() => undefined} onPick={onPick} />,
  );
  return onPick;
}

function numberFor(name: string): HTMLInputElement {
  const found = screen.getByLabelText(`Number for ${name}`);
  if (!(found instanceof HTMLInputElement)) {
    throw new Error("the Number control is not an input");
  }
  return found;
}

describe("the image prompt tick list", () => {
  it("lists every saved image prompt, ticked or not", () => {
    list([{ name: "Oils", number: 8 }]);

    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect((screen.getByRole("checkbox", { name: "Oils" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Maps" }) as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it("gives a newly ticked prompt a Number of one, at the end of the run", async () => {
    const onPick = list([{ name: "Oils", number: 8 }]);

    await userEvent.click(screen.getByRole("checkbox", { name: "Maps" }));

    expect(onPick).toHaveBeenCalledWith([
      { name: "Oils", number: 8 },
      { name: "Maps", number: 1 },
    ]);
  });

  it("drops a prompt and its Number when it is unticked", async () => {
    const onPick = list([
      { name: "Oils", number: 8 },
      { name: "Maps", number: 4 },
    ]);

    await userEvent.click(screen.getByRole("checkbox", { name: "Oils" }));

    expect(onPick).toHaveBeenCalledWith([{ name: "Maps", number: 4 }]);
  });

  it("leaves the Number of an unticked prompt empty and out of reach", () => {
    list([{ name: "Oils", number: 8 }]);

    expect(numberFor("Portraits").value).toBe("");
    expect(numberFor("Portraits").disabled).toBe(true);
    expect(numberFor("Oils").value).toBe("8");
  });

  it("carries the bounds the rule enforces onto the control itself", () => {
    list([{ name: "Oils", number: 8 }]);

    expect(numberFor("Oils").getAttribute("min")).toBe("1");
    expect(numberFor("Oils").getAttribute("max")).toBe("20");
  });

  it("reports an emptied Number as nought, for the rule to refuse by name", async () => {
    const onPick = list([{ name: "Oils", number: 8 }]);

    await userEvent.clear(numberFor("Oils"));

    expect(onPick).toHaveBeenLastCalledWith([{ name: "Oils", number: 0 }]);
  });

  it("counts what the run is asking for against the sixty it may have", async () => {
    function Harness() {
      const [picked, setPicked] = useState<readonly ImagePromptChoice[]>([
        { name: "Oils", number: 8 },
      ]);
      return (
        <ImagePrompts
          prompts={prompts}
          picked={picked}
          problem={() => undefined}
          onPick={setPicked}
        />
      );
    }
    render(<Harness />);

    expect(screen.getByText("8 of 60 images")).not.toBeNull();

    await userEvent.click(screen.getByRole("checkbox", { name: "Maps" }));
    expect(screen.getByText("9 of 60 images")).not.toBeNull();
  });

  it("puts the refusal beside the Number the rule named", () => {
    render(
      <ImagePrompts
        prompts={prompts}
        picked={[{ name: "Oils", number: 21 }]}
        problem={(field) =>
          field === "imagePrompts.0.number" ? "Number is between 1 and 20." : undefined
        }
        onPick={vi.fn()}
      />,
    );

    expect(numberFor("Oils").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Number is between 1 and 20.")).not.toBeNull();
  });

  it("says so when the library holds no image prompt at all", () => {
    render(<ImagePrompts prompts={[]} picked={[]} problem={() => undefined} onPick={vi.fn()} />);

    expect(screen.getByText("No image prompts saved. Write one on Prompts.")).not.toBeNull();
  });
});
