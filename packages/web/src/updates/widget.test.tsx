import { focusManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import type { UpdateInfo } from "./api.js";
import { UpdateWidget } from "./widget.js";

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
function control(): HTMLButtonElement {
  return screen.getByRole("button", { name: /Slopify updates/ });
}
async function ready(): Promise<void> {
  await waitFor(() => expect(control().disabled).toBe(false));
}
function fakeTime(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
}
async function tick(ms = 2_010): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

it("installs a known update with one click, without opening a panel", async () => {
  const install = vi.fn(jsonAnswer({ ...available, status: "installing" }, 202));
  renderApp(
    <UpdateWidget reload={vi.fn()} />,
    testDeps({ "GET /api/update": jsonAnswer(available), "POST /api/update": install }),
  );
  await ready();
  expect(control().title).toContain("Your version: 0.8.2 · Newest: 0.8.3");
  expect(install).not.toHaveBeenCalled();
  await userEvent.click(control());
  expect(install).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(control().disabled).toBe(true);
});

it("a check discovers an update without installing until the next click", async () => {
  const searches: string[] = [];
  const install = vi.fn(jsonAnswer({ ...available, status: "installing" }, 202));
  renderApp(
    <UpdateWidget reload={vi.fn()} />,
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
  await ready();
  expect(control().title).toContain("Slopify 0.8.2");
  await userEvent.click(control());
  await ready();
  expect(searches).toContain("?refresh=1");
  expect(install).not.toHaveBeenCalled();
  await userEvent.click(control());
  expect(install).toHaveBeenCalledTimes(1);
});

it("keeps blocked installs out of the click action and explains why on hover", async () => {
  const install = vi.fn();
  renderApp(
    <UpdateWidget reload={vi.fn()} />,
    testDeps({
      "GET /api/update": jsonAnswer({ ...available, busy: true }),
      "POST /api/update": install,
    }),
  );
  await ready();
  expect(control().title).toContain("Pause running projects");
  await userEvent.click(control());
  expect(install).not.toHaveBeenCalled();
});

it("shows installation failures without automatic retries", async () => {
  const install = vi.fn(problemAnswer("Disk is full.", 503));
  renderApp(
    <UpdateWidget reload={vi.fn()} />,
    testDeps({ "GET /api/update": jsonAnswer(available), "POST /api/update": install }),
  );
  await ready();
  await userEvent.click(control());
  expect((await screen.findByRole("alert")).textContent).toContain("Disk is full.");
  expect(control().title).toContain("Disk is full.");
  expect(install).toHaveBeenCalledTimes(1);
});

it("clears Updating for an idle server at the same version", async () => {
  let accepted = false;
  const reload = vi.fn();
  renderApp(
    <UpdateWidget reload={reload} />,
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
  await ready();
  fakeTime();
  fireEvent.click(control());
  await tick();
  expect(control().disabled).toBe(false);
  expect(control().title).not.toContain("Updating…");
  expect(reload).not.toHaveBeenCalled();
});

it("reconnects through restart and reloads only after activation", async () => {
  let accepted = false,
    reads = 0;
  const reload = vi.fn();
  renderApp(
    <UpdateWidget reload={reload} />,
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
  await ready();
  fakeTime();
  fireEvent.click(control());
  await tick(10);
  await tick();
  expect(control().title).toContain("Reconnecting");
  await tick();
  expect(reload).not.toHaveBeenCalled();
  await tick();
  expect(reload).toHaveBeenCalledTimes(1);
});

it("polls every fifteen minutes without installing", async () => {
  const check = vi.fn(jsonAnswer({ ...available, available: false })),
    install = vi.fn();
  fakeTime();
  renderApp(
    <UpdateWidget reload={vi.fn()} />,
    testDeps({ "GET /api/update": check, "POST /api/update": install }),
  );
  await tick(10);
  await tick(15 * 60 * 1000);
  expect(check).toHaveBeenCalledTimes(2);
  expect(install).not.toHaveBeenCalled();
});

it("lifts the control above the footer instead of covering it", async () => {
  const footer = document.createElement("footer");
  footer.id = "app-footer";
  document.body.append(footer);
  vi.spyOn(footer, "getBoundingClientRect").mockReturnValue({
    top: window.innerHeight - 50,
    bottom: window.innerHeight,
  } as DOMRect);
  renderApp(
    <UpdateWidget reload={vi.fn()} />,
    testDeps({ "GET /api/update": jsonAnswer(available) }),
  );
  await ready();
  expect(control().style.bottom).toBe("62px");
  footer.remove();
});
