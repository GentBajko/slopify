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

function Subject({ onChange }: { readonly onChange: (next: ReferenceChoice) => void }) {
  const [value, setValue] = useState<ReferenceChoice>(referenceOff);
  return (
    <ReferenceImage
      value={value}
      prompts={prompts}
      upload={<p>Upload slot</p>}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe("the establishing image control", () => {
  it("starts Off with its prompt and thumbnail controls disabled, not hidden", async () => {
    renderRouted(<Subject onChange={() => {}} />, testDeps({}));
    const source = (await screen.findByLabelText("Establishing image")) as HTMLSelectElement;
    expect(source.value).toBe("");
    expect((screen.getByLabelText("Establishing prompt") as HTMLSelectElement).disabled).toBe(true);
    const thumbnail = screen.getByLabelText("Draw the thumbnail from it too") as HTMLInputElement;
    expect(thumbnail.disabled).toBe(true);
    expect(thumbnail.checked).toBe(true);
    expect(screen.getByRole("button", { name: "About Establishing image" })).not.toBeNull();
  });

  it("offers only image prompts, then an upload slot for Upload", async () => {
    const onChange = vi.fn();
    renderRouted(<Subject onChange={onChange} />, testDeps({}));
    fireEvent.change(await screen.findByLabelText("Establishing image"), {
      target: { value: "prompt" },
    });
    expect(screen.queryByRole("option", { name: "Cover" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Establishing prompt"), {
      target: { value: "Cast sheet" },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      source: "prompt",
      prompt: "Cast sheet",
      thumbnail: true,
    });
    fireEvent.click(screen.getByLabelText("Draw the thumbnail from it too"));
    expect(onChange).toHaveBeenLastCalledWith({
      source: "prompt",
      prompt: "Cast sheet",
      thumbnail: false,
    });
    fireEvent.change(screen.getByLabelText("Establishing image"), {
      target: { value: "provide" },
    });
    expect(screen.getByText("Upload slot")).not.toBeNull();
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
