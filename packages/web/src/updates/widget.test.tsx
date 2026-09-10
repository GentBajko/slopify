import { focusManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import type { UpdateInfo } from "./api.js";
import { UpdateWidget } from "./widget.js";

const available: UpdateInfo = {
  currentVersion: "0.6.0",
  latestVersion: "0.6.1",
  available: true,
  canUpdate: true,
  busy: false,
  status: "idle",
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

async function openUpdates() {
  await userEvent.click(screen.getByRole("button", { name: /Slopify updates/ }));
  return screen.findByRole("dialog", { name: "Slopify updates" });
}

describe("the floating update control", () => {
  it("quietly checks and only installs when explicitly pressed", async () => {
    const install = vi.fn(jsonAnswer({ ...available, status: "installing" }, 202));
    renderApp(
      <UpdateWidget reload={vi.fn()} />,
      testDeps({ "GET /api/update": jsonAnswer(available), "POST /api/update": install }),
    );
    await screen.findByRole("button", { name: /0.6.1 available/ });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(install).not.toHaveBeenCalled();
    await openUpdates();
    expect(screen.getByText("0.6.0")).not.toBeNull();
    expect(screen.getByText("0.6.1")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Update Slopify" }));
    await screen.findByText(/Installing Slopify/);
    expect(install).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Close updates" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /Updating Slopify/ })).not.toBeNull();
  });

  it("explains why active work prevents an update", async () => {
    renderApp(
      <UpdateWidget reload={vi.fn()} />,
      testDeps({ "GET /api/update": jsonAnswer({ ...available, busy: true }) }),
    );
    await openUpdates();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Update Slopify" }).disabled).toBe(
      true,
    );
    expect(screen.getByText(/Pause running projects and wait/)).not.toBeNull();
  });

  it("forces a fresh manual check and shows a failed installation without retrying it", async () => {
    const searches: string[] = [];
    const install = vi.fn(problemAnswer("The package could not be installed.", 503));
    renderApp(
      <UpdateWidget reload={vi.fn()} />,
      testDeps({
        "GET /api/update": (request) => {
          searches.push(new URL(request.url).search);
          return jsonAnswer(available)(request);
        },
        "POST /api/update": install,
      }),
    );
    await openUpdates();
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(searches).toContain("?refresh=1"));
    await userEvent.click(screen.getByRole("button", { name: "Update Slopify" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "The package could not be installed.",
    );
    expect(install).toHaveBeenCalledTimes(1);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Update Slopify" }).disabled).toBe(
      false,
    );
  });

  it("keeps an unavailable check out of the way and lets the user retry", async () => {
    renderApp(
      <UpdateWidget reload={vi.fn()} />,
      testDeps({ "GET /api/update": problemAnswer("Cannot reach the update service.", 503) }),
    );
    await screen.findByRole("button", { name: /Update check failed/ });
    expect(screen.queryByRole("alert")).toBeNull();
    await openUpdates();
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Cannot reach the update service.",
    );
    expect(screen.getByRole("button", { name: "Check again" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Update Slopify" })).toBeNull();
  });

  it("periodically checks and refreshes on focus without installing", async () => {
    const check = vi.fn(jsonAnswer({ ...available, available: false, canUpdate: false }));
    const install = vi.fn(jsonAnswer({ ...available, status: "installing" }, 202));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    renderApp(
      <UpdateWidget reload={vi.fn()} />,
      testDeps({ "GET /api/update": check, "POST /api/update": install }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(check).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    });
    expect(check).toHaveBeenCalledTimes(2);
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(check).toHaveBeenCalledTimes(3);
    expect(install).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("follows a check already in progress until a version is available", async () => {
    let reads = 0;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    renderApp(
      <UpdateWidget reload={vi.fn()} />,
      testDeps({
        "GET /api/update": (request) => {
          reads++;
          return jsonAnswer(
            reads === 1
              ? { ...available, available: false, canUpdate: false, status: "checking" }
              : available,
          )(request);
        },
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.queryByRole("button", { name: /0.6.1 available/ })).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_010);
    });
    expect(screen.getByRole("button", { name: /0.6.1 available/ })).not.toBeNull();
  });

  it("shows the server's installation restriction even when no work is active", async () => {
    renderApp(
      <UpdateWidget reload={vi.fn()} />,
      testDeps({
        "GET /api/update": jsonAnswer({
          ...available,
          canUpdate: false,
          blockedReason: "npm is not available on this machine.",
        }),
      }),
    );
    await openUpdates();
    expect(screen.getByText("npm is not available on this machine.")).not.toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Update Slopify" }).disabled).toBe(
      true,
    );
  });

  it("does not reload merely because a background check sees another running version", async () => {
    let currentVersion = available.currentVersion;
    const reload = vi.fn();
    renderApp(
      <UpdateWidget reload={reload} />,
      testDeps({
        "GET /api/update": (request) => jsonAnswer({ ...available, currentVersion })(request),
      }),
    );
    await openUpdates();
    currentVersion = "0.6.1";
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(screen.queryByText("0.6.0")).toBeNull());
    expect(reload).not.toHaveBeenCalled();
  });

  it("reconnects through a restart and reloads only when the running version changes", async () => {
    let reads = 0;
    let accepted = false;
    const reload = vi.fn();
    renderApp(
      <UpdateWidget reload={reload} />,
      testDeps({
        "GET /api/update": (request) => {
          if (!accepted) return jsonAnswer(available)(request);
          reads++;
          if (reads === 1) throw new TypeError("Failed to fetch");
          if (reads === 2)
            return jsonAnswer({ ...available, currentVersion: "0.6.1", status: "restarting" })(
              request,
            );
          return jsonAnswer({ ...available, currentVersion: "0.6.1", available: false })(request);
        },
        "POST /api/update": (request) => {
          accepted = true;
          return jsonAnswer({ ...available, status: "restarting" }, 202)(request);
        },
      }),
    );
    await openUpdates();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    fireEvent.click(screen.getByRole("button", { name: "Update Slopify" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(reload).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_010);
    });
    expect(screen.getByText(/Reconnecting to Slopify/)).not.toBeNull();
    expect(reload).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_010);
    });
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText(/Restarting Slopify/)).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_010);
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("stops the installing state if the background update fails", async () => {
    let accepted = false;
    renderApp(
      <UpdateWidget reload={vi.fn()} />,
      testDeps({
        "GET /api/update": (request) =>
          jsonAnswer(
            accepted ? { ...available, status: "error", error: "Disk is full." } : available,
          )(request),
        "POST /api/update": (request) => {
          accepted = true;
          return jsonAnswer({ ...available, status: "installing" }, 202)(request);
        },
      }),
    );
    await openUpdates();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    fireEvent.click(screen.getByRole("button", { name: "Update Slopify" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_010);
    });
    expect(screen.getByRole("alert")).toHaveProperty("textContent", "Disk is full.");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Update Slopify" }).disabled).toBe(
      false,
    );
  });
});

it("clears Updating when the server returns idle at the same version", async () => {
  let accepted = false;
  const reload = vi.fn();
  renderApp(
    <UpdateWidget reload={reload} />,
    testDeps({
      "GET /api/update": (request) =>
        jsonAnswer(
          accepted
            ? { ...available, available: false, canUpdate: false, status: "idle" }
            : available,
        )(request),
      "POST /api/update": (request) => {
        accepted = true;
        return jsonAnswer({ ...available, status: "installing" }, 202)(request);
      },
    }),
  );
  await openUpdates();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  fireEvent.click(screen.getByRole("button", { name: "Update Slopify" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_010);
  });
  expect(screen.queryByRole("button", { name: "Updating…" })).toBeNull();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Check again" }).disabled).toBe(
    false,
  );
  expect(screen.getByText("No newer release is available.")).not.toBeNull();
  expect(reload).not.toHaveBeenCalled();
});
