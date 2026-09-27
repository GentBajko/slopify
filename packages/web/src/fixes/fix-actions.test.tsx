import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PictureFailure } from "@/channels/cast-editor";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "@/test-app";

// The fix-it buttons outside a project: a cast picture that could not be made gets the same
// fix a failed project step would, from the same rules.

afterEach(cleanup);

const health = (state: "ok" | "problem"): Answer =>
  jsonAnswer({
    checkedAt: "2026-09-27T10:00:00.000Z",
    providers: [
      {
        id: "codex",
        displayName: "Codex",
        family: "llm",
        state,
        checks: [{ label: "Signed in", state, detail: "" }],
      },
    ],
  });

it("signs a CLI in for a cast picture, then makes it again", async () => {
  const user = userEvent.setup();
  const run = vi.fn();
  renderRouted(
    <PictureFailure
      error="The picture couldn't be made: The Codex CLI is not signed in, or its sign-in has expired. Check the image provider in Settings → Providers, then press Generate again."
      retry={{ run, busy: false }}
      onReword={() => undefined}
    />,
    testDeps({ "POST /api/providers/health": health("ok") }),
  );
  await user.click(await screen.findByRole("button", { name: "Copy sign-in command" }));
  expect(await navigator.clipboard.readText()).toBe("codex login");
  await user.click(screen.getByRole("button", { name: "Check again" }));
  await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
});

it("rewords a refused cast picture and links a rejected key to its settings", async () => {
  const user = userEvent.setup();
  const reword = vi.fn();
  renderRouted(
    <PictureFailure
      error="The picture couldn't be made: fal.ai refused to make this image under its content rules."
      retry={undefined}
      onReword={reword}
    />,
    testDeps({}),
  );
  await user.click(await screen.findByRole("button", { name: "Reword the picture" }));
  expect(reword).toHaveBeenCalledOnce();
  cleanup();
  renderRouted(
    <PictureFailure
      error="The picture couldn't be made: fal.ai did not accept the API key (error 401)."
      retry={undefined}
      onReword={() => undefined}
    />,
    testDeps({}),
  );
  expect(
    (await screen.findByRole("link", { name: "Open Settings → Providers" })).getAttribute("href"),
  ).toContain("section=providers");
});

it("shows only the words when no fix is known", async () => {
  renderRouted(
    <PictureFailure
      error="Slopify stopped before this picture was finished. Press Generate again."
      retry={undefined}
      onReword={() => undefined}
    />,
    testDeps({}),
  );
  expect(await screen.findByText(/Slopify stopped before/)).not.toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});
