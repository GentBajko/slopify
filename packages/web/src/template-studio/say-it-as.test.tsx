import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "../test-app";
import { SayItAs } from "./say-it-as";

afterEach(cleanup);

const id = "11111111-1111-4111-8111-111111111111";
const base = `/api/template-studio/${id}`;
const names = {
  names: [
    {
      term: "Cleopatra",
      ipa: ["kliːəˈpætrə"],
      line: "Cleopatra ruled from Alexandria.",
      spokenAs: null,
    },
    { term: "Octavian", ipa: [], line: "Her rival was Octavian!", spokenAs: "Ock-TAY-vee-an" },
  ],
  aliasesOn: true,
  voice: { provider: "elevenlabs", model: "m", voice: "v" },
  problem: null,
};
const priced = (high: number) => jsonAnswer({ estimate: { high, low: high, unknown: 0 } });

it("lists the sample's names, and saves one said another way at the voice-only price", async () => {
  let sent: unknown;
  const save = vi.fn(async (request: Request) => {
    sent = await request.json();
    return jsonAnswer({ queued: true })(request);
  });
  const user = userEvent.setup();
  renderRouted(
    <SayItAs templateId={id} revisionId="r1" aliasesOn onAliasesOn={() => undefined} />,
    testDeps({
      [`GET ${base}/pronunciations`]: jsonAnswer(names),
      "POST /api/auditions/quote": priced(0.001),
      [`POST ${base}/say-it-as/quote`]: jsonAnswer({
        lines: 2,
        high: 0.003,
        unknown: 0,
        fits: true,
        problem: null,
      }),
      [`POST ${base}/say-it-as`]: save,
    }),
  );
  const list = await screen.findByRole("list", { name: "Names to check" });
  const cleopatra = within(list).getByRole("listitem", { name: "Cleopatra" });
  expect(within(cleopatra).getByText("/kliːəˈpætrə/")).toBeTruthy();
  expect(within(list).getByText("Said as “Ock-TAY-vee-an”")).toBeTruthy();
  expect(
    await within(cleopatra).findByRole("button", { name: "Play Cleopatra · under $0.01" }),
  ).toBeTruthy();
  await user.type(within(cleopatra).getByLabelText("Say Cleopatra as"), "Klee-oh-PAT-ra");
  const button = await within(cleopatra).findByRole("button", {
    name: "Save · re-voice 2 lines · under $0.01",
  });
  await user.click(button);
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(sent).toEqual({
    written: "Cleopatra",
    spoken: "Klee-oh-PAT-ra",
    acknowledgedHigh: 0.003,
    acknowledgedUnknown: false,
  });
  expect(
    await screen.findByText(
      "Saved in your pronunciations: “Cleopatra” is said “Klee-oh-PAT-ra”. Re-voicing the sample's lines that say it.",
    ),
  ).toBeTruthy();
});

it("offers to use your pronunciations while the template's narration doesn't", async () => {
  const user = userEvent.setup();
  const turnOn = vi.fn();
  renderRouted(
    <SayItAs templateId={id} revisionId="r1" aliasesOn={false} onAliasesOn={turnOn} />,
    testDeps({
      [`GET ${base}/pronunciations`]: jsonAnswer({ ...names, aliasesOn: false }),
      "POST /api/auditions/quote": priced(0.001),
    }),
  );
  expect(
    await screen.findByText("The narration doesn't use your pronunciations yet."),
  ).toBeTruthy();
  expect(screen.getByLabelText("Say Cleopatra as").hasAttribute("disabled")).toBe(true);
  await user.click(screen.getByRole("button", { name: "Use them" }));
  expect(turnOn).toHaveBeenCalledOnce();
});

it("asks for a Save once the narration is set to use them", async () => {
  renderRouted(
    <SayItAs templateId={id} revisionId="r1" aliasesOn onAliasesOn={() => undefined} />,
    testDeps({
      [`GET ${base}/pronunciations`]: jsonAnswer({ ...names, aliasesOn: false }),
      "POST /api/auditions/quote": priced(0.001),
    }),
  );
  expect(
    await screen.findByText(
      "Save to have the narration use your pronunciations, then say a name another way.",
    ),
  ).toBeTruthy();
});

it("draws nothing before the sample's article names anyone", async () => {
  const asked = vi.fn(() =>
    Response.json({
      names: [],
      aliasesOn: true,
      voice: null,
      problem: "The names to check come from the sample's article.",
    }),
  );
  renderRouted(
    <SayItAs templateId={id} revisionId={null} aliasesOn onAliasesOn={() => undefined} />,
    testDeps({ [`GET ${base}/pronunciations`]: asked }),
  );
  await waitFor(() => expect(asked).toHaveBeenCalledOnce());
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.queryByRole("region", { name: "Say it as" })).toBeNull();
  expect(screen.queryByText("Names the voice may say wrong")).toBeNull();
});

it("shows a refusal's own sentence and keeps what was typed", async () => {
  const user = userEvent.setup();
  renderRouted(
    <SayItAs templateId={id} revisionId="r1" aliasesOn onAliasesOn={() => undefined} />,
    testDeps({
      [`GET ${base}/pronunciations`]: jsonAnswer(names),
      "POST /api/auditions/quote": priced(0.001),
      [`POST ${base}/say-it-as/quote`]: jsonAnswer({
        lines: 1,
        high: 0.01,
        unknown: 0,
        fits: false,
        problem: null,
      }),
      [`POST ${base}/say-it-as`]: jsonAnswer(
        {
          title: "Conflict",
          reason: "over-budget",
          detail:
            "Voicing these lines again costs about $0.01 and $0.00 of today's $0.00 sample budget is left. Raise the budget in Settings → Template studio, or try again tomorrow.",
        },
        409,
      ),
    }),
  );
  const list = await screen.findByRole("list", { name: "Names to check" });
  const row = within(list).getByRole("listitem", { name: "Cleopatra" });
  const box = within(row).getByLabelText("Say Cleopatra as");
  await user.type(box, "Kleo");
  await user.click(await within(row).findByRole("button", { name: /^Save · re-voice 1 line/u }));
  expect((await screen.findByRole("alert")).textContent).toContain("Raise the budget");
  expect((box as HTMLInputElement).value).toBe("Kleo");
});
