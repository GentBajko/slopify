import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import type { PlaySession } from "./draft-context";
import { mountPlay, openRow, openSection, summaryTitle, topicLabel } from "./play-test-fixture";

// The Extras row's one sentence: what the run makes besides the video.
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
it("folds the setup into rows, one open at a time, that keep what was typed", async () => {
  const { requests } = await mountPlay();
  const rows = within(screen.getByRole("list", { name: "Setup" }));
  // Keywords and Channel are rows only when there is something to set: no prompt asks for a
  // keyword yet, and there is one channel.
  const names = document.querySelectorAll("[data-setup-row] > [data-row-head] h3");
  expect(Array.from(names, (heading) => heading.textContent)).toEqual([
    "Article",
    "Narration",
    "Images",
    "Video and style",
    "Extras",
    "Pauses and checks",
  ]);
  // A row that needs something says Fix; the first of them is open on arrival.
  expect(rows.getByRole("button", { name: "Fix narration" })).not.toBeNull();
  expect(screen.getByRole("region", { name: "Article" })).not.toBeNull();
  await userEvent.type(screen.getByLabelText(topicLabel), "Retained");
  for (const name of ["Video and style", "Extras", "Pauses and checks"]) {
    const change = rows.getByRole("button", { name: `Change ${name.toLowerCase()}` });
    expect(change.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(change);
    expect(screen.getByRole("region", { name })).not.toBeNull();
    // Opening a row folds the one that was open.
    expect(screen.queryByRole("region", { name: "Article" })).toBeNull();
    await userEvent.click(rows.getByRole("button", { name: `Close ${name.toLowerCase()}` }));
    expect(screen.queryByRole("region", { name })).toBeNull();
  }
  expect((screen.getByLabelText(topicLabel) as HTMLInputElement).value).toBe("Retained");
  expect(requests.some((r) => r.url.endsWith("/api/projects") && r.method === "POST")).toBe(false);
});
it("opens the summary with the keyboard and goes to the exact missing control", async () => {
  const { created } = await mountPlay();
  await userEvent.type(screen.getByLabelText(topicLabel), "Rope Tricks");
  await openRow("Extras");
  await userEvent.keyboard("{Control>}{Enter}{/Control}");
  await screen.findByRole("heading", { name: summaryTitle });
  await userEvent.click(
    within(screen.getByRole("list", { name: "What is missing" })).getByRole("button", {
      name: /Pick an article prompt/,
    }),
  );
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Article prompt")));
  expect(screen.getByLabelText("Article prompt").getAttribute("aria-invalid")).toBe("true");
  expect(created).not.toHaveBeenCalled();
});
it("does not mark untouched fields when another field changes", async () => {
  await mountPlay();
  await userEvent.type(screen.getByLabelText(topicLabel), "Title");
  expect(screen.getByLabelText("Article prompt").getAttribute("aria-invalid")).toBe("false");
});

it("keeps every chunking mode selectable inside More audio settings", async () => {
  await mountPlay();
  await openRow("Narration");
  await userEvent.click(screen.getByText(/More audio settings/));
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
  const error = within(screen.getByRole("list", { name: "What is missing" })).getByRole("button", {
    name: /from 1 to 20/,
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
  await openRow("Keywords");
  for (const name of ["__proto__", "topic.name", "with spaces"])
    await userEvent.type(screen.getByLabelText(name), "Kept");
  await openRow("Article");
  await userEvent.selectOptions(screen.getByLabelText("Article prompt"), "");
  // Nothing asks for a keyword now, so there is no Keywords row at all.
  expect(document.querySelector('[data-setup-row="title"]')).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText("Article prompt"), "Dossier");
  await openRow("Keywords");
  for (const name of ["__proto__", "topic.name", "with spaces"])
    expect((screen.getByLabelText(name) as HTMLInputElement).value).toBe("Kept");
});
it("flushes the active draft before Create prompt navigation", async () => {
  const { requests } = await mountPlay();
  await userEvent.type(screen.getByLabelText(topicLabel), "Keep this draft");
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

it("goes to a provided article from the hint and preserves focus through autosave", async () => {
  const { session } = await mountPlay();
  await userEvent.type(screen.getByLabelText(topicLabel), "Rope Tricks");
  await userEvent.click(
    within(screen.getByRole("radiogroup", { name: "article source" })).getByRole("radio", {
      name: "Use my text as written",
    }),
  );
  await openRow("Extras");
  // The hint under the Make key names what is missing and goes to it.
  await userEvent.click(
    within(screen.getByRole("region", { name: "Start" })).getByRole("button", {
      name: "Paste the article first",
    }),
  );
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Article text")));
  await userEvent.type(screen.getByLabelText("Article text"), "A provided article.");
  await waitFor(() => expect(session().status).toBe("saved"));
  expect(document.activeElement).toBe(screen.getByLabelText("Article text"));
});

it("switches the Document on, picks its theme and saves both into the draft", async () => {
  const { requests, session } = await mountPlay();
  await openRow("Extras");
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
  expect(outputsSummary()).toBe("The video only: no thumbnail, description, shorts or PDF.");
  await userEvent.click(
    within(screen.getByRole("radiogroup", { name: "document source" })).getByRole("radio", {
      name: "Generate",
    }),
  );
  expect(theme.disabled).toBe(false);
  expect(outputsSummary()).toBe("Also makes a PDF in the Plain look.");
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
  await openRow("Extras");
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
  await openRow("Extras");
  const on = screen.getByRole<HTMLInputElement>("checkbox", { name: /Shorts/ });
  const count = screen.getByRole<HTMLInputElement>("textbox", { name: "How many shorts" });
  const prompt = screen.getByRole<HTMLSelectElement>("combobox", { name: "Shorts prompt" });
  const style = screen.getByRole<HTMLSelectElement>("combobox", { name: "Image style" });
  expect(on.checked).toBe(false);
  expect(count.disabled).toBe(true);
  expect(count.value).toBe("3");
  expect(prompt.selectedOptions[0]?.textContent).toBe("Built-in");
  expect(outputsSummary()).not.toMatch(/\d shorts/);
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
  await openRow("Extras");
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
  // The row says it too, in red, with its lamp and words.
  expect(document.querySelector('[data-setup-row="outputs"] [data-row-problem]')?.textContent).toBe(
    "Set how long the shorts are",
  );
});

it("keeps the title, speed, music volume and link in More shorts options and saves them into the draft", async () => {
  const { requests, session } = await mountPlay();
  await openRow("Extras");
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
