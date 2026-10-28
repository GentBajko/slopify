import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectRoute } from "@/routes/project";
import { deps, finished } from "@/routes/project-fixtures";
import { revisionRouteFixture } from "@/routes/project-revision.fake";
import { jsonAnswer, openProjectSection, renderRouted } from "@/test-app";
import { fileSize, lengthWords } from "./parts.js";

// A bundled sample is read-only on the server; the page says so where the press would be.

afterEach(cleanup);

// The page with saved versions, as a bundled sample or as a person's own project.
function mount(sample: boolean) {
  const fixture = revisionRouteFixture(finished);
  renderRouted(
    <ProjectRoute projectId="p1" />,
    deps({
      ...fixture.routes,
      ...(sample
        ? {
            "GET /api/onboarding/sample": jsonAnswer({
              projectId: "p1",
              samples: { library: "p1", audiobook: null, podcast: null },
            }),
          }
        : {}),
    }),
  );
}

describe("the sample project", () => {
  // Rule 9: a control that cannot apply is left out, not greyed. The line under the title row
  // says the sample is read-only and that Make my own copy is the way to change it.
  it("leaves the make-again buttons and the tiles' paid actions out, and says why under the title", async () => {
    mount(true);
    await openProjectSection("Video");
    const video = await screen.findByRole("region", { name: "Video" });
    expect(
      await screen.findByText(/It is read-only: Make my own copy to edit it and make it again\./),
    ).not.toBeNull();
    expect(within(video).queryByRole("button", { name: /^Make the video again/ })).toBeNull();
    await openProjectSection("Images");
    const images = await screen.findByRole("region", { name: "Images" });
    await waitFor(() => expect(images.querySelectorAll("figure").length).toBeGreaterThan(0));
    expect(within(images).queryByRole("button", { name: /^Make this image again/ })).toBeNull();
    expect(within(images).queryByRole("button", { name: /^More for image/ })).toBeNull();
  });

  it("shows its settings read-only, with Save off and the reason above them", async () => {
    mount(true);
    await openProjectSection("Settings");
    const form = await screen.findByRole("form", { name: "Edit settings" });
    // Said in a line over the form, not only as the disabled button's reason.
    await waitFor(() =>
      expect(
        within(form)
          .getAllByText("Read-only sample. Press Make my own copy first.")
          .some((line) => line.tagName === "P"),
      ).toBe(true),
    );
    expect(
      within(form)
        .getByRole("button", { name: /^Save changes/ })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    // Read section by section: the sections open, the fields cannot be changed.
    const sections = within(form).getByRole("navigation", { name: "Edit sections" });
    const article = within(sections).getByRole("button", { name: /^Article/ });
    expect(article.closest("fieldset[disabled]")).toBeNull();
    const title = within(form).getByRole("textbox", { name: /^Project title/ });
    expect(title.closest("fieldset[disabled]")).not.toBeNull();
  });
});

describe("a project's own settings", () => {
  it("light Save only once something changed, and say so until then", async () => {
    mount(false);
    await openProjectSection("Settings");
    const form = await screen.findByRole("form", { name: "Edit settings" });
    expect(within(form).getByText("Nothing to save yet: change a setting first.")).not.toBeNull();
    expect(
      within(form)
        .getByRole("button", { name: /^Save changes/ })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });
});

describe("the facts lines' words", () => {
  it("say lengths and sizes as a person would", () => {
    expect(lengthWords(185_233)).toBe("3 min 5 s");
    expect(lengthWords(44_000)).toBe("44 s");
    expect(lengthWords(3_780_000)).toBe("1 h 3 min");
    expect(lengthWords(0)).toBeUndefined();
    expect(fileSize(394_567)).toBe("395 KB");
    expect(fileSize(10_134_393)).toBe("10 MB");
    expect(fileSize(2_503_900)).toBe("2.5 MB");
    expect(fileSize(null)).toBeUndefined();
  });
});
