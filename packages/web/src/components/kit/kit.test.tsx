import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button.js";
import { ConfirmDialog } from "./dialog.js";
import { Field, Input, Select, Textarea } from "./field.js";
import { hitArea, hitTarget, List, ListRow } from "./list-row.js";
import { Lightbox, type LightboxItem, MediaFrame, MediaGrid } from "./media.js";
import { ReadingView, splitSections } from "./reading-view.js";
import { Segmented, Switch } from "./switch.js";
import { Tabs } from "./tabs.js";

afterEach(() => {
  cleanup();
});

describe("tabs", () => {
  function Harness() {
    const [value, setValue] = useState<"a" | "b" | "c" | "d">("a");
    return (
      <Tabs
        label="Project"
        idPrefix="t"
        value={value}
        onChange={setValue}
        items={[
          { id: "a", label: "Article" },
          { id: "b", label: "Images", disabled: true },
          { id: "c", label: "Video" },
          { id: "d", label: "Shorts", badge: "3" },
        ]}
      />
    );
  }

  it("keeps only the selected tab in the tab order and ties it to its panel", () => {
    render(<Harness />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]?.getAttribute("aria-controls")).toBe("t-panel-a");
  });

  it("moves with the arrows past disabled tabs, wraps, and jumps with Home and End", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("tab", { name: "Article" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Video" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Video" }));
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Article" }));
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Shorts/ }));
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Article" }).getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: /Shorts/ }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("a field", () => {
  it("labels its control and describes it with the help line", () => {
    render(
      <Field label="Title" help="Shown on YouTube.">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("Title");
    const help = screen.getByText("Shown on YouTube.");
    expect(input.getAttribute("aria-describedby")).toBe(help.id);
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("marks the control invalid and points it at the error as well", () => {
    render(
      <Field label="Topic" help="One word." error="The topic is empty. Type a topic.">
        <Textarea />
      </Field>,
    );
    const control = screen.getByLabelText("Topic");
    expect(control.getAttribute("aria-invalid")).toBe("true");
    const ids = control.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[1] ?? "")?.textContent).toBe(
      "The topic is empty. Type a topic.",
    );
  });

  it("keeps a caller's own id and description", () => {
    render(
      <Field label="Model" id="model">
        <Select id="model" aria-describedby="outside" options={[{ value: "a", label: "A" }]} />
      </Field>,
    );
    const select = screen.getByLabelText("Model");
    expect(select.id).toBe("model");
    expect(select.getAttribute("aria-describedby")).toBe("outside");
  });
});

describe("switch and segmented", () => {
  it("toggles a switch and reports its state", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Review images" />);
    const toggle = screen.getByRole("switch", { name: "Review images" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await user.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("presses one segment and moves with the arrows", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<"a" | "b">("a");
      return (
        <Segmented
          label="Aspect"
          value={value}
          onChange={setValue}
          options={[
            { value: "a", label: "16:9" },
            { value: "b", label: "9:16" },
          ]}
        />
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "16:9" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "9:16" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "16:9" }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("the confirm dialog", () => {
  it("names both buttons, starts on the way out, and confirms only on the named action", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete 'Tiamat'?"
        consequence="The project and its 9 images are removed from disk."
        confirmLabel="Delete project"
        cancelLabel="Keep it"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Delete 'Tiamat'?" });
    const keep = within(dialog).getByRole("button", { name: "Keep it" });
    await waitFor(() => expect(document.activeElement).toBe(keep));
    // Focus stays inside: tabbing from the last button comes back to the first.
    await user.tab();
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Delete project" }),
    );
    await user.tab();
    expect(document.activeElement).toBe(keep);
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("runs the action from its button", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Discard changes?"
        consequence="3 edits are lost."
        confirmLabel="Discard 3 changes"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Discard 3 changes" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("media", () => {
  const items: readonly LightboxItem[] = [
    { src: "/a.png", alt: "Tiamat" },
    { src: "/b.png", alt: "Bahamut" },
    { src: "/c.png", alt: "The Well" },
  ];

  function Gallery() {
    const [index, setIndex] = useState<number | null>(null);
    return (
      <>
        {items.map((item, i) => (
          <MediaFrame key={item.src} src={item.src} alt={item.alt} onOpen={() => setIndex(i)} />
        ))}
        <Lightbox items={items} index={index} onIndex={setIndex} onClose={() => setIndex(null)} />
      </>
    );
  }

  it("says what is being made instead of showing an image while generating", () => {
    render(<MediaFrame alt="Next" generating="Codex is refining the image · 3 so far" />);
    expect(screen.getByRole("status").textContent).toContain("Codex is refining the image");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("opens the lightbox from a tile, pages with the arrows both ways, and closes on Esc", async () => {
    const user = userEvent.setup();
    render(<Gallery />);
    await user.click(screen.getByRole("button", { name: "Open Bahamut full size" }));
    const box = await screen.findByRole("dialog");
    expect(within(box).getByRole("img", { name: "Bahamut" })).not.toBeNull();
    expect(within(box).getByText("2 of 3 · Bahamut")).not.toBeNull();
    await user.keyboard("{ArrowRight}");
    expect(within(box).getByRole("img", { name: "The Well" })).not.toBeNull();
    await user.keyboard("{ArrowRight}");
    expect(within(box).getByRole("img", { name: "Tiamat" })).not.toBeNull();
    await user.keyboard("{ArrowLeft}");
    expect(within(box).getByRole("img", { name: "The Well" })).not.toBeNull();
    await user.click(within(box).getByRole("button", { name: "Previous" }));
    expect(within(box).getByRole("img", { name: "Bahamut" })).not.toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("is one grid in every size: a region by default, a list of tiles, compact for a panel", () => {
    render(
      <>
        <MediaGrid label="Images">
          <MediaFrame src="/a.png" alt="A" />
        </MediaGrid>
        <MediaGrid list shorts density="compact" label="Shorts">
          <li>
            <MediaFrame src="/b.png" alt="B" aspect="portrait" />
          </li>
        </MediaGrid>
      </>,
    );
    expect(screen.getByRole("region", { name: "Images" }).className).toBe("sl-grid");
    const shorts = screen.getByRole("list", { name: "Shorts" });
    expect(shorts.className).toContain("sl-grid sl-grid--shorts sl-grid--compact");
    expect(within(shorts).getAllByRole("listitem")).toHaveLength(1);
  });
});

describe("rows and tiles are one target", () => {
  const css = readFileSync(join(import.meta.dirname, "..", "..", "styles", "shell.css"), "utf8");

  it("stretches a row's select button over the whole row and keeps its actions on their own", async () => {
    const user = userEvent.setup();
    const picked = vi.fn();
    const removed = vi.fn();
    render(
      <List label="Themes">
        <ListRow
          title="D&D Parchment"
          meta="Serif · warm paper"
          onSelect={picked}
          actions={<Button onClick={removed}>Delete</Button>}
        />
      </List>,
    );
    const row = screen.getByRole("listitem");
    const target = within(row).getByRole("button", { name: "D&D Parchment" });
    expect(row.classList.contains(hitArea)).toBe(true);
    expect(target.classList.contains(hitTarget)).toBe(true);
    // One tab stop for the row, then its own actions.
    await user.tab();
    expect(document.activeElement).toBe(target);
    await user.tab();
    expect(document.activeElement).toBe(within(row).getByRole("button", { name: "Delete" }));
    await user.click(within(row).getByRole("button", { name: "Delete" }));
    expect(removed).toHaveBeenCalledOnce();
    expect(picked).not.toHaveBeenCalled();
    await user.click(target);
    expect(picked).toHaveBeenCalledOnce();
  });

  it("covers the row from its target and lifts every other control above it (shell.css)", () => {
    // The stretch: the target's ::after fills the row, which is its containing block.
    expect(css).toMatch(/\.sl-hit \{\s*position: relative;/);
    expect(css).toMatch(
      /\.sl-hit :is\(\.sl-hit__target, \.sl-row__title a\)::after \{\s*content: "";\s*position: absolute;\s*inset: 0;/,
    );
    // The row's other controls sit above the stretch, and the target keeps the focus ring.
    expect(css).toMatch(
      /:not\(\s*\.sl-hit__target,\s*\.sl-row__title a\s*\) \{\s*position: relative;\s*z-index: 1;/,
    );
    expect(css).toMatch(/\.sl-hit:has\(:is\(\.sl-hit__target, \.sl-row__title a\):focus-visible\)/);
  });

  it("makes the whole media figure, caption included, the open button", () => {
    render(
      <MediaFrame src="/a.png" alt="Tiamat" title="Tiamat" meta="Image 1" onOpen={() => {}} />,
    );
    const open = screen.getByRole("button", { name: "Open Tiamat full size" });
    expect(open.parentElement?.tagName).toBe("FIGURE");
    expect(css).toMatch(/\.sl-media \{\s*position: relative;/);
  });
});

describe("the reading view", () => {
  const markdown = `Intro line.

## Origins

Tiamat waits in Avernus.

\`\`\`
## not a heading
\`\`\`

## The five heads

Five heads. Tiamat breathes.

## Origins

Again.
`;

  it("splits at level-two headings outside code, with unique anchors", () => {
    const sections = splitSections(markdown);
    expect(sections.map((section) => section.id)).toEqual([
      "",
      "origins",
      "the-five-heads",
      "origins-2",
    ]);
    expect(sections[1]?.markdown).toContain("## not a heading");
  });

  it("nests the second heading level under the first, whichever two levels the text uses", () => {
    const titled =
      "# Tiamat\n\nIntro.\n\n## Origins\n\nOld.\n\n### Deeper\n\nKept inside.\n\n# Bahamut\n\nGold.";
    const outline = splitSections(titled).map((section) => [section.heading, section.depth]);
    expect(outline).toEqual([
      ["Tiamat", 0],
      ["Origins", 1],
      ["Bahamut", 0],
    ]);
    // A top section's copy holds its subsections; the third level stays in the body.
    const [tiamat, origins] = splitSections(titled);
    expect(tiamat?.markdown).toBe(
      "# Tiamat\n\nIntro.\n\n## Origins\n\nOld.\n\n### Deeper\n\nKept inside.",
    );
    expect(tiamat?.body).toBe("Intro.");
    expect(origins?.body).toBe("Old.\n\n### Deeper\n\nKept inside.");

    const parts = "## One\n\nA.\n\n### One a\n\nB.\n\n## Two\n\nC.";
    expect(splitSections(parts).map((section) => [section.id, section.depth])).toEqual([
      ["one", 0],
      ["one-a", 1],
      ["two", 0],
    ]);
    // A lone `#` that opens the text is its title, not a section holding all the others.
    const article = "# Rope\n\nWhy.\n\n## Knots\n\nA.\n\n### Bowline\n\nB.\n\n## Care\n\nC.";
    const sections = splitSections(article);
    expect(sections.map((section) => [section.heading, section.depth])).toEqual([
      [undefined, 0],
      ["Knots", 0],
      ["Bowline", 1],
      ["Care", 0],
    ]);
    expect(sections[0]?.body).toBe("# Rope\n\nWhy.");
    // Only one level: every heading is a top section, as before.
    expect(splitSections("### A\n\nx\n\n### B\n\ny").map((section) => section.depth)).toEqual([
      0, 0,
    ]);
  });

  it("shows nested headings indented in the contents and as h3 in the text", () => {
    render(
      <ReadingView markdown={"## One\n\nA.\n\n### One a\n\nB.\n\n## Two\n\nC."} label="Article" />,
    );
    const toc = screen.getByRole("navigation", { name: "Article contents" });
    const links = within(toc).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.className])).toEqual([
      ["One", ""],
      ["One a", "sl-toc__nested"],
      ["Two", ""],
    ]);
    expect(document.getElementById("one-a")?.tagName).toBe("H3");
    expect(screen.getByRole("button", { name: "Copy section: One a" })).not.toBeNull();
  });

  it("builds the contents from the headings", () => {
    render(<ReadingView markdown={markdown} label="Article" />);
    const toc = screen.getByRole("navigation", { name: "Article contents" });
    const links = within(toc).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#origins",
      "#the-five-heads",
      "#origins-2",
    ]);
    expect(links[0]?.getAttribute("aria-current")).toBe("true");
    expect(document.getElementById("the-five-heads")?.tagName).toBe("H2");
  });

  it("marks every hit of the search and counts them", async () => {
    const user = userEvent.setup();
    const { container } = render(<ReadingView markdown={markdown} label="Article" />);
    await user.type(screen.getByLabelText("Search the article"), "tiamat");
    await waitFor(() => expect(screen.getByText("2 matches")).not.toBeNull());
    const marks = [...container.querySelectorAll("mark.sl-hit")].map((mark) => mark.textContent);
    expect(marks).toEqual(["Tiamat", "Tiamat"]);
    await user.clear(screen.getByLabelText("Search the article"));
    await waitFor(() => expect(container.querySelectorAll("mark.sl-hit")).toHaveLength(0));
  });

  it("copies one section or the whole text as Markdown", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ReadingView markdown={markdown} label="Article" />);
    await user.click(screen.getByRole("button", { name: "Copy section: The five heads" }));
    expect(writeText).toHaveBeenLastCalledWith("## The five heads\n\nFive heads. Tiamat breathes.");
    await user.click(screen.getByRole("button", { name: "Copy all" }));
    expect(writeText).toHaveBeenLastCalledWith(markdown);
  });

  it("steps through the hits and says when there are none", async () => {
    const user = userEvent.setup();
    const { container } = render(<ReadingView markdown={markdown} label="Article" />);
    const search = screen.getByLabelText("Search the article");
    await user.type(search, "tiamat");
    await waitFor(() => expect(screen.getByText("2 matches")).not.toBeNull());
    await user.click(screen.getByRole("button", { name: "Next match" }));
    expect(screen.getByText("1 of 2")).not.toBeNull();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Next match" }));
    expect(screen.getByText("1 of 2")).not.toBeNull();
    expect(container.querySelectorAll('mark.sl-hit[data-current="true"]')).toHaveLength(1);
    await user.clear(search);
    await user.type(search, "steel");
    expect(await screen.findByText("No matches")).not.toBeNull();
  });

  it("hands copies to the caller, prefixes its anchors and scrolls in a named region", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    render(
      <ReadingView
        markdown={markdown}
        label="Article"
        what="article"
        regionLabel="Article content"
        anchorPrefix="article-"
        onCopy={onCopy}
      />,
    );
    const region = screen.getByRole("region", { name: "Article content" });
    expect(within(region).getByRole("heading", { name: "The five heads" }).id).toBe(
      "article-the-five-heads",
    );
    await user.click(screen.getByRole("button", { name: "Copy section: The five heads" }));
    expect(onCopy).toHaveBeenLastCalledWith(
      "## The five heads\n\nFive heads. Tiamat breathes.",
      'section "The five heads"',
    );
    await user.click(screen.getByRole("button", { name: "Copy all" }));
    expect(onCopy).toHaveBeenLastCalledWith(markdown, "article");
  });

  it("shows what it is given while there is no text, with search off", () => {
    render(
      <ReadingView markdown="" label="Research notes" copyAll={false}>
        <p>Not yet.</p>
      </ReadingView>,
    );
    expect(screen.getByText("Not yet.")).not.toBeNull();
    expect((screen.getByLabelText("Search the research notes") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(screen.queryByRole("button", { name: "Copy all" })).toBeNull();
  });
});

describe("buttons", () => {
  it("are buttons by default and say why when disabled", () => {
    render(
      <Button variant="primary" disabled disabledReason="Codex is signed out. Sign in first.">
        Start the run
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Start the run" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("title")).toBe("Codex is signed out. Sign in first.");
    expect(button.className).toContain("sl-btn--primary");
  });
});
