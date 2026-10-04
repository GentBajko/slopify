import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readDraft } from "@/lib/draft-store";
import { isRevisionEdit } from "@/project/draft-merge";
import { revisionView } from "@/project/revision-fixture";
import { RevisionWorkspace } from "@/project/revision-workspace";
import { revisionDraftKey } from "@/project/use-durable-draft";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
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

  it("keeps a dirty project edit through the reload and says so", async () => {
    const items = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        get length() {
          return items.size;
        },
        clear: () => items.clear(),
        getItem: (key: string) => items.get(key) ?? null,
        key: (index: number) => [...items.keys()][index] ?? null,
        removeItem: (key: string) => items.delete(key),
        setItem: (key: string, value: string) => items.set(key, value),
      },
    });
    const user = userEvent.setup();
    const reload = vi.fn();
    const { deps } = renderApp(
      <>
        <RevisionWorkspace
          projectId="p1"
          currentRevisionId="r1"
          renderEditor={({ edit, onChange }) => (
            <label>
              Project title
              <input
                value={edit.config.title}
                onChange={(event) =>
                  onChange({ ...edit, config: { ...edit.config, title: event.target.value } })
                }
              />
            </label>
          )}
        />
        <VersionPrompt reload={reload} />
      </>,
      testDeps({
        "GET /api/projects/p1/revisions/r1": jsonAnswer({ view: revisionView() }),
        "POST /api/projects/p1/revisions/prepare": jsonAnswer({
          ok: true,
          view: revisionView(),
          created: false,
        }),
      }),
    );
    await user.click(screen.getByRole("button", { name: "Edit project" }));
    const field = await screen.findByRole("textbox", { name: "Project title" });
    await user.clear(field);
    await user.type(field, "Half-written");

    act(() => {
      deps.version.observe("1.0.0");
      deps.version.observe("1.1.0");
    });

    expect(readDraft(revisionDraftKey("p1"), isRevisionEdit)?.value.config.title).toBe(
      "Half-written",
    );
    expect(screen.getByText(/Your unsaved edit is kept in this browser/)).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, "localStorage", { configurable: true, value: undefined });
  });
});
