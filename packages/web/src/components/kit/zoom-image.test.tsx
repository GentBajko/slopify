import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Lightbox } from "./media.js";
import { nextZoom } from "./zoom-image.js";

afterEach(cleanup);

const items = [
  { src: "/one.png", alt: "Image 1" },
  { src: "/two.png", alt: "Image 2" },
];

it("steps through the zoom levels and stops at the ends", () => {
  expect(nextZoom(1, 1)).toBe(2);
  expect(nextZoom(4, 1)).toBe(4);
  expect(nextZoom(1, -1)).toBe(1);
});

it("zooms a picture from the bar and the keys, and fits it again on the next one", async () => {
  const user = userEvent.setup();
  const onIndex = vi.fn();
  const { rerender } = render(
    <Lightbox items={items} index={0} onIndex={onIndex} onClose={vi.fn()} />,
  );
  const image = screen.getByRole("img", { name: "Image 1" });
  expect(image.getAttribute("data-zoom")).toBe("1");
  await user.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(image.getAttribute("data-zoom")).toBe("2");
  fireEvent.keyDown(image, { key: "+" });
  expect(image.getAttribute("data-zoom")).toBe("4");
  expect(screen.getByRole("button", { name: "Zoom in, now 4×" }).hasAttribute("disabled")).toBe(
    true,
  );
  fireEvent.keyDown(image, { key: "0" });
  expect(image.getAttribute("data-zoom")).toBe("1");
  fireEvent.doubleClick(image);
  expect(image.getAttribute("data-zoom")).toBe("2");
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(onIndex).toHaveBeenCalledWith(1);
  rerender(<Lightbox items={items} index={1} onIndex={onIndex} onClose={vi.fn()} />);
  expect(screen.getByRole("img", { name: "Image 2" }).getAttribute("data-zoom")).toBe("1");
});
