import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name) => readFileSync(new URL(`./public/${name}`, import.meta.url), "utf8");
const home = read("index.html");
const channel = read("channel.html");

// Everything inside <template data-release> is inert; this is what a visitor gets.
const published = (page) => page.replace(/<template data-release[\s\S]*?<\/template>/g, "");

describe("the pages", () => {
  it.each([
    ["index.html", home],
    ["channel.html", channel],
  ])("%s links the real support pages and no placeholder", (_name, page) => {
    expect(page).not.toContain("example.com");
    expect(page).not.toContain("data-donate");
    expect(page).toContain('href="https://www.patreon.com/cw/GentBajko"');
    expect(page).toContain('href="https://buymeacoffee.com/gentbajko"');
  });

  it("keeps the 3.0 features out of the published list", () => {
    expect(home).toContain('<template data-release="3.0">');
    for (const unreleased of ["Automatic reviews", "Prepare upload", "Ctrl+K", "Run cost"]) {
      expect(home).toContain(unreleased);
      expect(published(home)).not.toContain(unreleased);
    }
  });

  it("keeps 3.0 work out of the channel page until release", () => {
    for (const unreleased of ["reviewer model", "Prepare upload", "series brief", "cast"]) {
      expect(published(channel)).not.toContain(unreleased);
    }
  });

  it("gives the README the same support links and no placeholder", () => {
    const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
    expect(readme).toContain("## Support");
    expect(readme).toContain("https://www.patreon.com/cw/GentBajko");
    expect(readme).not.toContain("example.com");
  });

  it("links the channel page from the home page", () => {
    expect(home).toContain('href="/channel.html"');
  });

  it("describes the recording that is published", () => {
    expect(home).toContain("The Keeper of the Drowned Light");
    expect(read("assets/play-run.vtt")).toMatch(/^WEBVTT\n/);
  });
});
