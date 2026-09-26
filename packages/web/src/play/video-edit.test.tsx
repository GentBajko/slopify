import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { mountPlay } from "./play-test-fixture";

afterEach(cleanup);

// fal.ai answers its image-to-video models only when asked for them.
const falModels = {
  "GET /api/providers/fal/models": (request: Request): Response =>
    Response.json(
      new URL(request.url).searchParams.get("video") === "1"
        ? {
            models: [
              {
                id: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
                name: "Kling 2.5 Turbo Pro (image to video)",
              },
            ],
            allowsCustom: false,
          }
        : { models: [{ id: "fal-ai/flux-2", name: "FLUX.2" }], allowsCustom: false },
    ),
};

async function drafts(requests: readonly Request[]): Promise<unknown> {
  const saves = requests.filter(
    (request) =>
      ["PUT", "POST"].includes(request.method) &&
      /\/api\/drafts(?:\/[a-f0-9-]+)?$/.test(request.url),
  );
  return saves.at(-1)?.clone().json();
}

it("starts a new video following the narration, with a plain Look folded away", async () => {
  await mountPlay();
  await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
  const cuts = screen.getByRole<HTMLSelectElement>("combobox", { name: "Cuts" });
  expect(cuts.value).toBe("narration");
  expect(cuts.selectedOptions[0]?.textContent).toBe("Follow the narration");
  const look = screen.getByText("Look").closest("details");
  expect(look?.open).toBe(false);
  expect(within(look as HTMLElement).getByText("Plain cuts, no effects")).not.toBeNull();
  // Help hides until asked.
  expect(screen.getByRole("button", { name: "About cuts" })).not.toBeNull();
});

it("sets transitions, the Look, chapter cards and animated images, and saves them in the draft", async () => {
  const { requests } = await mountPlay(falModels);
  await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
  // The clips are made on the image provider, so its models are the ones offered.
  const provider = document.querySelector<HTMLSelectElement>('[data-play-field="images.provider"]');
  if (provider === null) throw new Error("The image provider picker is missing.");
  await userEvent.selectOptions(provider, "fal");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Cuts" }), "interval");
  await userEvent.click(screen.getByText("Look"));
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Transition" }), "crossfade");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Transition length" }), "0.8");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Colour grade" }), "warm");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Vignette" }), "subtle");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Film grain" }), "strong");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Atmosphere" }), "embers");
  await userEvent.click(screen.getByRole("checkbox", { name: "Chapter cards" }));
  const every = screen.getByRole<HTMLSelectElement>("combobox", {
    name: "Animate every how many images",
  });
  expect(every.disabled).toBe(true);
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Animate images" }), "every");
  expect(every.disabled).toBe(false);
  await userEvent.selectOptions(every, "4");
  const model = screen.getByRole<HTMLSelectElement>("combobox", { name: "Image-to-video model" });
  await screen.findByRole("option", { name: "Kling 2.5 Turbo Pro (image to video)" });
  await userEvent.selectOptions(model, "fal-ai/kling-video/v2.5-turbo/pro/image-to-video");
  expect(
    screen.getByText(
      "Crossfade 0.8 s · Warm fantasy · Embers · Vignette · Grain · Chapter cards · Animated images",
    ),
  ).not.toBeNull();
  await waitFor(async () =>
    expect(await drafts(requests)).toMatchObject({
      document: {
        form: {
          videoEdit: {
            cuts: "interval",
            transition: "crossfade",
            transitionSeconds: 0.8,
            vignette: "subtle",
            grain: "strong",
            grade: "warm",
            atmosphere: "embers",
            chapterCards: true,
            animate: "every",
            animateEvery: 4,
            animateModel: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
          },
        },
      },
    }),
  );
});

it("keeps the transition length off while the transition is a cut", async () => {
  await mountPlay();
  await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
  await userEvent.click(screen.getByText("Look"));
  const length = screen.getByRole<HTMLSelectElement>("combobox", { name: "Transition length" });
  expect(length.disabled).toBe(true);
  expect(length.value).toBe("0.6");
});

it("asks for an image-to-video model in plain words when Animate images has none", async () => {
  await mountPlay(falModels);
  await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
  await userEvent.click(screen.getByText("Look"));
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Animate images" }), "every");
  await userEvent.click(screen.getByRole("button", { name: "Review" }));
  expect(
    (
      await screen.findAllByText(
        "Choose an image-to-video model to animate images with, or turn Animate images off.",
      )
    ).length,
  ).toBeGreaterThan(0);
});
