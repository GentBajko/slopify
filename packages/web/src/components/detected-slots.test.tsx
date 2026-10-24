import type { PromptDraft } from "@app/slices/library/model.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { bodyProblems, draftProblems, draftWarnings, slotNames } from "@/lib/draft-lint";
import { DetectedSlots } from "./detected-slots";

afterEach(cleanup);

function Panel({
  start,
  kind = "image",
}: {
  readonly start: string;
  readonly kind?: "image" | "article";
}) {
  const [body, setBody] = useState(start);
  const draft: PromptDraft = { kind, name: "x", body };
  return (
    <>
      <output aria-label="Body now">{body}</output>
      <DetectedSlots
        slots={slotNames(body)}
        body={body}
        lint={bodyProblems(draftProblems(draft, []))}
        warnings={draftWarnings(draft)}
        lintId="lint"
        place={kind}
        onChange={setBody}
      />
    </>
  );
}

const now = () => screen.getByLabelText("Body now").textContent;

describe("the Asks you for panel", () => {
  it("lists the keywords Slopify fills apart from the person's own", () => {
    render(<Panel start="{{Topic}} {{Slopify_Title}} {{Slopify_Mood}} {{Era}}" />);
    const own = screen.getByRole("list", { name: "Your keywords" });
    expect(
      within(own)
        .getAllByRole("listitem")
        .map((one) => one.textContent),
    ).toEqual(["Topic", "Era"]);
    const filled = screen.getByRole("list", { name: "Keywords Slopify fills" });
    expect(
      within(filled)
        .getAllByRole("listitem")
        .map((one) => one.textContent),
    ).toEqual(["Title", "Mood"]);
    expect(screen.getByText("Slopify fills in")).not.toBeNull();
    expect(
      screen.getByText(
        "Each keyword becomes a question on Create, answered each time you make a video.",
      ),
    ).not.toBeNull();
  });

  it("says a text of keywords Slopify fills alone asks you for nothing", () => {
    render(<Panel start="By {{Slopify_Channel}}" />);
    expect(screen.queryByRole("list", { name: "Your keywords" })).toBeNull();
    expect(
      screen.getByText("It asks you for nothing: Slopify fills every keyword here."),
    ).not.toBeNull();
  });

  it("warns about a keyword where it can't be filled, which Save lets through", async () => {
    const user = userEvent.setup();
    render(<Panel start={"Line\nRecap {{Slopify_Summary}}"} kind="article" />);
    expect(screen.getByText("1 keyword warning")).not.toBeNull();
    expect(
      screen.getByText(
        /\{\{Slopify_Summary\}\} at line 2, column 7 can't be used in an Article prompt/,
      ),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Go to line 2, column 7" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Go to line 2, column 7" }));
  });

  it("updates {{Appearance}} on its own, silently, and leaves {{Scene}}", async () => {
    const user = userEvent.setup();
    render(<Panel start="{{Scene}}, worn {{Appearance}}" />);
    const banner = screen.getByRole("status", { name: "Update to new names" });
    expect(banner.textContent).toContain(
      "{{Appearance}} means exactly the same as {{Slopify_Appearance}}",
    );
    await user.click(within(banner).getByRole("button", { name: "Update {{Appearance}}" }));
    expect(now()).toBe("{{Scene}}, worn {{Slopify_Appearance}}");
    expect(screen.getByRole("status", { name: "Update to new names" })).not.toBeNull();
  });

  it("says what updating {{Scene}} costs on its own button", async () => {
    const user = userEvent.setup();
    render(<Panel start="A {{ Scene }} and {{Scene}}" />);
    const banner = screen.getByRole("status", { name: "Update to new names" });
    expect(within(banner).queryByRole("button", { name: "Update {{Appearance}}" })).toBeNull();
    const button = within(banner).getByRole("button", { name: "Update {{Scene}}" });
    const said = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(said?.textContent).toBe(
      "With {{Slopify_Scene}} this picture gets its scene even with Images → Scenes from the article off, which adds one AI call per run.",
    );
    await user.click(button);
    expect(now()).toBe("A {{Slopify_Scene}} and {{Slopify_Scene}}");
    expect(screen.queryByRole("status", { name: "Update to new names" })).toBeNull();
  });

  it("offers nothing for an old name where it was always plain text", () => {
    render(<Panel start="{{Scene}}" kind="article" />);
    expect(screen.queryByRole("status", { name: "Update to new names" })).toBeNull();
    expect(screen.queryByText(/keyword warning/)).toBeNull();
  });
});
