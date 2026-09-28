import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Entry } from "@/api";
import { revisionView } from "./revision-fixture.js";
import { RevisionPrompts } from "./revision-prompts.js";

afterEach(cleanup);
// A browser's storage, fresh for each test.
beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  });
});

const outro = (body: string): Entry => ({
  id: "e1",
  category: "outro",
  mode: "llm",
  name: "Closing",
  body,
  slots: [],
  updatedAt: "today",
});

function edit(): RevisionEdit {
  const { config, content } = revisionView().revision;
  return {
    config: { ...config, outro: { name: "Closing", mode: "llm" } },
    content: { ...content, promptTemplates: { ...content.promptTemplates, outro: "Say goodbye." } },
  };
}

it("offers the Library's newer outro, or keeping the project's own", async () => {
  const onChange = vi.fn();
  const mount = () =>
    render(
      <RevisionPrompts
        edit={edit()}
        prompts={[]}
        entries={[outro("Say goodbye warmly.")]}
        onChange={onChange}
      />,
    );
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Use the Library version for Outro" }));
  expect(onChange.mock.lastCall?.[0].content.promptTemplates.outro).toBe("Say goodbye warmly.");

  await userEvent.click(
    screen.getByRole("button", { name: "Keep this project's version for Outro" }),
  );
  expect(screen.queryByText(/has changed since this project copied it/)).toBeNull();
  // Remembered for these two texts, so it stays quiet after a reload.
  cleanup();
  mount();
  expect(screen.queryByText(/has changed since this project copied it/)).toBeNull();
});

it("asks again when the Library changes once more", () => {
  window.localStorage.setItem("slopify.library-kept", JSON.stringify(["Outro:x:y"]));
  render(
    <RevisionPrompts
      edit={edit()}
      prompts={[]}
      entries={[outro("A third wording.")]}
      onChange={() => {}}
    />,
  );
  expect(screen.getByText(/The Library's "Closing" has changed/)).toBeDefined();
});
