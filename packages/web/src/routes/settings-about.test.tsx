import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { donationHref, donationPlaceholder, donationUrl } from "@/lib/support-links";
import { AboutSettings, aboutLinks } from "./settings-about";

afterEach(cleanup);

describe("Settings → About", () => {
  it("shows no donation link while the address is the placeholder", () => {
    render(<AboutSettings donation={donationPlaceholder} />);
    expect(screen.queryByRole("link", { name: "Donate" })).toBeNull();
    expect(screen.getByRole("link", { name: "Patreon" }).getAttribute("href")).toBe(
      "https://www.patreon.com/cw/GentBajko",
    );
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toContain("example.com");
    }
  });

  it("links the donation page once it is a real address", () => {
    render(<AboutSettings donation="https://ko-fi.com/someone" />);
    expect(screen.getByRole("link", { name: "Donate" }).getAttribute("href")).toBe(
      "https://ko-fi.com/someone",
    );
  });

  it.each(["", "http://ko-fi.com/someone", "https://example.com/other", "not a url"])(
    "does not link %j",
    (url) => {
      expect(donationHref(url)).toBeUndefined();
      expect(aboutLinks(url).some((link) => link.label === "Donate")).toBe(false);
    },
  );

  // Flip when the real address lands: it guards against shipping an example.com link.
  it("ships with the placeholder until the maintainer supplies the page", () => {
    expect(donationUrl).toBe(donationPlaceholder);
  });
});
