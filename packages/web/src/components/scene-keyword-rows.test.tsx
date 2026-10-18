import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SceneKeywordRows, sceneKeywordUses } from "./scene-keyword-rows";

afterEach(cleanup);

describe("pictures that get their scene by keyword", () => {
  it("names each picture whose prompt uses a scene keyword, with the first one it uses", () => {
    expect(
      sceneKeywordUses([
        { label: '"Oils"', body: "Oil, {{Slopify_Mood}}, {{Slopify_Setting}}" },
        { label: '"Maps"', body: "A map with {{Scene}}" },
        { label: "the thumbnail", body: "{{Slopify_Scene}}" },
        { label: '"Gone"', body: undefined },
      ]),
    ).toEqual([
      { label: '"Oils"', keyword: "Slopify_Mood" },
      { label: "the thumbnail", keyword: "Slopify_Scene" },
    ]);
  });

  it("shows each as an on switch that can't be changed here, and nothing when none", () => {
    const { container, rerender } = render(
      <SceneKeywordRows uses={[{ label: '"Oils"', keyword: "Slopify_Setting" }]} />,
    );
    const row = screen.getByRole("switch", { name: 'On for "Oils": it uses {{Slopify_Setting}}' });
    expect(row.getAttribute("aria-checked")).toBe("true");
    expect((row as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "About Scenes on for one picture" })).not.toBeNull();
    rerender(<SceneKeywordRows uses={[]} />);
    expect(container.textContent).toBe("");
  });
});
