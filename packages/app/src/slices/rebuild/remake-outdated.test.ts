import { expect, it } from "vitest";
import { previewBlocker, remakeBlocker, remakeTotal } from "./remake-outdated.js";

const work = (key: string, disposition: "reuse" | "generate" | "local" | "review" | "blocked") => ({
  key,
  disposition,
  reason: disposition === "blocked" ? "The voice was removed." : "",
});

it("leaves out a running project and a sample, with the page's reasons", () => {
  expect(remakeBlocker("running", false)).toBe(
    "It is running now. Remake it once the run has finished.",
  );
  expect(remakeBlocker("done", true)).toBe(
    "It is a sample project, which stays as it came with Slopify.",
  );
  expect(remakeBlocker("done", false)).toBeUndefined();
});

it("leaves out a project with nothing outdated, blocked work, or supplied content to confirm", () => {
  const label = (key: string) => `“${key}”`;
  expect(
    previewBlocker({ work: [work("image:one", "reuse")], providedReuseRequired: [] }, label),
  ).toBe("Nothing in it is outdated, so there is nothing to remake.");
  expect(
    previewBlocker(
      {
        work: [work("image:one", "generate"), work("audio:body", "blocked")],
        providedReuseRequired: [],
      },
      label,
    ),
  ).toBe(
    "“audio:body” can't run: The voice was removed. Open the project and press Choose what to remake to see what to fix.",
  );
  expect(
    previewBlocker(
      { work: [work("image:one", "generate")], providedReuseRequired: ["audio:body"] },
      label,
    ),
  ).toContain("It uses content you supplied");
  expect(
    previewBlocker({ work: [work("image:one", "generate")], providedReuseRequired: [] }, label),
  ).toBeUndefined();
});

it("adds the estimates into one total", () => {
  expect(
    remakeTotal([
      { low: 1, high: 2, unknown: 0 },
      { low: 3, high: 5, unknown: 1 },
    ]),
  ).toEqual({ low: 4, high: 7, unknown: 1 });
});
