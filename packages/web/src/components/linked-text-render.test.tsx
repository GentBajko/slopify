import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { renderRouted, testDeps } from "@/test-app";
import { LinkedText } from "./linked-text";

afterEach(cleanup);

it("links the Settings page an error names", async () => {
  renderRouted(<LinkedText text="Open Settings → Providers, then try again." />, testDeps({}));
  const link = await screen.findByRole("link", { name: "Settings → Providers" });
  expect(link.getAttribute("href")).toBe("/settings?section=providers");
});
