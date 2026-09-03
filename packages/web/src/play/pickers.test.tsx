import type { ProviderStatus } from "@app/slices/settings/model.js";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelPicker, ProviderPicker } from "@/play/pickers";

afterEach(cleanup);

const providers: readonly ProviderStatus[] = [
  {
    id: "openrouter",
    family: "llm",
    displayName: "OpenRouter",
    readiness: { kind: "keyed", hasKey: false },
  },
  {
    id: "claude-code",
    family: "llm",
    displayName: "Claude Code CLI",
    readiness: { kind: "cli", installed: true, version: "2.1.258" },
  },
  {
    id: "codex",
    family: "llm",
    displayName: "Codex CLI",
    readiness: { kind: "cli", installed: false },
  },
  { id: "fal", family: "image", displayName: "fal.ai", readiness: { kind: "keyed", hasKey: true } },
];

function option(name: RegExp | string): HTMLOptionElement {
  const found = screen.getByRole("option", { name });
  if (!(found instanceof HTMLOptionElement)) {
    throw new Error("that role is not an option element");
  }
  return found;
}

describe("the provider picker", () => {
  it("lists every provider of the family, usable or not", () => {
    render(
      <ProviderPicker
        label="LLM"
        family="llm"
        providers={providers}
        value=""
        problem={undefined}
        onPick={vi.fn()}
      />,
    );

    // The placeholder plus the three LLM providers; the image provider is another
    // family's and is not on this list.
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.queryByRole("option", { name: /fal\.ai/ })).toBeNull();
  });

  it("greys a keyed provider with no key and says Key missing", () => {
    render(
      <ProviderPicker
        label="LLM"
        family="llm"
        providers={providers}
        value=""
        problem={undefined}
        onPick={vi.fn()}
      />,
    );

    const unkeyed = option(/OpenRouter/);
    expect(unkeyed.textContent).toBe("OpenRouter · Key missing");
    expect(unkeyed.disabled).toBe(true);
  });

  it("greys a CLI provider that is not installed and says CLI missing", () => {
    render(
      <ProviderPicker
        label="LLM"
        family="llm"
        providers={providers}
        value=""
        problem={undefined}
        onPick={vi.fn()}
      />,
    );

    const absent = option(/Codex CLI/);
    expect(absent.textContent).toBe("Codex CLI · CLI missing");
    expect(absent.disabled).toBe(true);
  });

  it("leaves an installed CLI and a keyed provider selectable, with no reason beside them", async () => {
    const onPick = vi.fn();
    render(
      <ProviderPicker
        label="LLM"
        family="llm"
        providers={providers}
        value=""
        problem={undefined}
        onPick={onPick}
      />,
    );

    const installed = option("Claude Code CLI");
    expect(installed.disabled).toBe(false);

    await userEvent.selectOptions(screen.getByLabelText("LLM"), "claude-code");
    expect(onPick).toHaveBeenCalledWith("claude-code");
  });

  it("puts the refusal under the control and marks it", () => {
    render(
      <ProviderPicker
        label="LLM"
        family="llm"
        providers={providers}
        value=""
        problem="Pick an LLM provider and model."
        onPick={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("LLM").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Pick an LLM provider and model.")).not.toBeNull();
  });
});

describe("the model picker", () => {
  it("waits for a provider before it offers anything", () => {
    render(<ModelPicker label="Model" provider="" value="" problem={undefined} onPick={vi.fn()} />);

    const picker = screen.getByLabelText("Model");
    expect(picker instanceof HTMLSelectElement && picker.disabled).toBe(true);
    expect(screen.getByRole("option", { name: "Pick a provider first" })).not.toBeNull();
  });

  it("offers the models the registry ships for a provider that has a list", async () => {
    const onPick = vi.fn();
    render(
      <ModelPicker label="Model" provider="fal" value="" problem={undefined} onPick={onPick} />,
    );

    expect(screen.getByRole("option", { name: "FLUX.2" })).not.toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Model"), "fal-ai/flux-2");
    expect(onPick).toHaveBeenCalledWith("fal-ai/flux-2");
  });

  it("takes a typed id for a provider whose catalogue is fetched per call", async () => {
    const onPick = vi.fn();
    render(
      <ModelPicker
        label="Model"
        provider="openrouter"
        value=""
        problem={undefined}
        onPick={onPick}
      />,
    );

    const typed = screen.getByLabelText("Model");
    expect(typed instanceof HTMLInputElement).toBe(true);
    await userEvent.type(typed, "z");
    expect(onPick).toHaveBeenCalledWith("z");
  });
});
