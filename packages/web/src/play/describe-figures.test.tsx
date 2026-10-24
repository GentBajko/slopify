import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DescribeFiguresToggle } from "./describe-figures";

afterEach(cleanup);

it("offers to show the described tables and figures on screen, under the switch that describes them", async () => {
  const onScreen = vi.fn();
  const { rerender } = render(
    <DescribeFiguresToggle
      value={false}
      skipCode={false}
      onScreen={{ value: false, onChange: onScreen }}
      onChange={() => {}}
    />,
  );
  expect(screen.queryByRole("checkbox", { name: "Also show them on screen" })).toBeNull();
  rerender(
    <DescribeFiguresToggle
      value
      skipCode={false}
      onScreen={{ value: false, onChange: onScreen }}
      onChange={() => {}}
    />,
  );
  await userEvent.click(screen.getByRole("checkbox", { name: "Also show them on screen" }));
  expect(onScreen).toHaveBeenCalledWith(true);
  // With no video to show them in, there is nothing to offer.
  rerender(<DescribeFiguresToggle value skipCode={false} onChange={() => {}} />);
  expect(screen.queryByRole("checkbox", { name: "Also show them on screen" })).toBeNull();
});
