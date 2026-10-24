import type { ProviderStatus } from "@app/slices/settings/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { ProviderKeys } from "./provider-keys.js";

afterEach(cleanup);

function codex(configured: string | null, installed: boolean): ProviderStatus {
  return {
    id: "codex",
    family: "llm",
    displayName: "Codex CLI",
    readiness: { kind: "cli", installed },
    cliPath: { configured, command: configured ?? "codex" },
  };
}

// A tool's setup opens from its line in the list, as a person would open it.
async function openRow(name: string): Promise<void> {
  await userEvent.click(await screen.findByRole("button", { name }));
}

// The path form sits behind "Change path", so a row stays one line until it is asked for.
async function openPath(name: string): Promise<HTMLElement> {
  await openRow(name);
  await userEvent.click(await screen.findByRole("button", { name: "Change path" }));
  return screen.getByRole("textbox", { name: `${name} Executable path` });
}

describe("CLI executable settings", () => {
  it.each(["ready", "login", "bridge", "version"] as const)(
    "shows a read-only host command for %s",
    async (kind) => {
      const readiness =
        kind === "ready"
          ? { kind: "cli" as const, installed: true }
          : {
              kind: "cli" as const,
              installed: kind !== "bridge",
              issueKind: kind,
              issue: `Host ${kind} guidance`,
            };
      renderApp(
        <ProviderKeys />,
        testDeps({
          "GET /api/providers": jsonAnswer({
            providers: [
              {
                ...codex(null, true),
                readiness,
                cliPath: { configured: null, command: "/host/bin/codex", managedOnHost: true },
              },
            ],
          }),
        }),
      );
      await openRow("Codex CLI");
      expect(await screen.findByText("/host/bin/codex")).not.toBeNull();
      expect(screen.queryByRole("button", { name: "Change path" })).toBeNull();
      // Why the path can't change here, said on the page rather than behind a button.
      expect(
        screen.getByText(/runs on your computer with the sign-in it has there/),
      ).not.toBeNull();
      expect(screen.getByText(/run the Docker launcher again/)).not.toBeNull();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.queryByRole("button", { name: /Save.*path/ })).toBeNull();
      if (kind !== "ready") expect(screen.getByText(`Host ${kind} guidance`)).not.toBeNull();
      expect(
        screen.queryByText("Not found in the folders your terminal searches (PATH)"),
      ).toBeNull();
    },
  );
  it.each([
    ["codex", "Codex CLI", "codex"],
    ["claude-code", "Claude Code CLI", "claude"],
    ["gemini", "Antigravity CLI", "agy"],
    ["codex-image", "Codex CLI", "codex"],
  ] as const)(
    "offers an accessible path field for %s without an API key",
    async (id, name, command) => {
      renderApp(
        <ProviderKeys />,
        testDeps({
          "GET /api/providers": jsonAnswer({
            providers: [
              {
                id,
                family: id === "codex-image" ? "image" : "llm",
                displayName: name,
                readiness: { kind: "cli", installed: false },
                cliPath: { configured: null, command },
              },
            ],
          }),
        }),
      );
      const field = await openPath(name);
      expect((field as HTMLInputElement).value).toBe("");
      expect(field.getAttribute("placeholder")).toBe(command);
      expect(screen.getByRole("button", { name: `Save ${name} path` })).not.toBeNull();
      expect(screen.getByText(/Leave blank to find/).textContent).toContain("PATH");
      // What the tool does is in words beside it, with no info button.
      expect(screen.queryByRole("button", { name: `About ${name}` })).toBeNull();
      expect(screen.getAllByText(/sign-in/).length).toBeGreaterThan(0);
      expect(screen.queryByLabelText(`${name} API key`)).toBeNull();
    },
  );

  it("saves Windows paths with spaces and refreshes readiness without reloading", async () => {
    const user = userEvent.setup();
    const path = "C:\\Program Files\\Codex\\codex.exe";
    let current = codex(null, false);
    let reads = 0;
    let sent: unknown;
    let finish = () => {};
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    renderApp(
      <ProviderKeys />,
      testDeps({
        "GET /api/providers": (request) => {
          reads += 1;
          return jsonAnswer({ providers: [current] })(request);
        },
        "PUT /api/providers/codex/path": async (request) => {
          sent = await request.json();
          await gate;
          current = codex(path, true);
          return jsonAnswer(current)(request);
        },
      }),
    );
    const field = await openPath("Codex CLI");
    await user.type(field, path);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(sent).toEqual({ path }));
    expect(field.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Save Codex CLI path" }).hasAttribute("disabled"),
    ).toBe(true);
    finish();
    expect(await screen.findByText("Saved")).not.toBeNull();
    expect(await screen.findByText("Installed")).not.toBeNull();
    expect(screen.getByText(path)).not.toBeNull();
    await waitFor(() => expect(reads).toBeGreaterThanOrEqual(2));
    expect((field as HTMLInputElement).value).toBe(path);
  });

  it("clears a saved override to restore PATH even when the default command is missing", async () => {
    const user = userEvent.setup();
    let current = codex("/opt/codex/bin/codex", true);
    let sent: unknown;
    renderApp(
      <ProviderKeys />,
      testDeps({
        "GET /api/providers": (request) => jsonAnswer({ providers: [current] })(request),
        "PUT /api/providers/codex/path": async (request) => {
          sent = await request.json();
          current = codex(null, false);
          return jsonAnswer(current)(request);
        },
      }),
    );
    const field = await openPath("Codex CLI");
    expect((field as HTMLInputElement).value).toBe("/opt/codex/bin/codex");
    await user.clear(field);
    await user.click(screen.getByRole("button", { name: "Save Codex CLI path" }));
    expect(
      await screen.findByText("Not found in the folders your terminal searches (PATH)"),
    ).not.toBeNull();
    expect(sent).toEqual({ path: "" });
    expect((field as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("/opt/codex/bin/codex")).toBeNull();
  });

  it("identifies a stale saved executable separately from PATH lookup", async () => {
    renderApp(
      <ProviderKeys />,
      testDeps({
        "GET /api/providers": jsonAnswer({ providers: [codex("/removed/codex", false)] }),
      }),
    );
    await openRow("Codex CLI");
    expect(await screen.findByText("Not found at the saved path")).not.toBeNull();
    expect(screen.queryByText("Not found in the folders your terminal searches (PATH)")).toBeNull();
    expect(screen.getByText("/removed/codex")).not.toBeNull();
  });

  it("keeps the rejected draft and previous active command visible when validation fails", async () => {
    const user = userEvent.setup();
    renderApp(
      <ProviderKeys />,
      testDeps({
        "GET /api/providers": jsonAnswer({ providers: [codex("/opt/codex", true)] }),
        "PUT /api/providers/codex/path": problemAnswer(
          "No executable file exists at this path.",
          400,
        ),
      }),
    );
    const field = await openPath("Codex CLI");
    await user.clear(field);
    await user.type(field, "/missing/codex");
    await user.click(screen.getByRole("button", { name: "Save Codex CLI path" }));
    expect(await screen.findByText("No executable file exists at this path.")).not.toBeNull();
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect((field as HTMLInputElement).value).toBe("/missing/codex");
    expect(screen.getByText("/opt/codex")).not.toBeNull();
    expect(screen.queryByText("Saved")).toBeNull();
  });
});
