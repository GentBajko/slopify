import { focusManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Menu, MenuContent, MenuTrigger } from "@/components/kit/menu";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { type UpdateInfo, updateRecoveryTimeout } from "./api.js";
import { useUpdate } from "./use-update.js";
import { UpdateMenuRows, UpdateWidget } from "./widget.js";

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

// The shell's two places for an update: the rail item (only while there is news) and the rows
// at the foot of the Help menu.
function Updates({ reload }: { readonly reload: () => void }) {
  const update = useUpdate(reload);
  return (
    <>
      <UpdateWidget update={update} />
      <Menu modal={false}>
        <MenuTrigger>Help</MenuTrigger>
        <MenuContent>
          <UpdateMenuRows update={update} />
        </MenuContent>
      </Menu>
    </>
  );
}
// The update row of the Help menu, opened first.
async function helpRow(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole("button", { name: "Help" }));
  return within(await screen.findByRole("menu", { name: "Help" })).getByRole("menuitem");
}
// The rail item, by the state it says.
function item(name: string): HTMLElement | null {
  return screen.queryByRole("button", { name });
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

it("says an update is ready in words, and installs it from its menu once it has said what that does", async () => {
  const install = vi.fn(jsonAnswer({ ...available, status: "installing" }, 202));
  renderApp(
    <Updates reload={vi.fn()} />,
    testDeps({ "GET /api/update": jsonAnswer(available), "POST /api/update": install }),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Update ready" }));
  const menu = await screen.findByRole("menu", { name: "Update ready" });
  expect(menu.textContent).toContain("Your version: 0.8.2 · Newest: 0.8.3.");
  expect(menu.textContent).toContain(
    "Installing restarts Slopify; anything running finishes first.",
  );
  expect(install).not.toHaveBeenCalled();
  await userEvent.click(within(menu).getByRole("menuitem", { name: "Install update 0.8.3" }));
  expect(install).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(await screen.findByRole("button", { name: "Updating…" })).not.toBeNull();
  expect((await helpRow()).getAttribute("aria-disabled")).toBe("true");
});

it("says nothing in the rail without an update, and a check finds one without installing it", async () => {
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
  await waitFor(() => expect(said()).toBe("You have Slopify 0.8.2."));
  expect(screen.queryByRole("button", { name: /^Updat/ })).toBeNull();
  const check = await helpRow();
  expect(check.textContent).toBe("Check for updates");
  await userEvent.click(check);
  expect(await screen.findByRole("button", { name: "Update ready" })).not.toBeNull();
  expect(searches).toContain("?refresh=1");
  expect(install).not.toHaveBeenCalled();
  const row = await helpRow();
  expect(row.textContent).toBe("Install update 0.8.3");
  await userEvent.click(row);
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
  await screen.findByRole("button", { name: "Update ready" });
  await userEvent.click(await helpRow());
  expect(install).toHaveBeenCalledTimes(1);
  await userEvent.click(await screen.findByRole("button", { name: "Update waiting" }));
  expect(said()).toBe("Update to 0.8.3 will install when 'Cleopatra' finishes.");
  const menu = await screen.findByRole("menu", { name: "Update waiting" });
  await userEvent.click(within(menu).getByRole("menuitem", { name: "Cancel the update" }));
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(install).toHaveBeenCalledTimes(1);
});

it("shows installation failures without automatic retries", async () => {
  const install = vi.fn(problemAnswer("Disk is full.", 503));
  renderApp(
    <Updates reload={vi.fn()} />,
    testDeps({ "GET /api/update": jsonAnswer(available), "POST /api/update": install }),
  );
  await screen.findByRole("button", { name: "Update ready" });
  await userEvent.click(await helpRow());
  expect((await screen.findByRole("alert")).textContent).toContain("Disk is full.");
  expect(item("Update failed")).not.toBeNull();
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
  await screen.findByRole("button", { name: "Update ready" });
  const row = await helpRow();
  fakeTime();
  fireEvent.click(row);
  await tick();
  await tick();
  expect(screen.queryByRole("button", { name: /^Updat/ })).toBeNull();
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
  await screen.findByRole("button", { name: "Update ready" });
  const row = await helpRow();
  fakeTime();
  fireEvent.click(row);
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
  await screen.findByRole("button", { name: "Update ready" });
  const row = await helpRow();
  fakeTime();
  fireEvent.click(row);
  await tick(10);
  expect(item("Updating…")).not.toBeNull();
  await tick(updateRecoveryTimeout);
  expect(item("Updating…")).toBeNull();
  expect(item("Update failed")).not.toBeNull();
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

it("sits in the rail's flow instead of floating over page content", async () => {
  renderApp(<Updates reload={vi.fn()} />, testDeps({ "GET /api/update": jsonAnswer(available) }));
  const shown = await screen.findByRole("button", { name: "Update ready" });
  expect(shown.className).not.toMatch(/\bfixed\b/);
  expect(shown.style.bottom).toBe("");
});
