import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KeywordCard } from "./keyword-card.js";

afterEach(cleanup);

describe("KeywordCard", () => {
  it("says an old name keeps working once, not twice beside the lint's sentence", () => {
    const problem =
      "{{Scene}} at line 1, column 42 is the old name of {{Slopify_Scene}}. It keeps working; use Update to new names in the editor to rename it.";
    const { container } = render(<KeywordCard name="Scene" problem={problem} />);
    expect(container.textContent?.match(/old name/g)).toHaveLength(1);
    expect(screen.getByText(problem)).toBeTruthy();
  });

  it("names the old name when no lint sentence says so", () => {
    const { container } = render(<KeywordCard name="Scene" />);
    expect(container.textContent).toContain("{{Scene}} is its old name, which keeps working.");
  });
});
