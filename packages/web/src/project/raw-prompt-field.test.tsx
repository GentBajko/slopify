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
}: {
  readonly start: string;
  readonly promptKey: string;
  readonly script?: boolean;
}) {
  const [value, setValue] = useState(start);
  return (
    <RawPromptField
      id="raw"
      name="Thing"
      promptKey={promptKey}
      script={script}
      value={value}
      onChange={setValue}
    />
  );
}

const box = () => screen.getByLabelText("Raw prompt for Thing") as HTMLTextAreaElement;

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
});
