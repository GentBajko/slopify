import type { Channel } from "@app/slices/channels/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
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

function routes(saved: unknown[], disclosed: unknown[] = []) {
  return testDeps({
    "GET /api/fonts": jsonAnswer({ fonts: [] }),
    "GET /api/entries": jsonAnswer({ entries: [] }),
    "GET /api/document-themes": jsonAnswer({ themes: [], builtIns: [] }),
    "PUT /api/channels/c2": async (request) => {
      const body = await request.json();
      saved.push(body);
      return jsonAnswer({ ...channel, version: 4 })(request);
    },
    "PUT /api/channels/c2/ai-disclosure": async (request) => {
      const body = await request.json();
      disclosed.push(body);
      return jsonAnswer({ ...channel, version: 5, aiDisclosure: body.aiDisclosure })(request);
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

  it("saves the X subscription and account names with the channel", async () => {
    const user = userEvent.setup();
    const saved: unknown[] = [];
    renderRouted(
      <BrandTab channel={{ ...channel, xTier: "free", socialAccounts: { x: "@fox" } }} />,
      routes(saved),
    );
    // Posting is folded under the look, its state in words on the fold's line.
    await user.click(await screen.findByText("Posting"));
    const posting = screen.getByRole("region", { name: "Posting" });
    expect((within(posting).getByLabelText("X account") as HTMLInputElement).value).toBe("@fox");
    await user.click(within(posting).getByRole("button", { name: "Premium" }));
    await user.type(
      within(posting).getByLabelText("Instagram account"),
      "https://instagram.com/fox",
    );
    expect(within(posting).getByText(/Type it the way Instagram shows it/)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save channel" }).hasAttribute("disabled")).toBe(
      true,
    );
    await user.clear(within(posting).getByLabelText("Instagram account"));
    await user.type(within(posting).getByLabelText("Instagram account"), "fox.tales");
    await user.click(screen.getByRole("button", { name: "Save channel" }));
    await waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(saved[0]).toMatchObject({
      xTier: "premium",
      socialAccounts: { x: "@fox", instagram: "fox.tales" },
    });
  });
});

describe("Name and look", () => {
  it("leads with the name, language and series brief, and draws the look beside its fields", async () => {
    renderRouted(<BrandTab channel={channel} />, routes([]));
    const form = await screen.findByRole("form", { name: "Name and look" });
    const labels = [...form.querySelectorAll("label")].map((label) => label.textContent);
    expect(labels.slice(0, 3)).toEqual([
      "Channel name",
      "Language of new projects",
      "Series brief",
    ]);
    expect(
      screen.getByRole("img", { name: "Preview of the channel's captions and end screen text" }),
    ).toBeTruthy();
    // Every look setting left empty says so in the same words: the two fonts, intro, outro,
    // PDF look and ambient sound, and the three colours.
    expect(screen.getAllByRole("option", { name: "Not set", selected: true })).toHaveLength(6);
    expect(screen.getAllByPlaceholderText("Not set")).toHaveLength(3);
  });

  it("draws the end screen text as it is typed", async () => {
    const user = userEvent.setup();
    renderRouted(<BrandTab channel={channel} />, routes([]));
    const preview = await screen.findByRole("img", {
      name: "Preview of the channel's captions and end screen text",
    });
    expect(preview.textContent).toContain("Your end screen text");
    await user.type(screen.getByLabelText("End screen text"), "Subscribe for more");
    expect(preview.textContent).toContain("Subscribe for more");
  });

  it("saves the YouTube AI disclosure with Save channel, after the rest", async () => {
    const user = userEvent.setup();
    const saved: unknown[] = [];
    const disclosed: unknown[] = [];
    renderRouted(<BrandTab channel={channel} />, routes(saved, disclosed));
    await user.click(await screen.findByText("Posting"));
    await user.selectOptions(screen.getByLabelText("YouTube AI disclosure"), "no");
    // Picking it saves nothing by itself.
    expect(disclosed).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save channel" }));
    await waitFor(() => expect(disclosed).toEqual([{ aiDisclosure: "no" }]));
    expect(saved).toHaveLength(1);
  });
});
