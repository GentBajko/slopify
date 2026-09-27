import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Field, Input } from "@/components/kit/field";
import { InfoTip } from "@/components/kit/info-tip";
import { Switch } from "@/components/kit/switch";
import { catalog, type HelpId } from "./catalog.js";
import { unexplainedControls } from "./coverage.js";

afterEach(cleanup);

const id = Object.keys(catalog)[0] as HelpId;
const entry = catalog[id];

describe("an info button", () => {
  it("is a named button in the tab order that opens on Enter and closes on Esc", async () => {
    render(<InfoTip id={id} />);
    const button = screen.getByRole("button", { name: `About ${entry.title}` });
    await userEvent.tab();
    expect(document.activeElement).toBe(button);
    await userEvent.keyboard("{Enter}");
    const words = entry.body.split("\n\n")[0] as string;
    expect(await screen.findByText(words)).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText(words)).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  it("opens on a press, for touch and pointer alike, and does not open on hover", async () => {
    render(<InfoTip id={id} label="this spot" />);
    const button = screen.getByRole("button", { name: "About this spot" });
    await userEvent.hover(button);
    expect(screen.queryByText(entry.title, { selector: "p" })).toBeNull();
    await userEvent.click(button);
    expect(await screen.findByText(entry.title, { selector: "p" })).toBeTruthy();
  });
});

describe("the coverage check", () => {
  it("passes a field and a switch that carry a tip and names the ones that do not", () => {
    const { container } = render(
      <div>
        <Field label="Explained" tip={id}>
          <Input />
        </Field>
        <Field label="Bare">
          <Input />
        </Field>
        <Switch checked={false} onChange={() => {}} label="Explained switch" tip={id} />
        <Switch checked={false} onChange={() => {}} label="Bare switch" />
        <input aria-label="Search projects" />
      </div>,
    );
    expect(unexplainedControls(container, [/^Search/]).map((control) => control.name)).toEqual([
      "Bare",
      "Bare switch",
    ]);
  });
});
