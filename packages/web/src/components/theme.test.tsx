import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { AppearanceSkin, applyAppearance } from "./theme.js";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

describe("the appearance override", () => {
  it("leaves the decision to prefers-color-scheme on System", () => {
    const root = document.createElement("html");
    root.setAttribute("data-theme", "light");
    applyAppearance(root, "system");
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  it("names the theme on the document element for Dark and Light", () => {
    const root = document.createElement("html");
    applyAppearance(root, "dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
    applyAppearance(root, "light");
    expect(root.getAttribute("data-theme")).toBe("light");
  });

  it("wears the saved appearance without being asked twice", async () => {
    renderApp(
      <AppearanceSkin />,
      testDeps({
        "GET /api/settings": jsonAnswer({ silenceGapSeconds: 3, appearance: "light" }),
      }),
    );
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });

  it("keeps prefers-color-scheme when nothing is saved", async () => {
    renderApp(
      <AppearanceSkin />,
      testDeps({
        "GET /api/settings": jsonAnswer({ silenceGapSeconds: 3, appearance: "system" }),
      }),
    );
    await waitFor(() => {
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    });
  });
});
