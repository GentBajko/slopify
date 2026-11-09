import { focusManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { type UpdateInfo, updateRecoveryTimeout } from "./api.js";
import { useUpdate } from "./use-update.js";
import { UpdateButton, UpdateWidget } from "./widget.js";

const available: UpdateInfo = {
  currentVersion: "0.8.2",
  latestVersion: "0.8.3",
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

// The shell's one place for an update: a button of its own, with the live region beside it.
function Updates({ reload }: { readonly reload: () => void }) {
  const update = useUpdate(reload);
  return (
    <>
      <UpdateWidget update={update} />
      <UpdateButton update={update} />
    </>
  );
}
// The button, named for what pressing it does.
function item(name: string): HTMLElement | null {
  return screen.queryByRole("button", { name });
}
async function press(name: string): Promise<void> {
  await userEvent.click(await screen.findByRole("button", { name }));
}
// The live region: the state in a sentence, announced wherever the person is.
function said(): string {
  return (screen.queryByRole("alert") ?? screen.getByRole("status")).textContent ?? "";
}
function fakeTime(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
}
async function tick(ms = 2_010): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

it("stands on its own, says which version this is, and names the new one in its own words", async () => {
  renderApp(<Updates reload={vi.fn()} />, testDeps({ "GET /api/update": jsonAnswer(available) }));
  const button = await screen.findByRole("button", { name: "Install update 0.8.3" });
  // The version running now, under the word, and the one waiting after it.
  expect(button.querySelector(".sl-navrail__version")?.textContent).toBe("0.8.2");
  expect(button.querySelector(".sl-navrail__next")?.textContent).toBe("→ 0.8.3");
  // In the accent's ink, as before.
  expect(button.className).toContain("sl-navrail__item--news");
  // The whole state is on the button for a mouse and in the live region for a reader.
  expect(button.getAttribute("title")).toContain("Your version: 0.8.2 · Newest: 0.8.3.");
  expect(said()).toContain("Installing restarts Slopify; anything running finishes first.");
});

it("says the version it is on when there is nothing to install", async () => {
  renderApp(
    <Updates reload={vi.fn()} />,
    testDeps({
      "GET /api/update": jsonAnswer({ ...available, available: false, latestVersion: "0.8.2" }),
    }),
  );
  await waitFor(() => expect(said()).toBe("You have Slopify 0.8.2."));
  const button = item("Check for updates");
  expect(button).not.toBeNull();
  expect(button?.querySelector(".sl-navrail__version")?.textContent).toBe("0.8.2");
  // Nothing to install, so no second version and no accent.
  expect(button?.querySelector(".sl-navrail__next")).toBeNull();
  expect(button?.className).not.toContain("sl-navrail__item--news");
});

it("turns while it looks, and stops when it has an answer", async () => {
  // The check is held open, so the state the press puts the button in can be read.
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  renderApp(
    <Updates reload={vi.fn()} />,
    testDeps({
      "GET /api/update": async (request) => {
        if (new URL(request.url).search) {
          await held;
          return jsonAnswer(available)(request);
        }
        return jsonAnswer({ ...available, available: false, latestVersion: "0.8.2" })(request);
      },
    }),
  );
  await press("Check for updates");
  // The press has to show it landed: the arrow turns, and the button refuses a second press.
  const turning = await screen.findByRole("button", { name: "Checking for updates…" });
  expect(turning.querySelector("svg")?.getAttribute("class")).toContain("animate-spin");
  // Motion nobody asked for is stilled.
  expect(turning.querySelector("svg")?.getAttribute("class")).toContain(
    "motion-reduce:animate-none",
  );
  expect(turning.hasAttribute("disabled")).toBe(true);
  release?.();
  const done = await screen.findByRole("button", { name: "Install update 0.8.3" });
  expect(done.querySelector("svg")?.getAttribute("class")).not.toContain("animate-spin");
});

it("installs a ready update on the press, having said first what that does", async () => {
  const install = vi.fn(jsonAnswer({ ...available, status: "installing" }, 202));
  renderApp(
    <Updates reload={vi.fn()} />,
    testDeps({ "GET /api/update": jsonAnswer(available), "POST /api/update": install }),
  );
  const button = await screen.findByRole("button", { name: "Install update 0.8.3" });
  expect(button.getAttribute("title")).toContain(
    "Installing restarts Slopify; anything running finishes first.",
  );
  expect(install).not.toHaveBeenCalled();
  await userEvent.click(button);
  expect(install).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();
  const updating = await screen.findByRole("button", { name: "Updating…" });
  expect(updating.hasAttribute("disabled")).toBe(true);
});

it("finds an update on a check without installing it", async () => {
  const searches: string[] = [];
  const install = vi.fn(jsonAnswer({ ...available, status: "installing" }, 202));
  renderApp(
    <Updates reload={vi.fn()} />,
    testDeps({
      "GET /api/update": (request) => {
        const search = new URL(request.url).search;
        searches.push(search);
        return jsonAnswer(
          search ? available : { ...available, available: false, latestVersion: "0.8.2" },
        )(request);
      },
      "POST /api/update": install,
    }),
  );
  await press("Check for updates");
  expect(await screen.findByRole("button", { name: "Install update 0.8.3" })).not.toBeNull();
  expect(searches).toContain("?refresh=1");
  expect(install).not.toHaveBeenCalled();
  await press("Install update 0.8.3");
  expect(install).toHaveBeenCalledTimes(1);
});

it("waits for running work instead of refusing, says for what, and cancels on the next press", async () => {
  const waiting: UpdateInfo = {
    ...available,
    busy: true,
    canUpdate: false,
    status: "waiting",
    pendingVersion: "0.8.3",
    waitingFor: "Cleopatra",
  };
  let current: UpdateInfo = { ...available, busy: true };
  const install = vi.fn((request: Request) => {
    current = waiting;
    return jsonAnswer(waiting, 202)(request);
  });
  const cancel = vi.fn((request: Request) => {
    current = { ...available, busy: true };
    return jsonAnswer(current)(request);
  });
  renderApp(
    <Updates reload={vi.fn()} />,
    testDeps({
      "GET /api/update": (request) => jsonAnswer(current)(request),
      "POST /api/update": install,
      "DELETE /api/update": cancel,
    }),
  );
  await press("Install update 0.8.3");
  expect(install).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(said()).toBe("Update to 0.8.3 will install when 'Cleopatra' finishes."),
  );
  await press("Cancel the update");
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(install).toHaveBeenCalledTimes(1);
});

it("shows installation failures without automatic retries", async () => {
  const install = vi.fn(problemAnswer("Disk is full.", 503));
  renderApp(
    <Updates reload={vi.fn()} />,
    testDeps({ "GET /api/update": jsonAnswer(available), "POST /api/update": install }),
  );
  await press("Install update 0.8.3");
  expect((await screen.findByRole("alert")).textContent).toContain("Disk is full.");
  expect(install).toHaveBeenCalledTimes(1);
});

it("clears Updating for an idle server at the same version", async () => {
  let accepted = false;
  const reload = vi.fn();
  renderApp(
    <Updates reload={reload} />,
    testDeps({
      "GET /api/update": (request) =>
        jsonAnswer(accepted ? { ...available, available: false, canUpdate: false } : available)(
          request,
        ),
      "POST /api/update": (request) => {
        accepted = true;
        return jsonAnswer({ ...available, status: "installing" }, 202)(request);
      },
    }),
  );
  const button = await screen.findByRole("button", { name: "Install update 0.8.3" });
  fakeTime();
  fireEvent.click(button);
  await tick();
  await tick();
  expect(item("Updating…")).toBeNull();
  expect(said()).toBe("You have Slopify 0.8.2.");
  expect(reload).not.toHaveBeenCalled();
});

it("reconnects through restart and reloads only after activation", async () => {
  let accepted = false,
    reads = 0;
  const reload = vi.fn();
  renderApp(
    <Updates reload={reload} />,
    testDeps({
      "GET /api/update": (request) => {
        if (!accepted) return jsonAnswer(available)(request);
        reads++;
        if (reads === 1) throw new TypeError("Failed to fetch");
        return jsonAnswer({
          ...available,
          currentVersion: "0.8.3",
          available: false,
          status: reads === 2 ? "restarting" : "idle",
        })(request);
      },
      "POST /api/update": (request) => {
        accepted = true;
        return jsonAnswer({ ...available, status: "restarting" }, 202)(request);
      },
    }),
  );
  const button = await screen.findByRole("button", { name: "Install update 0.8.3" });
  fakeTime();
  fireEvent.click(button);
  await tick(10);
  await tick();
  expect(said()).toContain("Reconnecting");
  expect(item("Updating…")).not.toBeNull();
  await tick();
  expect(reload).not.toHaveBeenCalled();
  await tick();
  expect(reload).toHaveBeenCalledTimes(1);
});

it("stops presenting Updating when the replacement never reconnects", async () => {
  let accepted = false;
  const reload = vi.fn();
  renderApp(
    <Updates reload={reload} />,
    testDeps({
      "GET /api/update": (request) =>
        jsonAnswer(accepted ? { ...available, status: "installing" } : available)(request),
      "POST /api/update": (request) => {
        accepted = true;
        return jsonAnswer({ ...available, status: "installing" }, 202)(request);
      },
    }),
  );
  const button = await screen.findByRole("button", { name: "Install update 0.8.3" });
  fakeTime();
  fireEvent.click(button);
  await tick(10);
  expect(item("Updating…")).not.toBeNull();
  await tick(updateRecoveryTimeout);
  expect(item("Updating…")).toBeNull();
  expect(said()).toContain("The update did not finish");
  expect(reload).not.toHaveBeenCalled();
});

it("recovers a persisted install state after a reload", async () => {
  fakeTime();
  renderApp(
    <Updates reload={vi.fn()} />,
    testDeps({ "GET /api/update": jsonAnswer({ ...available, status: "installing" }) }),
  );
  await tick(10);
  expect(item("Updating…")).not.toBeNull();
  await tick(updateRecoveryTimeout);
  expect(item("Updating…")).toBeNull();
  expect(said()).toContain("The update did not finish");
});

it("polls every fifteen minutes without installing", async () => {
  const check = vi.fn(jsonAnswer({ ...available, available: false })),
    install = vi.fn();
  fakeTime();
  renderApp(
    <Updates reload={vi.fn()} />,
    testDeps({ "GET /api/update": check, "POST /api/update": install }),
  );
  await tick(10);
  await tick(15 * 60 * 1000);
  expect(check).toHaveBeenCalledTimes(2);
  expect(install).not.toHaveBeenCalled();
});

it("leaves the versions off where there is no room for them", async () => {
  renderApp(<UpdatesNarrow />, testDeps({ "GET /api/update": jsonAnswer(available) }));
  const button = await screen.findByRole("button", { name: "Install update 0.8.3" });
  expect(button.querySelector(".sl-navrail__version")).toBeNull();
  expect(button.querySelector(".sl-navrail__next")).toBeNull();
  // Still named for what it does, and still in the accent's ink.
  expect(button.className).toContain("sl-navrail__item--news");
});

function UpdatesNarrow() {
  const update = useUpdate(vi.fn());
  return <UpdateButton update={update} versions={false} />;
}

it("sits in the rail's flow instead of floating over page content", async () => {
  renderApp(<Updates reload={vi.fn()} />, testDeps({ "GET /api/update": jsonAnswer(available) }));
  const shown = await screen.findByRole("button", { name: "Install update 0.8.3" });
  expect(shown.className).not.toMatch(/\bfixed\b/);
  expect(shown.style.bottom).toBe("");
});
