import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AboutSettings, aboutLinks } from "./settings-about";

afterEach(cleanup);

describe("Settings → About", () => {
  it("links the real support pages and nothing else for donations", () => {
    render(<AboutSettings />);
    expect(screen.getByRole("link", { name: "Patreon" }).getAttribute("href")).toBe(
      "https://www.patreon.com/cw/GentBajko",
    );
    expect(screen.getByRole("link", { name: "Buy Me a Coffee" }).getAttribute("href")).toBe(
      "https://buymeacoffee.com/gentbajko",
    );
    expect(screen.queryByRole("link", { name: "Donate" })).toBeNull();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toContain("example.com");
    }
  });

  it("lists only https links", () => {
    for (const link of aboutLinks()) expect(link.href.startsWith("https://")).toBe(true);
  });
});
