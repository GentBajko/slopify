import { keyGuides } from "@app/slices/settings/key-guides.js";
import { providers } from "@app/slices/settings/model.js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { keyLinks, SetupContent } from "./setup-content";

afterEach(cleanup);

describe("the tutorial's key steps", () => {
  it("link every keyed provider of the family to its key guide's page, Inworld included", () => {
    render(<SetupContent step="audio-key" />);
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    const tts = providers.filter((one) => one.family === "tts" && one.auth === "key");
    expect(hrefs).toEqual(tts.map((one) => keyGuides[one.id]?.keyPage.url));
    expect(screen.getByRole("link", { name: "Inworld keys" }).getAttribute("href")).toBe(
      keyGuides.inworld?.keyPage.url,
    );
  });

  it("take the image and text links from the key guides too", () => {
    render(<SetupContent step="image-key" />);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(
      keyLinks("image").map((link) => link.url),
    );
    cleanup();
    render(<SetupContent step="text-key" />);
    expect(screen.getByRole("link", { name: "OpenRouter" }).getAttribute("href")).toBe(
      keyGuides.openrouter?.keyPage.url,
    );
  });

  it("name only pages the guides know", () => {
    for (const family of ["tts", "image"] as const)
      for (const link of keyLinks(family))
        expect(Object.values(keyGuides).map((guide) => guide?.keyPage.url)).toContain(link.url);
  });
});
