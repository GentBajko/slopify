import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RawPromptField } from "./raw-prompt-field";

afterEach(cleanup);

function Raw({
  start,
  promptKey,
  script,
  textEntry,
}: {
  readonly start: string;
  readonly promptKey: string;
  readonly script?: boolean;
  readonly textEntry?: boolean;
}) {
  const [value, setValue] = useState(start);
  return (
    <RawPromptField
      id="raw"
      name="Thing"
      promptKey={promptKey}
      script={script}
      textEntry={textEntry}
      value={value}
      onChange={setValue}
    />
  );
}

const box = () => screen.getByLabelText("Prompt for Thing") as HTMLTextAreaElement;

describe("a project's raw prompt", () => {
  it("judges keywords by where the prompt runs", () => {
    const { container, unmount } = render(
      <Raw start="{{Slopify_Summary}}" promptKey="imagePrompts.0" />,
    );
    expect(container.querySelector("[data-keyword-kind]")?.getAttribute("data-keyword-kind")).toBe(
      "known",
    );
    expect(box().getAttribute("aria-invalid")).toBe("false");
    unmount();

    render(<Raw start="{{Slopify_Summary}}" promptKey="article" />);
    expect(box().getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.getByText(
        /\{\{Slopify_Summary\}\} at line 1, column 1 can't be used in an Article prompt/,
      ),
    ).not.toBeNull();
  });

  it("names a script's prompt by its own kind", () => {
    render(<Raw start="{{Slopify_Chapters}}" promptKey="article" script />);
    expect(screen.getByText(/can't be used in a Script prompt/)).not.toBeNull();
  });

  it("still names a malformed brace", () => {
    render(<Raw start="Open {{ here" promptKey="thumbnailPrompt" />);
    expect(screen.getByText(/The `\{\{` at line 1, column 6 is never closed/)).not.toBeNull();
  });

  it("offers Update to new names on a picture prompt that uses an old one", async () => {
    const user = userEvent.setup();
    render(<Raw start="{{Appearance}} in {{Scene}}" promptKey="thumbnailPrompt" />);
    const banner = screen.getByRole("status", { name: "Update to new names" });
    await user.click(within(banner).getByRole("button", { name: "Update {{Appearance}}" }));
    expect(box().value).toBe("{{Slopify_Appearance}} in {{Scene}}");
    await user.click(within(banner).getByRole("button", { name: "Update {{Scene}}" }));
    expect(box().value).toBe("{{Slopify_Appearance}} in {{Slopify_Scene}}");
    expect(screen.queryByRole("status", { name: "Update to new names" })).toBeNull();
  });

  it("offers nothing where the old name was always plain text, or for a key it doesn't know", () => {
    render(<Raw start="{{Scene}} {{Slopify_Summary}}" promptKey="somethingElse" />);
    expect(screen.queryByRole("status", { name: "Update to new names" })).toBeNull();
    expect(box().getAttribute("aria-invalid")).toBe("false");
  });

  it("refuses the release date in a Text intro, which is narrated as written", () => {
    const { unmount } = render(
      <Raw start="Out {{Slopify_Release_Date}}" promptKey="intro" textEntry />,
    );
    expect(
      screen.getByText(/can't be used in an intro that says these exact words/),
    ).not.toBeNull();
    unmount();
    render(<Raw start="Out {{Slopify_Release_Date}}" promptKey="intro" />);
    expect(box().getAttribute("aria-invalid")).toBe("false");
  });

  it("offers the Insert menu for the prompt's place and puts the keyword at the caret", async () => {
    const user = userEvent.setup();
    render(<Raw start="ab" promptKey="article" />);
    box().focus();
    box().setSelectionRange(1, 1);
    await user.click(screen.getByRole("button", { name: "Insert a keyword Slopify fills" }));
    const menu = await screen.findByRole("menu", { name: "Insert a keyword Slopify fills" });
    expect(within(menu).queryByRole("menuitem", { name: /^\{\{Slopify_Scene\}\}/u })).toBeNull();
    await user.click(within(menu).getAllByRole("menuitem")[0] as HTMLElement);
    expect(box().value).toMatch(/^a\{\{Slopify_\w+\}\}b$/);
  });

  it("lists the scene keywords for a picture prompt", async () => {
    const user = userEvent.setup();
    render(<Raw start="" promptKey="imagePrompts.0" />);
    await user.click(screen.getByRole("button", { name: "Insert a keyword Slopify fills" }));
    const menu = await screen.findByRole("menu", { name: "Insert a keyword Slopify fills" });
    expect(within(menu).getByRole("menuitem", { name: /^\{\{Slopify_Scene\}\}/u })).not.toBeNull();
  });

  it("says a scene keyword has no effect on the establishing image or a short's picture", () => {
    for (const promptKey of ["referencePrompt", "shortsImage"]) {
      const { unmount } = render(<Raw start={"A hall\n{{Slopify_Scene}}"} promptKey={promptKey} />);
      expect(screen.getByText(/has no effect here/)).not.toBeNull();
      unmount();
    }
    render(<Raw start={"A hall\n{{Slopify_Scene}}"} promptKey="imagePrompts.0" />);
    expect(screen.queryByText(/has no effect here/)).toBeNull();
  });
});
