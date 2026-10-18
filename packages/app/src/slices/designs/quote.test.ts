import { expect, it } from "vitest";
import { designCatalogue } from "./designs.fake.js";
import { costChanged, costChangedMessage, quoteDesignImage } from "./quote.js";

it("quotes an edit as a range and the artwork at its price", () => {
  const edit = quoteDesignImage(designCatalogue, {
    provider: "fal",
    model: "fal-ai/flux-2",
    purpose: "picture-edit",
    sendsPictures: true,
  });
  expect([edit.low, edit.high, edit.rows[0]?.stage]).toEqual([0.02, 0.06, "Picture edit"]);
  const art = quoteDesignImage(designCatalogue, {
    provider: "fal",
    model: "fal-ai/flux-2",
    purpose: "design-art",
    sendsPictures: false,
  });
  expect([art.low, art.high, art.rows[0]?.stage]).toEqual([0.04, 0.04, "Artwork"]);
  const unknown = quoteDesignImage(designCatalogue, {
    provider: "fal",
    model: "typed-by-hand",
    purpose: "design-art",
    sendsPictures: false,
  });
  expect(unknown.unknown).toBe(1);
});

it("stops a paid step whose price rose past what was shown", () => {
  const art = quoteDesignImage(designCatalogue, {
    provider: "fal",
    model: "fal-ai/flux-2",
    purpose: "design-art",
    sendsPictures: false,
  });
  expect(costChanged(art, 0.04)).toBe(false);
  expect(costChanged(art, 0.036)).toBe(false);
  expect(costChanged(art, 0.03)).toBe(true);
  expect(costChangedMessage(art, "this edit")).toBe(
    "The price changed since you looked: this edit now costs up to $0.04. Check the new price on the button and press it again.",
  );
});
