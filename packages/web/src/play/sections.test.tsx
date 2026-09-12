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
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name })));
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
  await userEvent.click(screen.getByRole("button", { name: "Edit Article" }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Article text")));
  await userEvent.type(screen.getByLabelText("Article text"), "A provided article.");
  await screen.findByText("Saved");
  expect(document.activeElement).toBe(screen.getByLabelText("Article text"));
});
