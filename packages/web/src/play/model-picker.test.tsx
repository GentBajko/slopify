import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ModelPicker } from "@/play/pickers";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";

afterEach(cleanup);

function Subject({
  initialProvider = "codex",
  initialModel = "",
}: {
  readonly initialProvider?: string;
  readonly initialModel?: string;
}) {
  const [provider, setProvider] = useState(initialProvider);
  const [model, setModel] = useState(initialModel);
  return (
    <>
      <label>
        Provider
        <select
          value={provider}
          onChange={(event) => {
            setProvider(event.target.value);
            setModel("");
          }}
        >
          <option value="">None</option>
          <option value="codex">Codex</option>
          <option value="gemini">Gemini</option>
          <option value="fal">fal</option>
          <option value="replicate">Replicate</option>
        </select>
      </label>
      <ModelPicker
        label="Model"
        provider={provider}
        value={model}
        problem={undefined}
        onPick={setModel}
      />
      <output data-testid="selection">{model}</output>
    </>
  );
}

const catalogue = (id = "new-model", name = "New model", allowsCustom = true) =>
  jsonAnswer({ models: [{ id, name }], allowsCustom });

describe("provider model discovery", () => {
  it("does not request models before a provider is selected", async () => {
    let calls = 0;
    renderApp(
      <Subject initialProvider="" />,
      testDeps({
        "GET /api/providers/codex/models": (request) => {
          calls += 1;
          return catalogue()(request);
        },
      }),
    );
    expect(screen.getByRole("combobox", { name: "Model" }).hasAttribute("disabled")).toBe(true);
    expect(calls).toBe(0);
    await userEvent.selectOptions(screen.getByLabelText("Provider"), "codex");
    expect(await screen.findByRole("option", { name: "New model" })).not.toBeNull();
    expect(calls).toBe(1);
  });

  it("uses the discovered catalogue without automatically replacing a saved model", async () => {
    renderApp(
      <Subject initialModel="older-model" />,
      testDeps({ "GET /api/providers/codex/models": catalogue() }),
    );
    expect(await screen.findByRole("option", { name: "New model" })).not.toBeNull();
    expect(screen.getByRole("option", { name: "older-model (saved model)" })).not.toBeNull();
    expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe("older-model");
    await userEvent.selectOptions(screen.getByLabelText("Model"), "new-model");
    expect(screen.getByTestId("selection").textContent).toBe("new-model");
  });

  it("keeps a saved model and supports custom IDs after discovery fails", async () => {
    const user = userEvent.setup();
    renderApp(
      <Subject initialModel="saved-model" />,
      testDeps({
        "GET /api/providers/codex/models": problemAnswer("The model service is unavailable.", 503),
      }),
    );
    expect(await screen.findByText(/The model service is unavailable/)).not.toBeNull();
    expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe("saved-model");
    await user.click(screen.getByRole("button", { name: "Enter Model ID" }));
    const field = screen.getByRole("textbox", { name: "Model" });
    await user.clear(field);
    await user.type(field, "my-custom-model");
    expect(screen.getByTestId("selection").textContent).toBe("my-custom-model");
  });

  it("shows a server warning alongside usable fallback models", async () => {
    renderApp(
      <Subject />,
      testDeps({
        "GET /api/providers/codex/models": jsonAnswer({
          models: [{ id: "fallback", name: "Fallback model" }],
          allowsCustom: true,
          warning: "Using the saved catalogue.",
        }),
      }),
    );
    expect(await screen.findByText("Using the saved catalogue.")).not.toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Model"), "fallback");
    expect(screen.getByTestId("selection").textContent).toBe("fallback");
  });

  it("distinguishes catalogue origin information from a discovery warning", async () => {
    renderApp(
      <Subject />,
      testDeps({
        "GET /api/providers/codex/models": jsonAnswer({
          models: [{ id: "saved", name: "Saved model" }],
          allowsCustom: true,
          notice: "Models come from the installed CLI.",
          warning: "Could not refresh the model list.",
        }),
      }),
    );
    const origin = await screen.findByText("Models come from the installed CLI.");
    const warning = screen.getByText("Could not refresh the model list.");
    expect(origin).not.toBe(warning);
    expect(origin.getAttribute("role")).toBeNull();
    expect(warning.getAttribute("role")).toBe("status");
    const described = screen.getByLabelText("Model").getAttribute("aria-describedby");
    expect(described).toContain(origin.id);
    expect(described).toContain(warning.id);
  });

  it.each(["fal", "replicate"])(
    "does not offer custom schema IDs for %s, including after a request failure",
    async (provider) => {
      renderApp(
        <Subject initialProvider={provider} initialModel="saved-model" />,
        testDeps({
          [`GET /api/providers/${provider}/models`]: problemAnswer("Discovery failed.", 503),
        }),
      );
      expect(await screen.findByText(/Discovery failed/)).not.toBeNull();
      expect(screen.queryByRole("button", { name: "Enter Model ID" })).toBeNull();
      expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe("saved-model");
    },
  );

  it("honors the server's custom-ID restriction", async () => {
    renderApp(
      <Subject />,
      testDeps({ "GET /api/providers/codex/models": catalogue("fixed", "Fixed model", false) }),
    );
    expect(await screen.findByRole("option", { name: "Fixed model" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Enter Model ID" })).toBeNull();
  });

  it("refreshes the server catalogue while preserving the selected model", async () => {
    const user = userEvent.setup();
    const requests: string[] = [];
    renderApp(
      <Subject initialModel="original" />,
      testDeps({
        "GET /api/providers/codex/models": (request) => {
          const refresh = new URL(request.url).searchParams.get("refresh");
          requests.push(refresh ?? "");
          return catalogue(
            refresh === "1" ? "latest" : "original",
            refresh === "1" ? "Latest model" : "Original model",
          )(request);
        },
      }),
    );
    await screen.findByRole("option", { name: "Original model" });
    await user.click(screen.getByRole("button", { name: "Refresh Model list" }));
    expect(await screen.findByRole("option", { name: "Latest model" })).not.toBeNull();
    expect(requests).toEqual(["", "1"]);
    expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe("original");
    expect(screen.getByRole("option", { name: "original (saved model)" })).not.toBeNull();
  });

  it("reuses the cached catalogue when switching back to a provider", async () => {
    const user = userEvent.setup();
    let codexReads = 0;
    renderApp(
      <Subject />,
      testDeps({
        "GET /api/providers/codex/models": (request) => {
          codexReads += 1;
          return catalogue("codex-model", "Codex model")(request);
        },
        "GET /api/providers/gemini/models": catalogue("gemini-model", "Gemini model"),
      }),
    );
    await screen.findByRole("option", { name: "Codex model" });
    await user.selectOptions(screen.getByLabelText("Provider"), "gemini");
    await screen.findByRole("option", { name: "Gemini model" });
    await user.selectOptions(screen.getByLabelText("Provider"), "codex");
    expect(await screen.findByRole("option", { name: "Codex model" })).not.toBeNull();
    expect(codexReads).toBe(1);
  });

  it("keeps the working catalogue and selection if a manual refresh fails", async () => {
    const user = userEvent.setup();
    renderApp(
      <Subject initialModel="saved-model" />,
      testDeps({
        "GET /api/providers/codex/models": (request) =>
          new URL(request.url).searchParams.has("refresh")
            ? problemAnswer("Refresh failed.", 503)(request)
            : catalogue()(request),
      }),
    );
    await screen.findByRole("option", { name: "New model" });
    await user.click(screen.getByRole("button", { name: "Refresh Model list" }));
    expect(await screen.findByText("Refresh failed.")).not.toBeNull();
    expect(screen.getByRole("option", { name: "New model" })).not.toBeNull();
    expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe("saved-model");
  });

  it("ignores a late response from a provider the user has left", async () => {
    const user = userEvent.setup();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = false;
    renderApp(
      <Subject />,
      testDeps({
        "GET /api/providers/codex/models": async (request) => {
          started = true;
          await gate;
          return catalogue("old-provider", "Old provider model")(request);
        },
        "GET /api/providers/gemini/models": catalogue("new-provider", "New provider model"),
      }),
    );
    await waitFor(() => expect(started).toBe(true));
    await user.selectOptions(screen.getByLabelText("Provider"), "gemini");
    await screen.findByRole("option", { name: "New provider model" });
    release();
    await user.selectOptions(screen.getByLabelText("Model"), "new-provider");
    expect(screen.queryByRole("option", { name: "Old provider model" })).toBeNull();
    expect(screen.getByTestId("selection").textContent).toBe("new-provider");
  });
});
