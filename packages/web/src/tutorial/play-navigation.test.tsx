import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { jsonAnswer } from "@/test-app";
import { at, guide, mount } from "./test-fixture";

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.closest("[hidden]") ? new DOMRect() : new DOMRect(40, 80, 600, 180);
  });
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("restores Style on reload then reveals Outputs before measuring Back", async () => {
  const user = userEvent.setup();
  const { router, requests } = await mount({
    initial: "/play",
    tutorial: jsonAnswer({
      version: 8,
      readable: true,
      session: { schemaVersion: 1, active: true, stepId: "play-subtitles" },
    }),
  });
  await at("play-subtitles");
  expect(router.state.location.pathname).toBe("/play");
  expect(screen.getByRole("button", { name: "Style" }).getAttribute("aria-current")).toBe("step");
  expect(document.querySelector('[data-tour="play-video"]')).toBeNull();
  await user.click(guide().getByRole("button", { name: "Back" }));
  await at("play-video");
  expect(screen.getByRole("button", { name: "Outputs" }).getAttribute("aria-current")).toBe("step");
  expect(document.querySelector('[data-tour="play-subtitles"]')).toBeNull();
  await user.click(guide().getByRole("button", { name: /^Skip/ }));
  await at("play-subtitles");
  await user.click(guide().getByRole("button", { name: /^Skip/ }));
  await at("play-start");
  await user.click(guide().getByRole("button", { name: "Finish without generating" }));
  await waitFor(() =>
    expect(screen.queryByRole("region", { name: "Interactive getting started guide" })).toBeNull(),
  );
  expect(requests.some((request) => /\/start$/.test(request))).toBe(false);
});

it("keeps a pending font upload active when the guide advances to Review", async () => {
  let release: ((response: Response) => void) | undefined;
  const delayed = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const user = userEvent.setup();
  await mount({
    initial: "/play",
    uploadFont: () => delayed,
    tutorial: jsonAnswer({
      version: 1,
      readable: true,
      session: { schemaVersion: 1, active: true, stepId: "play-subtitles" },
    }),
  });
  await at("play-subtitles");
  await user.selectOptions(screen.getByLabelText("Subtitles", { selector: "select" }), "files");
  await user.upload(
    screen.getByLabelText("Upload font (.ttf or .otf)"),
    new File(["font"], "guide.ttf", { type: "font/ttf" }),
  );
  await user.click(guide().getByRole("button", { name: /^Skip/ }));
  await at("play-start");
  await user.click(guide().getByRole("button", { name: "Back" }));
  await at("play-subtitles");
  expect(screen.getByText(/Uploading/)).not.toBeNull();
  release?.(
    await jsonAnswer({
      font: { id: "guide-font", name: "Guide", family: "Guide", source: "uploaded" },
    })(new Request("http://slopify.test")),
  );
  await waitFor(() =>
    expect((screen.getByLabelText("Subtitle font") as HTMLSelectElement).value).toBe("guide-font"),
  );
});
