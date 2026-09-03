import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp, testDeps } from "@/test-app";
import { VersionPrompt } from "./version-prompt.js";

afterEach(cleanup);

const title = "Slopify was updated";

describe("the stale-version prompt", () => {
  it("stays quiet while the app keeps serving the version this tab loaded from", () => {
    const { deps } = renderApp(<VersionPrompt reload={vi.fn()} />, testDeps({}));

    act(() => {
      deps.version.observe("1.0.0");
      deps.version.observe("1.0.0");
    });

    expect(screen.queryByText(title)).toBeNull();
  });

  it("asks for a reload and names the version now running", () => {
    const { deps } = renderApp(<VersionPrompt reload={vi.fn()} />, testDeps({}));

    act(() => {
      deps.version.observe("1.0.0");
      deps.version.observe("1.1.0");
    });

    expect(screen.getByText(title)).not.toBeNull();
    expect(screen.getByText(/Version 1\.1\.0 is running now/)).not.toBeNull();
  });

  it("reloads the tab when the one control is pressed", async () => {
    const reload = vi.fn();
    const { deps } = renderApp(<VersionPrompt reload={reload} />, testDeps({}));

    act(() => {
      deps.version.observe("1.0.0");
      deps.version.observe("1.1.0");
    });
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("cannot be dismissed: the tab stays stale until it reloads", async () => {
    const { deps } = renderApp(<VersionPrompt reload={vi.fn()} />, testDeps({}));

    act(() => {
      deps.version.observe("1.0.0");
      deps.version.observe("1.1.0");
    });
    await userEvent.keyboard("{Escape}");

    expect(screen.getByText(title)).not.toBeNull();
  });
});
