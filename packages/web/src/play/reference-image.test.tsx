import type { ProviderChoice } from "@app/slices/admission/model.js";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { type ReferenceChoice, ReferenceImage, referenceOff } from "./reference-image";
import { ThinkingPicker } from "./thinking";

afterEach(cleanup);

const prompts = [
  {
    id: "i",
    kind: "image" as const,
    name: "Cast sheet",
    body: "{{Hero}}",
    slots: [],
    updatedAt: "",
  },
  { id: "t", kind: "thumbnail" as const, name: "Cover", body: "Cover", slots: [], updatedAt: "" },
];

function Subject({
  onChange,
  thumbnailOn = true,
}: {
  readonly onChange: (next: ReferenceChoice) => void;
  readonly thumbnailOn?: boolean;
}) {
  const [value, setValue] = useState<ReferenceChoice>(referenceOff);
  return (
    <ReferenceImage
      value={value}
      prompts={prompts}
      upload={<p>Upload slot</p>}
      thumbnailOn={thumbnailOn}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const source = "Establishing image (keeps characters and style the same)";
const tick = "Use it as a reference for the thumbnail too";

describe("the establishing image control", () => {
  it("starts Off and asks for nothing more until it is on", async () => {
    renderRouted(<Subject onChange={() => {}} />, testDeps({}));
    const picker = (await screen.findByLabelText(source)) as HTMLSelectElement;
    expect(picker.value).toBe("");
    expect(screen.queryByLabelText("Establishing prompt")).toBeNull();
    expect(screen.queryByLabelText(tick)).toBeNull();
    expect(screen.getByText("Off: each image is drawn on its own.")).not.toBeNull();
  });

  it("offers only image prompts, then an upload slot for Upload", async () => {
    const onChange = vi.fn();
    renderRouted(<Subject onChange={onChange} />, testDeps({}));
    fireEvent.change(await screen.findByLabelText(source), {
      target: { value: "prompt" },
    });
    expect(screen.getByText(/one more image call/)).not.toBeNull();
    expect(screen.queryByRole("option", { name: "Cover" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Establishing prompt"), {
      target: { value: "Cast sheet" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      source: "prompt",
      prompt: "Cast sheet",
      thumbnail: true,
    });
    expect((screen.getByLabelText(tick) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("The thumbnail itself is switched on under Outputs.")).not.toBeNull();
    fireEvent.click(screen.getByLabelText(tick));
    expect(onChange).toHaveBeenLastCalledWith({
      source: "prompt",
      prompt: "Cast sheet",
      thumbnail: false,
    });
    fireEvent.change(screen.getByLabelText(source), {
      target: { value: "provide" },
    });
    expect(screen.getByText("Upload slot")).not.toBeNull();
  });

  it("leaves the thumbnail out while the run makes none", async () => {
    renderRouted(<Subject onChange={() => {}} thumbnailOn={false} />, testDeps({}));
    fireEvent.change(await screen.findByLabelText(source), { target: { value: "prompt" } });
    expect(screen.getByLabelText("Establishing prompt")).not.toBeNull();
    expect(screen.queryByLabelText(tick)).toBeNull();
  });
});

function Effort({ onChange }: { readonly onChange: (next: ProviderChoice) => void }) {
  const [choice, setChoice] = useState<ProviderChoice>({
    provider: "codex-image",
    model: "gpt-6-sol",
  });
  return (
    <ThinkingPicker
      field="images.thinking"
      label="Effort"
      choice={choice}
      onChange={(next) => {
        setChoice(next);
        onChange(next);
      }}
    />
  );
}

describe("the images' Effort", () => {
  it("lists the chosen Codex model's efforts and clears back to Model default", async () => {
    const onChange = vi.fn();
    renderRouted(
      <Effort onChange={onChange} />,
      testDeps({
        "GET /api/providers/codex-image/models": jsonAnswer({
          models: [
            { id: "codex-imagegen", name: "Codex default" },
            { id: "gpt-6-sol", name: "GPT-6-Sol", thinkingModes: ["low", "high", "ultra"] },
          ],
          allowsCustom: false,
        }),
      }),
    );
    const picker = (await screen.findByLabelText("Effort")) as HTMLSelectElement;
    expect(screen.getByRole("option", { name: "Ultra" })).not.toBeNull();
    fireEvent.change(picker, { target: { value: "ultra" } });
    expect(onChange).toHaveBeenLastCalledWith({
      provider: "codex-image",
      model: "gpt-6-sol",
      thinking: "ultra",
    });
    fireEvent.change(picker, { target: { value: "default" } });
    expect(onChange).toHaveBeenLastCalledWith({ provider: "codex-image", model: "gpt-6-sol" });
  });

  it("draws nothing for Codex default, which has no effort of its own", async () => {
    renderRouted(
      <ThinkingPicker
        field="images.thinking"
        label="Effort"
        choice={{ provider: "codex-image", model: "codex-imagegen" }}
        onChange={() => {}}
      />,
      testDeps({
        "GET /api/providers/codex-image/models": jsonAnswer({
          models: [{ id: "codex-imagegen", name: "Codex default" }],
          allowsCustom: false,
        }),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByLabelText("Effort")).toBeNull();
  });
});
