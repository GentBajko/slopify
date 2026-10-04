import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { renderApp, testDeps } from "@/test-app";
import { CaptionEditor } from "./caption-editor.js";

afterEach(cleanup);
it("keeps an invalid time visible without emitting a saved cue", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  renderApp(
    <CaptionEditor
      cues={[{ id: "c1", text: "Hello", start: 0, end: 1 }]}
      duration={2}
      onChange={changed}
      onPending={() => {}}
    />,
    testDeps({}),
  );
  const end = screen.getByRole("textbox", { name: "End for caption 1" });
  await user.clear(end);
  await user.type(end, "3");
  await user.click(screen.getByRole("button", { name: "Apply caption edits to draft" }));
  expect(changed).not.toHaveBeenCalled();
  if (!(end instanceof HTMLInputElement)) throw new Error("Expected caption end input.");
  expect(end.value).toBe("3");
  expect(screen.getByRole("alert").textContent).toContain("end of the narration");
});

it.each([
  ["Start for caption 1", "", "start must"],
  ["Start for caption 1", "-1", "start must"],
  ["End for caption 1", "banana", "end of the narration"],
  ["Start for caption 2", "0.5", "start must"],
  ["Text for caption 1", "", "enter caption text"],
])("retains invalid %s input %s without emitting cues", async (name, value, message) => {
  const user = userEvent.setup();
  const changed = vi.fn();
  const pending = vi.fn();
  renderApp(
    <CaptionEditor
      cues={[
        { id: "a", text: "One", start: 0, end: 1 },
        { id: "b", text: "Two", start: 1, end: 2 },
      ]}
      duration={3}
      onChange={changed}
      onPending={pending}
    />,
    testDeps({}),
  );
  const input = screen.getByRole("textbox", { name });
  await user.clear(input);
  if (value !== "") await user.type(input, value);
  await user.click(screen.getByRole("button", { name: "Apply caption edits to draft" }));
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain(message);
  expect(pending).toHaveBeenLastCalledWith(true);
  expect((input as HTMLInputElement).value).toBe(value);
});

it("emits finite typed cues only after Apply, and releases dirty state on apply and unmount", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  const pending = vi.fn();
  const mounted = renderApp(
    <CaptionEditor
      cues={[{ id: "a", text: "One", start: 0, end: 1 }]}
      duration={3}
      onChange={changed}
      onPending={pending}
    />,
    testDeps({}),
  );
  const end = screen.getByRole("textbox", { name: "End for caption 1" });
  await user.clear(end);
  await user.type(end, "2.5");
  expect(changed).not.toHaveBeenCalled();
  expect(pending).toHaveBeenLastCalledWith(true);
  await user.click(screen.getByRole("button", { name: "Apply caption edits to draft" }));
  expect(changed).toHaveBeenCalledExactlyOnceWith([{ id: "a", text: "One", start: 0, end: 2.5 }]);
  expect(pending).toHaveBeenLastCalledWith(false);
  await user.clear(end);
  expect(pending).toHaveBeenLastCalledWith(true);
  mounted.unmount();
  expect(pending).toHaveBeenLastCalledWith(false);
});

it("keeps each caption's speaker when its text or timing is edited", async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  renderApp(
    <CaptionEditor
      cues={[
        { id: "c1", text: "Hello", start: 0, end: 1, speaker: "host" },
        { id: "c2", text: "Hi", start: 1, end: 2 },
      ]}
      duration={3}
      onChange={changed}
      onPending={() => {}}
    />,
    testDeps({}),
  );
  const text = screen.getByRole("textbox", { name: "Text for caption 1" });
  await user.clear(text);
  await user.type(text, "Hello there");
  await user.click(screen.getByRole("button", { name: "Apply caption edits to draft" }));
  expect(changed).toHaveBeenCalledWith([
    { id: "c1", text: "Hello there", start: 0, end: 1, speaker: "host" },
    { id: "c2", text: "Hi", start: 1, end: 2 },
  ]);
});

it("plays a caption's own stretch as typed, before it is applied", async () => {
  const user = userEvent.setup();
  const play = vi.fn();
  renderApp(
    <CaptionEditor
      cues={[{ id: "c1", text: "Hello", start: 1, end: 2 }]}
      duration={5}
      onChange={() => {}}
      onPending={() => {}}
      audition={{ element: null, play, stop: () => {}, playing: undefined }}
    />,
    testDeps({}),
  );
  const end = screen.getByRole("textbox", { name: "End for caption 1" });
  await user.clear(end);
  await user.type(end, "2.5");
  await user.click(screen.getByRole("button", { name: "Play caption 1" }));
  expect(play).toHaveBeenCalledWith(1, 2.5, "c1");
});

it("offers no Play without a finished file to hear", () => {
  renderApp(
    <CaptionEditor
      cues={[{ id: "c1", text: "Hello", start: 1, end: 2 }]}
      duration={5}
      onChange={() => {}}
      onPending={() => {}}
    />,
    testDeps({}),
  );
  expect(screen.queryByRole("button", { name: "Play caption 1" })).toBeNull();
});
