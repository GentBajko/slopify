import type { Channel } from "@app/slices/channels/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { BrandTab } from "./brand-tab";

afterEach(cleanup);

const channel: Channel = {
  id: "c2",
  name: "Night tales",
  isDefault: false,
  brand: {},
  seriesBrief: "Calm stories.",
  aiDisclosure: "auto",
  version: 3,
  createdAt: "x",
  updatedAt: "x",
};

function routes(saved: unknown[]) {
  return testDeps({
    "GET /api/fonts": jsonAnswer({ fonts: [] }),
    "GET /api/entries": jsonAnswer({ entries: [] }),
    "GET /api/document-themes": jsonAnswer({ themes: [], builtIns: [] }),
    "PUT /api/channels/c2": async (request) => {
      const body = await request.json();
      saved.push(body);
      return jsonAnswer({ ...channel, version: 4 })(request);
    },
  });
}

describe("Brand tab", () => {
  it("counts the series brief as it is typed", async () => {
    const user = userEvent.setup();
    renderRouted(<BrandTab channel={channel} />, routes([]));
    expect(await screen.findByText(/13 of 10,000 characters/)).not.toBeNull();
    await user.type(screen.getByLabelText("Series brief"), " More.");
    expect(screen.getByText(/19 of 10,000 characters/)).not.toBeNull();
  });

  it("takes a three-digit colour, keeps a partial one, and saves #RRGGBB", async () => {
    const user = userEvent.setup();
    const saved: unknown[] = [];
    renderRouted(<BrandTab channel={channel} />, routes(saved));
    const colour = await screen.findByLabelText("Caption colour");
    await user.type(colour, "#ff");
    expect(screen.getByText(/3 or 6 hex digits/)).not.toBeNull();
    expect((colour as HTMLInputElement).value).toBe("#ff");
    expect(screen.getByRole("button", { name: "Save channel" }).hasAttribute("disabled")).toBe(
      true,
    );
    await user.type(colour, "0");
    await user.type(screen.getByLabelText("Caption outline"), "#fe0");
    expect(screen.getByText(/Hard to read on the caption colour/)).not.toBeNull();
    await user.clear(screen.getByLabelText("Caption outline"));
    await user.type(screen.getByLabelText("Caption outline"), "#000");
    await user.click(screen.getByRole("button", { name: "Save channel" }));
    await waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(saved[0]).toMatchObject({
      brand: { captionColor: "#FFFF00", captionOutlineColor: "#000000" },
    });
  });
});
