import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { problemAnswer } from "@/test-app";
import { mountSupplied, ready, response } from "./draft-upload-test-fixture";
import { deferred, fill, openSection } from "./play-test-fixture";

afterEach(() => {
  cleanup();
  window.localStorage?.clear();
});
it.each(["remove", "replace"] as const)(
  "aborts %s and fences a held real upload response out of subsequent saves",
  async (action) => {
    const pending = deferred();
    let request: Request | undefined;
    const { requests, session } = await mountSupplied({
      "PUT /api/drafts/:id/attachments/:attachmentId/file": (sent) => {
        if (!request) {
          request = sent;
          return pending.promise;
        }
        return response({ ...ready(sent), name: "new.wav" });
      },
    });
    await openSection("Outputs");
    await userEvent.upload(
      screen.getByLabelText("Narration file"),
      new File(["wav"], "old.wav", { type: "audio/wav" }),
    );
    await waitFor(() => expect(request).toBeDefined());
    const old = request ? ready(request).id : "missing";
    if (action === "remove")
      await userEvent.click(screen.getByRole("button", { name: "Remove old.wav" }));
    else
      await userEvent.upload(
        screen.getByLabelText("Narration file"),
        new File(["new"], "new.wav", { type: "audio/wav" }),
      );
    await openSection("Style");
    expect(request?.signal.aborted).toBe(true);
    const saves = () =>
      requests.filter((sent) => sent.method === "PUT" && /\/drafts\/[a-f0-9-]+$/.test(sent.url));
    // The rows stay where they are, so the save after the change is what drops the file. It is
    // saved at once here rather than after the autosave pause (draft-session.test.tsx times it).
    await act(async () => {
      await session().flush();
    });
    expect(await saves().at(-1)?.clone().text()).not.toContain(old);
    await act(async () => {
      if (request) pending.resolve(response(ready(request)));
    });
    await fill(screen.getByLabelText("Title"), "Next autosave");
    await act(async () => {
      await session().flush();
    });
    expect(screen.getByText("Saved")).not.toBeNull();
    expect(await saves().at(-1)?.clone().text()).not.toContain(old);
    await openSection("Outputs");
    expect(screen.queryByText("old.wav")).toBeNull();
    if (action === "replace")
      expect(
        within(screen.getByRole("region", { name: "Narration" })).getByText("new.wav"),
      ).not.toBeNull();
    expect(requests.some((sent) => sent.method === "DELETE")).toBe(false);
  },
);
it("guards upload identity across draft and attachment changes", async () => {
  const { sameUploadOwner } = await import("./draft-uploads");
  const owner = { draftId: "one", attachmentId: "a" };
  expect(sameUploadOwner(owner, owner)).toBe(true);
  expect(sameUploadOwner(undefined, owner)).toBe(false);
  expect(sameUploadOwner({ ...owner, draftId: "two" }, owner)).toBe(false);
  expect(sameUploadOwner({ ...owner, attachmentId: "b" }, owner)).toBe(false);
});

it("keeps the font upload lock after leaving Style and preserves concurrent style edits", async () => {
  const pending = deferred();
  await mountSupplied({ "POST /api/fonts": () => pending.promise });
  await openSection("Style");
  await userEvent.selectOptions(
    screen.getByLabelText("Subtitles", { selector: "select" }),
    "files",
  );
  await userEvent.upload(
    screen.getByLabelText("Upload font (.ttf or .otf)"),
    new File(["font"], "draft.ttf", { type: "font/ttf" }),
  );
  await userEvent.clear(screen.getByLabelText("Subtitle font size"));
  await userEvent.type(screen.getByLabelText("Subtitle font size"), "64");
  await userEvent.click(screen.getByRole("radio", { name: "center" }));
  await openSection("Review");
  expect(screen.queryByRole("list", { name: "Setup errors" })).toBeNull();
  expect(
    String((screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled),
  ).toBe("true");
  await act(async () =>
    pending.resolve(
      response({
        font: { id: "uploaded-font", name: "Draft", family: "Draft", source: "uploaded" },
      }),
    ),
  );
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Refresh review" }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  await userEvent.click(screen.getByRole("button", { name: "Refresh review" }));
  await waitFor(() =>
    expect(
      String((screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled),
    ).toBe("false"),
  );
  await openSection("Style");
  expect((screen.getByLabelText("Subtitle font") as HTMLSelectElement).value).toBe("uploaded-font");
  expect((screen.getByLabelText("Subtitle font size") as HTMLInputElement).value).toBe("64");
  expect(screen.getByRole("radio", { name: "center" }).getAttribute("aria-checked")).toBe("true");
});
it("keeps pending media across Outputs, Style, Content and binds its success once", async () => {
  const pending = deferred();
  let request: Request | undefined;
  const mounted = await mountSupplied({
    "PUT /api/drafts/:id/attachments/:attachmentId/file": (sent) => {
      request = sent;
      return pending.promise;
    },
  });
  await openSection("Outputs");
  await userEvent.upload(
    screen.getByLabelText("Narration file"),
    new File(["wav"], "pending.wav", { type: "audio/wav" }),
  );
  await waitFor(() => expect(request).toBeDefined());
  expect((screen.getByLabelText("Narration file") as HTMLInputElement).value).toBe("");
  for (const name of ["Style", "Content", "Review"]) await openSection(name);
  expect(
    String((screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled),
  ).toBe("true");
  await openSection("Outputs");
  expect(
    within(screen.getByRole("region", { name: "Narration" })).getByText("pending.wav"),
  ).not.toBeNull();
  await act(async () => {
    if (request) pending.resolve(response({ ...ready(request), name: "pending.wav" }));
  });
  await screen.findByText("Staged");
  // The review refused while the file was copying; asking again finds it ready.
  await userEvent.click(screen.getByRole("button", { name: "Refresh review" }));
  await waitFor(() =>
    expect(
      String((screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled),
    ).toBe("false"),
  );
  expect(
    mounted.requests.filter((one) => one.url.endsWith("/file") && one.method === "PUT"),
  ).toHaveLength(1);
});
it("restores interrupted media with Reattach and Remove and resets same-file selections", async () => {
  const uploads = vi.fn((request: Request) =>
    response({ ...ready(request), state: "reattach", stagedFileId: null, error: "Interrupted" }),
  );
  const { requests } = await mountSupplied(
    { "PUT /api/drafts/:id/attachments/:attachmentId/file": uploads },
    true,
  );
  await openSection("Outputs");
  const input = screen.getByLabelText("Reattach saved.wav") as HTMLInputElement;
  expect(input.value).toBe("");
  expect(screen.getByRole("button", { name: "Remove saved.wav" })).not.toBeNull();
  const file = new File(["wav"], "saved.wav", { type: "audio/wav" });
  await userEvent.upload(input, file);
  expect(input.value).toBe("");
  await userEvent.upload(await screen.findByLabelText("Reattach saved.wav"), file);
  await waitFor(() => expect(uploads).toHaveBeenCalledTimes(2));
  expect(
    new Set(requests.filter((one) => one.url.endsWith("/file")).map((one) => one.url)).size,
  ).toBe(2);
  await userEvent.click(screen.getByRole("button", { name: "Remove saved.wav" }));
  expect(screen.queryByLabelText("Reattach saved.wav")).toBeNull();
});
it("shows a failed font after revisiting Style and recovers by selecting a font", async () => {
  const pending = deferred();
  await mountSupplied({ "POST /api/fonts": () => pending.promise });
  await openSection("Style");
  await userEvent.selectOptions(
    screen.getByLabelText("Subtitles", { selector: "select" }),
    "files",
  );
  await userEvent.upload(
    screen.getByLabelText("Upload font (.ttf or .otf)"),
    new File(["font"], "broken.ttf", { type: "font/ttf" }),
  );
  await openSection("Review");
  await act(async () =>
    pending.resolve(await problemAnswer("Invalid font")(new Request("http://test"))),
  );
  expect(
    String((screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled),
  ).toBe("true");
  await openSection("Style");
  expect(screen.getByText("Invalid font")).not.toBeNull();
  expect(screen.getByText("Reattach broken.ttf, or select a font.")).not.toBeNull();
  await userEvent.selectOptions(screen.getByLabelText("Subtitle font"), "default");
  await openSection("Review");
  await waitFor(() =>
    expect(
      String((screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled),
    ).toBe("false"),
  );
});

it("ignores dormant missing narration after Audio is turned Off", async () => {
  const { created } = await mountSupplied({}, true);
  await openSection("Outputs");
  const { within } = await import("@testing-library/react");
  await userEvent.click(
    within(screen.getByRole("radiogroup", { name: "audio source" })).getByRole("radio", {
      name: "Off",
    }),
  );
  await openSection("Review");
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "Start run" }));
  await waitFor(() => expect(created).toHaveBeenCalledTimes(1));
});
