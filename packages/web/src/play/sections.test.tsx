import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import type { PlaySession } from "./draft-context";
import { mountPlay, openRow, openSection } from "./play-test-fixture";

// The Outputs row's one line: what the run makes besides the video.
function outputsSummary(): string {
  return document.querySelector('[data-setup-row="outputs"] [data-row-summary]')?.textContent ?? "";
}

// Saves the draft at once, as the autosave would after its pause (draft-session.test.tsx times
// the pause itself).
async function saveNow(session: () => PlaySession): Promise<void> {
  await act(async () => {
    await session().flush();
  });
}

afterEach(cleanup);
it("folds the setup into rows that open in place and keep what was typed", async () => {
  const { requests } = await mountPlay();
  const rows = within(screen.getByRole("list", { name: "Setup" }));
  expect(rows.getAllByRole("button", { name: /^(Change|Done with) / })).toHaveLength(8);
  await userEvent.type(screen.getByLabelText("Title"), "Retained");
  // Rows that need attention on a fresh draft start open; the others open with Change.
  for (const name of ["Video and style", "Outputs", "Channel"]) {
    const change = rows.getByRole("button", { name: `Change ${name.toLowerCase()}` });
    expect(change.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(change);
    expect(screen.getByRole("region", { name })).not.toBeNull();
    await userEvent.click(rows.getByRole("button", { name: `Done with ${name.toLowerCase()}` }));
    expect(screen.queryByRole("region", { name })).toBeNull();
  }
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Retained");
  expect(requests.some((r) => r.url.endsWith("/api/projects") && r.method === "POST")).toBe(false);
});
it("opens Review while invalid and reveals the exact error control", async () => {
  const { created } = await mountPlay();
  await userEvent.click(screen.getByLabelText("Title"));
  await userEvent.keyboard("{Control>}{Enter}{/Control}");
  await screen.findByRole("heading", { name: "Review" });
  await userEvent.click(screen.getByRole("button", { name: "Pick an article prompt." }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Article prompt")));
  expect(screen.getByLabelText("Article prompt").getAttribute("aria-invalid")).toBe("true");
  expect(created).not.toHaveBeenCalled();
});
it("does not mark untouched fields when another field changes", async () => {
  await mountPlay();
  await userEvent.type(screen.getByLabelText("Title"), "Title");
  expect(screen.getByLabelText("Article prompt").getAttribute("aria-invalid")).toBe("false");
});

it("keeps every chunking mode selectable inside Audio Advanced", async () => {
  await mountPlay();
  await openRow("Narration");
  await userEvent.click(screen.getByText(/Audio Advanced/));
  for (const name of [/Every .* words/, /Every .* characters/, "Paragraph", "Whole"]) {
    await userEvent.click(screen.getByRole("radio", { name }));
    expect(screen.getByRole("radio", { name }).getAttribute("aria-checked")).toBe("true");
  }
});
it("focuses a stable image count after removing an earlier selected prompt", async () => {
  await mountPlay();
  await openRow("Images");
  await userEvent.click(screen.getByRole("checkbox", { name: "Oils" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Maps" }));
  await userEvent.clear(screen.getByLabelText("Number for Maps"));
  await userEvent.click(screen.getByRole("checkbox", { name: "Oils" }));
  await openSection("Review");
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
  await openRow("Title and keywords");
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
  await userEvent.type(screen.getByLabelText("Title"), "Keep this draft");
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
  // The reason under the Play key names what is missing and goes to it.
  await userEvent.click(
    within(screen.getByRole("region", { name: "Start" })).getByRole("button", {
      name: "Paste the article to play",
    }),
  );
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Article text")));
  await userEvent.type(screen.getByLabelText("Article text"), "A provided article.");
  await screen.findByText("Saved");
  expect(document.activeElement).toBe(screen.getByLabelText("Article text"));
});

it("switches the Document on, picks its theme and saves both into the draft", async () => {
  const { requests, session } = await mountPlay();
  await openRow("Outputs");
  const theme = screen.getByRole<HTMLSelectElement>("combobox", { name: "Theme" });
  // Plain is the one built-in; DiceMaster is no longer offered.
  expect(theme.value).toBe("builtin:plain");
  expect(
    Array.from(
      theme.querySelectorAll("optgroup[label='Built in'] option"),
      (one) => one.textContent,
    ),
  ).toEqual(["Plain"]);
  expect(theme.disabled).toBe(true);
  expect(outputsSummary()).not.toMatch(/PDF/);
  await userEvent.click(
    within(screen.getByRole("radiogroup", { name: "document source" })).getByRole("radio", {
      name: "Generate",
    }),
  );
  expect(theme.disabled).toBe(false);
  expect(outputsSummary()).toMatch(/PDF \(Plain\)/);
  await saveNow(session);
  {
    const saves = requests.filter(
      (request) =>
        ["PUT", "POST"].includes(request.method) &&
        /\/api\/drafts(?:\/[a-f0-9-]+)?$/.test(request.url),
    );
    const saved = await saves.at(-1)?.clone().json();
    expect(saved).toMatchObject({ document: { form: { sources: { document: "generate" } } } });
    // The default needs no saving: a draft without a theme reads, and is made, as Plain.
    expect(saved.document.form.document?.theme ?? "plain").toBe("plain");
  }
});

it("switches the YouTube description on, picks its prompt and saves both into the draft", async () => {
  const { requests, session } = await mountPlay();
  await openRow("Outputs");
  const on = screen.getByRole<HTMLInputElement>("checkbox", { name: /YouTube description/ });
  const prompt = screen.getByRole<HTMLSelectElement>("combobox", { name: "Description prompt" });
  expect(on.checked).toBe(false);
  expect(prompt.disabled).toBe(true);
  expect(prompt.value).toBe("");
  expect(prompt.selectedOptions[0]?.textContent).toBe("Built-in");
  expect(outputsSummary()).not.toMatch(/YouTube description/);
  await userEvent.click(on);
  expect(prompt.disabled).toBe(false);
  await userEvent.selectOptions(prompt, "Hooky");
  expect(outputsSummary()).toMatch(/YouTube description/);
  await saveNow(session);
  {
    const saves = requests.filter(
      (request) =>
        ["PUT", "POST"].includes(request.method) &&
        /\/api\/drafts(?:\/[a-f0-9-]+)?$/.test(request.url),
    );
    expect(await saves.at(-1)?.clone().json()).toMatchObject({
      document: { form: { youtubeDescription: true, descriptionPrompt: "Hooky" } },
    });
  }
});

it("keeps the YouTube description switch in place but disabled without narration", async () => {
  await mountPlay();
  await openSection("Outputs");
  await userEvent.click(
    within(screen.getByRole("radiogroup", { name: "audio source" })).getByRole("radio", {
      name: "Off",
    }),
  );
  const on = screen.getByRole<HTMLInputElement>("checkbox", { name: /YouTube description/ });
  expect(on.disabled).toBe(true);
  // The YouTube description and the Shorts both say it.
  expect(screen.getAllByText("Needs narration.")).toHaveLength(2);
});

it("switches Shorts on, sets how many and how long, picks both prompts and saves them into the draft", async () => {
  const { requests, session } = await mountPlay();
  await openRow("Outputs");
  const on = screen.getByRole<HTMLInputElement>("checkbox", { name: /Shorts/ });
  const count = screen.getByRole<HTMLInputElement>("textbox", { name: "How many shorts" });
  const prompt = screen.getByRole<HTMLSelectElement>("combobox", { name: "Shorts prompt" });
  const style = screen.getByRole<HTMLSelectElement>("combobox", { name: "Image style" });
  expect(on.checked).toBe(false);
  expect(count.disabled).toBe(true);
  expect(count.value).toBe("3");
  expect(prompt.selectedOptions[0]?.textContent).toBe("Built-in");
  expect(outputsSummary()).not.toMatch(/shorts/);
  await userEvent.click(on);
  await userEvent.clear(count);
  await userEvent.type(count, "2");
  const longest = screen.getByRole<HTMLInputElement>("textbox", {
    name: "Longest short, in seconds",
  });
  await userEvent.clear(longest);
  await userEvent.type(longest, "90");
  await userEvent.selectOptions(prompt, "Hooks");
  await userEvent.selectOptions(style, "Maps");
  expect(outputsSummary()).toMatch(/2 shorts/);
  await saveNow(session);
  {
    const saves = requests.filter(
      (request) =>
        ["PUT", "POST"].includes(request.method) &&
        /\/api\/drafts(?:\/[a-f0-9-]+)?$/.test(request.url),
    );
    expect(await saves.at(-1)?.clone().json()).toMatchObject({
      document: {
        form: {
          shorts: {
            enabled: true,
            count: "2",
            minSeconds: "60",
            maxSeconds: "90",
            prompt: "Hooks",
            imagePrompt: "Maps",
          },
        },
      },
    });
  }
});

it("refuses a Shorts length whose shortest is longer than its longest, in plain words", async () => {
  await mountPlay();
  await openRow("Outputs");
  await userEvent.click(screen.getByRole("checkbox", { name: /Shorts/ }));
  const shortest = screen.getByRole<HTMLInputElement>("textbox", {
    name: "Shortest short, in seconds",
  });
  await userEvent.clear(shortest);
  await userEvent.type(shortest, "150");
  // A problem shows once the field is left.
  await userEvent.tab();
  expect(
    await screen.findByText(
      "The longest a short may be must be at least the shortest. Raise the maximum or lower the minimum.",
    ),
  ).not.toBeNull();
  expect(
    within(
      document.querySelector<HTMLElement>('[data-setup-row="outputs"]') ?? document.body,
    ).getByText("Needs setup"),
  ).not.toBeNull();
});

it("keeps the title, speed, music volume and link in More shorts options and saves them into the draft", async () => {
  const { requests, session } = await mountPlay();
  await openRow("Outputs");
  await userEvent.click(screen.getByRole("checkbox", { name: /Shorts/ }));
  // Closed until asked for; a new form starts with the title on screen.
  const more = screen.getByText(/More shorts options/);
  expect(more.textContent).toBe("More shorts options · Title on screen");
  expect(more.closest("details")?.open).toBe(false);
  await userEvent.click(more);
  expect(screen.getByRole<HTMLInputElement>("checkbox", { name: /Title on screen/ }).checked).toBe(
    true,
  );
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Speed" }), "1.10");
  await userEvent.type(screen.getByRole("textbox", { name: /Music volume/ }), "25");
  await userEvent.type(screen.getByRole("textbox", { name: "Full video link" }), "youtu.be/x");
  await userEvent.tab();
  // Refused in the shared rule's words, and the disclosure stays open to show it.
  expect(
    await screen.findByText(
      "The full video link must be a whole web address starting with https:// or http://, like https://youtu.be/abc123. Paste it again, or leave the box empty.",
    ),
  ).not.toBeNull();
  const link = screen.getByRole<HTMLInputElement>("textbox", { name: "Full video link" });
  await userEvent.clear(link);
  await userEvent.type(link, "https://youtu.be/x");
  expect(more.textContent).toBe(
    "More shorts options · Title on screen · 1.10× · Music at 25% · Full video linked",
  );
  // The music file is attached beside them, as a draft upload.
  expect(screen.getByLabelText(/^Background music \(optional\)/)).not.toBeNull();
  await saveNow(session);
  {
    const saves = requests.filter(
      (request) =>
        ["PUT", "POST"].includes(request.method) &&
        /\/api\/drafts(?:\/[a-f0-9-]+)?$/.test(request.url),
    );
    expect(await saves.at(-1)?.clone().json()).toMatchObject({
      document: {
        form: {
          shorts: {
            enabled: true,
            titleOnScreen: true,
            speed: "1.10",
            musicVolume: "25",
            fullVideoLink: "https://youtu.be/x",
          },
        },
      },
    });
  }
});
