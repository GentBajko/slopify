import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Field, HelpLine, Input } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { Segmented, Switch } from "@/components/kit/switch";
import { LabelledSwitch } from "@/components/labelled-switch";
import { catalog, type HelpId } from "./catalog.js";
import { unexplainedControls } from "./coverage.js";

afterEach(cleanup);

const tip = Object.keys(catalog)[0] as HelpId;
const names = (root: Element) => unexplainedControls(root).map((control) => control.name);

describe("a visible help line explains its control", () => {
  it("in a field, a switch, a segmented choice and a labelled switch", () => {
    const { container } = render(
      <div>
        <Field label="Article length" help="About 150 words is one minute.">
          <Input />
        </Field>
        <Switch
          checked={false}
          onChange={() => {}}
          label="Pause after the images"
          help="The run waits on Home until you approve them."
        />
        <Segmented
          label="Shape"
          value="wide"
          onChange={() => {}}
          options={[
            { value: "wide", label: "16:9" },
            { value: "tall", label: "9:16" },
          ]}
          help="Tall is for shorts and phones."
        />
        <LabelledSwitch
          label="What it writes"
          value="article"
          options={[
            { value: "article", label: "Article" },
            { value: "image", label: "Image" },
          ]}
          help="An article prompt writes the narration."
          onPick={() => {}}
        />
      </div>,
    );
    expect(names(container)).toEqual([]);
  });

  it("is read as the control's description", () => {
    render(
      <>
        <Switch
          checked={false}
          onChange={() => {}}
          label="Captions"
          describedBy="outside"
          help="Words on screen as they are spoken."
        />
        <Segmented
          label="Shape"
          value="wide"
          onChange={() => {}}
          options={[{ value: "wide", label: "16:9" }]}
          help="Tall is for shorts."
        />
      </>,
    );
    const toggle = screen.getByRole("switch", { name: "Captions" });
    const ids = toggle.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(ids[0]).toBe("outside");
    expect(document.getElementById(ids[1] ?? "")?.textContent).toBe(
      "Words on screen as they are spoken.",
    );
    const group = screen.getByRole("group", { name: "Shape" });
    expect(document.getElementById(group.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Tall is for shorts.",
    );
  });

  it("in a row that lays out its own control", () => {
    const { container } = render(
      <div {...helpScope}>
        <input type="checkbox" aria-label="Upload captions" />
        <HelpLine>Sends the .srt with the video.</HelpLine>
      </div>,
    );
    expect(names(container)).toEqual([]);
  });

  it("still lets an info button explain its control", () => {
    const { container } = render(
      <Field label="Daily sample budget" tip={tip}>
        <Input />
      </Field>,
    );
    expect(names(container)).toEqual([]);
  });
});

describe("a help line does not explain its control", () => {
  it("when it is empty, hidden, for screen readers only, or outside the control's scope", () => {
    const { container } = render(
      <div>
        <div {...helpScope}>
          <input aria-label="Empty" />
          <HelpLine>{"  "}</HelpLine>
        </div>
        <div {...helpScope}>
          <input aria-label="Hidden" />
          <p data-help-text="" hidden>
            Hidden words.
          </p>
        </div>
        <div {...helpScope}>
          <input aria-label="Collapsed" />
          <p data-help-text="" style={{ display: "none" }}>
            Collapsed words.
          </p>
        </div>
        <div {...helpScope}>
          <input aria-label="Screen reader only" />
          <p data-help-text="" className="sr-only">
            Read aloud only.
          </p>
        </div>
        <div>
          <div {...helpScope}>
            <input aria-label="Outside" />
          </div>
          <HelpLine>Beside the scope, not in it.</HelpLine>
        </div>
        <Field label="Bare">
          <Input />
        </Field>
        <p className="sl-help">A sentence that is not marked as help.</p>
        <Switch checked={false} onChange={() => {}} label="Bare switch" />
      </div>,
    );
    expect(names(container)).toEqual([
      "Empty",
      "Hidden",
      "Collapsed",
      "Screen reader only",
      "Outside",
      "Bare",
      "Bare switch",
    ]);
  });
});
