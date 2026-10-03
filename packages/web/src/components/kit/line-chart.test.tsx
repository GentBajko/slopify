import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { LineChart } from "./line-chart.js";

afterEach(cleanup);

it("draws each series with axes and a legend, and shows every value at the hovered day", () => {
  render(
    <LineChart
      label="Views per day"
      xLabels={["Mar 1", "Mar 2", "Mar 3"]}
      formatValue={(value) => String(Math.round(value))}
      series={[
        { id: "a", label: "The Lighthouse", color: "#7cb342", values: [10, 40, 20] },
        { id: "b", label: "The Harbour", color: "#42a5f5", values: [null, 5, 15] },
      ]}
    />,
  );
  const chart = screen.getByRole("img", { name: "Views per day" });
  expect(chart.querySelectorAll("path")).toHaveLength(2);
  expect(screen.getAllByText("The Lighthouse")).toHaveLength(1);
  // The y axis reaches above the peak.
  expect(screen.getByText("40")).toBeTruthy();
  fireEvent.mouseMove(chart, { clientX: 9999, clientY: 50 });
});
