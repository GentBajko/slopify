import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KeywordList } from "./keyword-list.js";

afterEach(cleanup);

describe("KeywordList read-only", () => {
  it("says Slopify fills its own keywords instead of calling them empty", () => {
    render(
      <KeywordList
        keywords={[
          { name: "Slopify_Title", value: "", feeds: ["Article"] },
          { name: "Era", value: "", feeds: ["Article"] },
          { name: "Topic", value: "", feeds: ["Project title"], topic: true },
        ]}
      />,
    );
    const rows = screen.getAllByRole("listitem").map((row) => row.textContent ?? "");
    expect(rows[0]).toContain("filled by Slopify");
    expect(rows[0]).not.toContain("empty");
    expect(rows[1]).toContain("empty");
    expect(rows[2]).toContain("the topic");
  });

  it("keeps a value the person gave a Slopify_ name", () => {
    render(<KeywordList keywords={[{ name: "Slopify_Title", value: "Mine", feeds: [] }]} />);
    expect(screen.getByRole("listitem").textContent).toContain("Mine");
  });
});
