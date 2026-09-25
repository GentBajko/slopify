import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { mountPlay } from "./play-test-fixture";

afterEach(cleanup);
it("offers four freely reachable sections and focuses only explicit navigation", async () => {
  const { requests } = await mountPlay();
  const nav = screen.getByRole("navigation", { name: "Run setup" });
  expect(
    within(nav)
      .getAllByRole("button")
      .map((x) => x.textContent),
  ).toHaveLength(4);
  await userEvent.type(screen.getByLabelText("Project title"), "Retained");
  for (const name of ["Style", "Outputs", "Review", "Content"]) {
    await userEvent.click(within(nav).getByRole("button", { name }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: name === "Style" ? "Make it look like yours." : name }),
      ),
    );
  }
  expect((screen.getByLabelText("Project title") as HTMLInputElement).value).toBe("Retained");
  expect(requests.some((r) => r.url.endsWith("/api/projects") && r.method === "POST")).toBe(false);
});
it("opens Review while invalid and reveals the exact error control", async () => {
  const { created } = await mountPlay();
  await userEvent.click(screen.getByLabelText("Project title"));
  await userEvent.keyboard("{Control>}{Enter}{/Control}");
  await screen.findByRole("heading", { name: "Review" });
  await userEvent.click(screen.getByRole("button", { name: "Pick an article prompt." }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Article prompt")));
  expect(screen.getByLabelText("Article prompt").getAttribute("aria-invalid")).toBe("true");
  expect(created).not.toHaveBeenCalled();
});
it("does not mark untouched fields when another field changes", async () => {
  await mountPlay();
  await userEvent.type(screen.getByLabelText("Project title"), "Title");
  expect(screen.getByLabelText("Article prompt").getAttribute("aria-invalid")).toBe("false");
});

it("keeps every chunking mode selectable inside Audio Advanced", async () => {
  await mountPlay();
  await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
  await userEvent.click(screen.getByText(/Audio Advanced/));
  for (const name of [/Every .* words/, /Every .* characters/, "Paragraph", "Whole"]) {
    await userEvent.click(screen.getByRole("radio", { name }));
    expect(screen.getByRole("radio", { name }).getAttribute("aria-checked")).toBe("true");
  }
});
it("focuses a stable image count after removing an earlier selected prompt", async () => {
  await mountPlay();
  await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Oils" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Maps" }));
  await userEvent.clear(screen.getByLabelText("Number for Maps"));
  await userEvent.click(screen.getByRole("checkbox", { name: "Oils" }));
  await userEvent.click(screen.getByRole("button", { name: "Review" }));
  const error = within(screen.getByRole("list", { name: "Setup errors" })).getByRole("button", {
    name: /between 1 and 20/,
  });
  await userEvent.click(error);
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByLabelText("Number for Maps")),
  );
});
it("retains hidden literal keyword values and renders prompt HTML as text", async () => {
  const { jsonAnswer } = await import("@/test-app");
  await mountPlay({
    "GET /api/prompts": jsonAnswer({
      prompts: [
        {
          id: "safe",
          name: "Dossier",
          kind: "article",
          body: "<img src=x onerror=alert(1)> {{__proto__}} {{topic.name}} {{with spaces}}",
          slots: [],
          updatedAt: "2026-09-03",
        },
      ],
    }),
  });
  await userEvent.selectOptions(screen.getByLabelText("Article prompt"), "Dossier");
  await userEvent.click(screen.getByText("View prompt"));
  expect(document.querySelector("pre img")).toBeNull();
  for (const name of ["__proto__", "topic.name", "with spaces"])
    await userEvent.type(screen.getByLabelText(name), "Kept");
  await userEvent.selectOptions(screen.getByLabelText("Article prompt"), "");
  expect(screen.queryByLabelText("__proto__")).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText("Article prompt"), "Dossier");
  for (const name of ["__proto__", "topic.name", "with spaces"])
    expect((screen.getByLabelText(name) as HTMLInputElement).value).toBe("Kept");
});
it("flushes the active draft before Create prompt navigation", async () => {
  const { requests } = await mountPlay();
  await userEvent.type(screen.getByLabelText("Project title"), "Keep this draft");
  await userEvent.click(screen.getByRole("button", { name: "Create prompt" }));
  await waitFor(() =>
    expect(
      requests.some((request) => request.method === "POST" && request.url.endsWith("/api/drafts")),
    ).toBe(true),
  );
  const saves = requests.filter(
    (request) =>
      ["PUT", "POST"].includes(request.method) &&
      /\/api\/drafts(?:\/[a-f0-9-]+)?$/.test(request.url),
  );
  expect(await saves.at(-1)?.json()).toMatchObject({
    document: { form: { title: "Keep this draft" } },
  });
});

it("edits a provided article from the summary and preserves focus through autosave", async () => {
  await mountPlay();
  await userEvent.click(
    within(screen.getByRole("radiogroup", { name: "article source" })).getByRole("radio", {
      name: "Provide",
    }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
  await userEvent.click(screen.getByRole("button", { name: /^Article:/ }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Article text")));
  await userEvent.type(screen.getByLabelText("Article text"), "A provided article.");
  await screen.findByText("Saved");
  expect(document.activeElement).toBe(screen.getByLabelText("Article text"));
});

it("switches the Document on, picks its theme and saves both into the draft", async () => {
  const { requests } = await mountPlay();
  await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
  const theme = screen.getByRole<HTMLSelectElement>("combobox", { name: "Theme" });
  expect(theme.value).toBe("dicemaster");
  expect(theme.disabled).toBe(true);
  expect(screen.getAllByRole("button", { name: /^Document: Off/ }).length).toBeGreaterThan(0);
  await userEvent.click(
    within(screen.getByRole("radiogroup", { name: "document source" })).getByRole("radio", {
      name: "Generate",
    }),
  );
  expect(theme.disabled).toBe(false);
  await userEvent.selectOptions(theme, "plain");
  expect(screen.getAllByRole("button", { name: /^Document: Ready/ }).length).toBeGreaterThan(0);
  await waitFor(async () => {
    const saves = requests.filter(
      (request) =>
        ["PUT", "POST"].includes(request.method) &&
        /\/api\/drafts(?:\/[a-f0-9-]+)?$/.test(request.url),
    );
    expect(await saves.at(-1)?.clone().json()).toMatchObject({
      document: { form: { sources: { document: "generate" }, document: { theme: "plain" } } },
    });
  });
});

it("switches the YouTube description on, picks its prompt and saves both into the draft", async () => {
  const { requests } = await mountPlay();
  await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
  const on = screen.getByRole<HTMLInputElement>("checkbox", { name: /YouTube description/ });
  const prompt = screen.getByRole<HTMLSelectElement>("combobox", { name: "Description prompt" });
  expect(on.checked).toBe(false);
  expect(prompt.disabled).toBe(true);
  expect(prompt.value).toBe("");
  expect(prompt.selectedOptions[0]?.textContent).toBe("Built-in");
  expect(
    screen.getAllByRole("button", { name: /^YouTube description: Off/ }).length,
  ).toBeGreaterThan(0);
  await userEvent.click(on);
  expect(prompt.disabled).toBe(false);
  await userEvent.selectOptions(prompt, "Hooky");
  expect(
    screen.getAllByRole("button", { name: /^YouTube description: Ready/ }).length,
  ).toBeGreaterThan(0);
  await waitFor(async () => {
    const saves = requests.filter(
      (request) =>
        ["PUT", "POST"].includes(request.method) &&
        /\/api\/drafts(?:\/[a-f0-9-]+)?$/.test(request.url),
    );
    expect(await saves.at(-1)?.clone().json()).toMatchObject({
      document: { form: { youtubeDescription: true, descriptionPrompt: "Hooky" } },
    });
  });
});

it("keeps the YouTube description switch in place but disabled without narration", async () => {
  await mountPlay();
  await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
  await userEvent.click(
    within(screen.getByRole("radiogroup", { name: "audio source" })).getByRole("radio", {
      name: "Off",
    }),
  );
  const on = screen.getByRole<HTMLInputElement>("checkbox", { name: /YouTube description/ });
  expect(on.disabled).toBe(true);
  expect(screen.getByText("Needs narration.")).not.toBeNull();
});
