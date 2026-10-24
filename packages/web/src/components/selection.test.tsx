import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, expect, it } from "vitest";
import { RowCheck, SelectionBar, useSelection } from "./selection";

afterEach(cleanup);

const rows = ["a", "b", "c", "d"] as const;

function Harness(): ReactElement {
  const selection = useSelection<string>(rows);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: test harness for the list's Esc.
    <div onKeyDown={selection.onKeyDown}>
      <SelectionBar
        selection={selection}
        total={rows.length}
        noun={["row", "rows"]}
        actions={<button type="button">Delete selected</button>}
      />
      {rows.map((row) => (
        <RowCheck key={row} selection={selection} value={row} label={row.toUpperCase()} />
      ))}
      <output>{selection.selected.join(",")}</output>
    </div>
  );
}

const box = (name: string): HTMLInputElement =>
  screen.getByRole("checkbox", { name: `Select row: ${name}` }) as HTMLInputElement;

it("ticks a range with Shift+click and keeps row order", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(box("D"));
  await user.keyboard("{Shift>}");
  await user.click(box("B"));
  await user.keyboard("{/Shift}");
  expect(document.querySelector("output")?.textContent).toBe("b,c,d");
  expect(screen.getByText("3 of 4 rows selected")).not.toBeNull();
});

it("toggles with Space and clears with Esc", async () => {
  render(<Harness />);
  box("A").focus();
  await userEvent.keyboard(" ");
  expect(box("A").checked).toBe(true);
  const all = screen.getByRole("checkbox", { name: "Select all" }) as HTMLInputElement;
  expect(all.indeterminate).toBe(true);
  await userEvent.keyboard("{Escape}");
  expect(box("A").checked).toBe(false);
  expect(screen.getByText("4 rows")).not.toBeNull();
});

// A bulk action with nothing ticked reads as a page action that applies to nothing (a red
// Delete above every list), so the actions and Clear appear only once a box is ticked.
it("shows the bulk actions and Clear only while something is ticked", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  expect(screen.getByText("4 rows")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Delete selected" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Clear selection" })).toBeNull();
  await user.click(box("C"));
  expect(screen.getByRole("button", { name: "Delete selected" })).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(screen.queryByRole("button", { name: "Delete selected" })).toBeNull();
});

it("selects and clears everything from Select all", async () => {
  render(<Harness />);
  await userEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
  expect(document.querySelector("output")?.textContent).toBe("a,b,c,d");
  await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(document.querySelector("output")?.textContent).toBe("");
});
