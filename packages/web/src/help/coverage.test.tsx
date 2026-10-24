import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button, IconButton, PlayKey } from "@/components/kit/button";
import { Field, HelpLine, Input, Select } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Segmented, Switch } from "@/components/kit/switch";
import { LabelledSwitch } from "@/components/labelled-switch";
import { catalog, type HelpId } from "./catalog.js";
import { unexplainedControls } from "./coverage.js";

afterEach(cleanup);

const tip = Object.keys(catalog)[0] as HelpId;
const names = (root: Element, allow: readonly (string | RegExp)[] = []) =>
  unexplainedControls(root, allow).map((control) => control.name);

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

describe("a walk also names", () => {
  it("jargon in a control's name, even when the walk allows the control", () => {
    const { container } = render(
      <div>
        <Field label="TTS model" help="Reads the article aloud.">
          <Input />
        </Field>
        <Field label="Chunking" help="How the text is split.">
          <Input />
        </Field>
        <Field label="Voice model" help="Reads the article aloud.">
          <Input />
        </Field>
      </div>,
    );
    expect(names(container, ["TTS model"])).toEqual([
      "Jargon in a label: TTS model",
      "Jargon in a label: Chunking",
    ]);
  });

  it("jargon on a button, a link, a tab or a heading, and an action named for the machinery", () => {
    const { container } = render(
      <div>
        <h2>Subtitles</h2>
        <h3>Rendering</h3>
        <Button>Pick an LLM</Button>
        <a href="/x">TTS settings</a>
        <div role="tablist">
          <button type="button" role="tab" aria-selected="true">
            ASR
          </button>
        </div>
        <Button>Render again</Button>
        <Button>Regenerate all images</Button>
        <Button>Make the preview again</Button>
        <a href="/y">Remake</a>
        {/* A service's own model name in a list of choices is a name, not jargon. */}
        <Field label="Voice model" help="Reads the article aloud.">
          <Select>
            <option>GPT-4o mini TTS</option>
          </Select>
        </Field>
        <div hidden>
          <Button>Render hidden</Button>
        </div>
      </div>,
    );
    expect(names(container)).toEqual([
      "Jargon in a label: Subtitles",
      "Jargon in a label: Pick an LLM",
      "Jargon in a label: TTS settings",
      "Jargon in a label: ASR",
      "Named for the machinery, not its result: Render again",
      "Named for the machinery, not its result: Regenerate all images",
      "Named for the machinery, not its result: Remake",
    ]);
  });

  it("an info button after a button, a heading or a row's title, or inside a heading", () => {
    const { container } = render(
      <div>
        <div>
          <Button>Apply</Button>
          <InfoTip id={tip} label="Apply" />
        </div>
        <div>
          <h3>Rows</h3>
          <InfoTip id={tip} label="Rows" />
        </div>
        <div>
          <span className="sl-row__title">Cleopatra</span>
          <InfoTip id={tip} label="Cleopatra" />
        </div>
        <h2>
          Voices <InfoTip id={tip} label="Voices" />
        </h2>
        {/* Beside a field's label is where it belongs, and a hidden one is never met. */}
        <Field label="Spend ceiling" tip={tip}>
          <Input />
        </Field>
        <div hidden>
          <Button>Hidden</Button>
          <InfoTip id={tip} label="Hidden" />
        </div>
      </div>,
    );
    expect(names(container)).toEqual([
      "Info button after a button: About Apply",
      "Info button after a heading: About Rows",
      "Info button after a row's title: About Cleopatra",
      "Info button inside a heading: About Voices",
    ]);
  });

  it("an info button beside a button or a heading even when either is wrapped, or before one", () => {
    const { container } = render(
      <div>
        <div>
          <Button>Refresh keyword facts</Button>
          <span>
            <InfoTip id={tip} label="Wrapped tip" />
          </span>
        </div>
        <div>
          <span>
            <Button>Save name</Button>
          </span>
          <InfoTip id={tip} label="Wrapped button" />
        </div>
        <div>
          <span>
            <IconButton label="Rename">
              <svg aria-hidden="true" />
            </IconButton>
          </span>
          <InfoTip id={tip} label="Icon button" />
        </div>
        <div>
          <InfoTip id={tip} label="Before" />
          <Button>Apply</Button>
        </div>
        <div>
          <h1>Settings</h1>
          <InfoTip id={tip} label="Page title" />
        </div>
        <div>
          <h6>Live writing</h6>
          <InfoTip id={tip} label="Small heading" />
        </div>
        {/* Ending a sentence, or beside a field's label with a button for its control, it
            is where it belongs. */}
        <p>
          <Button>Copy</Button> the words, then paste them. <InfoTip id={tip} label="Sentence" />
        </p>
        <Field label="Pairing token" tip={tip}>
          <Button>Copy the token</Button>
        </Field>
      </div>,
    );
    expect(names(container)).toEqual([
      "Info button after a button: About Wrapped tip",
      "Info button after a button: About Wrapped button",
      "Info button after a button: About Icon button",
      "Info button before a button: About Before",
      "Info button after a heading: About Page title",
      "Info button after a heading: About Small heading",
    ]);
  });

  it("a second info button in one field", () => {
    const { container } = render(
      <div {...helpScope}>
        <input aria-label="Start" />
        <span>
          <InfoTip id={tip} label="Start" />
        </span>
        <span>
          <InfoTip id={tip} label="End" />
        </span>
      </div>,
    );
    expect(names(container)).toEqual(["Two info buttons in one field: About End"]);
  });

  it("a second enabled primary in one area; a dialog, an aside, a list item or a marked area is its own", () => {
    const { container } = render(
      <div>
        <PlayKey>Make the video</PlayKey>
        <Button variant="primary">Save</Button>
        <Button variant="primary" disabled>
          Queue 3 videos
        </Button>
        <Button
          variant="primary"
          disabled
          disabledReason="Type a topic first"
          focusableWhenDisabled
        >
          Make 3 videos
        </Button>
        <aside>
          <Button variant="primary">Save draft</Button>
        </aside>
        <ul>
          <li>
            <Button variant="primary">Approve</Button>
          </li>
          <li>
            <Button variant="primary">Approve</Button>
          </li>
        </ul>
        <div data-area="">
          <Button variant="primary">Add titles</Button>
        </div>
        <div role="dialog" aria-label="Rename">
          <Button variant="primary">Rename</Button>
        </div>
        <div hidden>
          <Button variant="primary">Hidden</Button>
        </div>
      </div>,
    );
    expect(names(container)).toEqual(["Second primary in one area: Save (after Make the video)"]);
  });
});
