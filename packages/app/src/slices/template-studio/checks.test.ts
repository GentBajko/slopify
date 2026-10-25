import { describe, expect, it } from "vitest";
import { draftFixture } from "../play-drafts/draft.fake.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { type FreeCheckInput, freeChecks } from "./checks.js";

const fixture = draftFixture();
const base = fixture.document;
fixture.close();

const document: PlayDraftDocument = {
  ...base,
  form: {
    ...base.form,
    title: "History: {{Topic}}",
    llm: { provider: "openai", model: "gpt" },
    audio: { ...base.form.audio, provider: "elevenlabs", model: "m", voice: "v" },
    images: { provider: "fal", model: "flux" },
    values: { Topic: "", minWords: "1200" },
  },
};
const ready = new Map([
  ["openai", { name: "OpenAI", ready: true }],
  ["elevenlabs", { name: "ElevenLabs", ready: true }],
  ["fal", { name: "fal.ai", ready: true }],
]);
const input: FreeCheckInput = {
  templateId: "t1",
  document,
  bodies: [
    "Write {{minWords}} words about {{Topic}}.",
    "An engraving. {{Scene}} {{Slopify_Title}}",
  ],
  providers: ready,
  schedules: [],
  monthlyCost: null,
  notificationUrl: false,
  agentSeenAt: null,
  now: new Date("2026-10-18T10:00:00Z"),
};
const check = (overrides: Partial<FreeCheckInput>, id: string) =>
  freeChecks({ ...input, ...overrides }).find((one) => one.id === id);

describe("freeChecks", () => {
  it("passes every check for a complete template without schedules", () => {
    expect(freeChecks(input).map((one) => [one.id, one.ok])).toEqual([
      ["keywords", true],
      ["providers", true],
      ["voice", true],
      ["release-slots", true],
      ["monthly-cost", true],
      ["answerers", true],
    ]);
    expect(freeChecks(input).every((one) => one.fix === undefined)).toBe(true);
  });

  describe("keywords", () => {
    it("names each empty keyword and links to Title and keywords", () => {
      const result = check({ bodies: ["Write in {{style}} about {{era}}."] }, "keywords");
      expect(result).toEqual({
        id: "keywords",
        ok: false,
        sentence:
          "Keywords are empty: {{style}} and {{era}}. A run would send the prompt with nothing in their place.",
        fix: {
          label: "Fill them in Title and keywords",
          href: "/templates/t1?section=subject",
        },
      });
    });

    it("counts a keyword of only spaces as empty", () => {
      const spaced = { ...document, form: { ...document.form, values: { minWords: "  " } } };
      expect(check({ document: spaced }, "keywords")?.sentence).toBe(
        "A keyword is empty: {{minWords}}. A run would send the prompt with nothing in its place.",
      );
    });

    it("leaves out the keywords Slopify fills itself", () => {
      const result = check(
        {
          bodies: [
            "{{Slopify_Title}} for {{Slopify_Channel}}: {{Slopify_Covered_Before}}, {{Scene}}.",
          ],
        },
        "keywords",
      );
      expect(result?.ok).toBe(true);
    });

    it("lets a schedule's topic keyword stay empty", () => {
      const result = check(
        {
          bodies: ["About {{Subject}}."],
          schedules: [
            { id: "s1", name: "Daily", topicKeyword: "Subject", runDays: [1], releases: [] },
          ],
        },
        "keywords",
      );
      expect(result?.ok).toBe(true);
    });
  });

  describe("providers", () => {
    const providerLines = (overrides: Partial<FreeCheckInput>) =>
      freeChecks({ ...input, ...overrides }).filter((one) => one.id === "providers");

    it("fails when a used provider has no key, and links to Settings → Keys & services", () => {
      const result = check(
        { providers: new Map([...ready, ["fal", { name: "fal.ai", ready: false }]]) },
        "providers",
      );
      expect(result).toEqual({
        id: "providers",
        ok: false,
        sentence:
          "fal.ai, the image service, isn't set up on this computer: no key is stored or its program wasn't found.",
        fix: {
          label: "Set it up in Settings → Keys & services",
          href: "/settings?section=providers",
        },
      });
    });

    it("fails on a provider this computer doesn't know at all, one line for each", () => {
      expect(providerLines({ providers: new Map() }).map((one) => one.sentence)).toEqual([
        "openai, the writing service, isn't set up on this computer: no key is stored or its program wasn't found.",
        "elevenlabs, the voice service, isn't set up on this computer: no key is stored or its program wasn't found.",
        "fal, the image service, isn't set up on this computer: no key is stored or its program wasn't found.",
      ]);
    });

    it("fails when a used stage has no provider chosen", () => {
      const none = {
        ...document,
        form: { ...document.form, audio: { ...document.form.audio, provider: "" } },
      };
      expect(check({ document: none }, "providers")).toMatchObject({
        ok: false,
        sentence: "No voice service is chosen, so a run can't start.",
        fix: { label: "Choose one in Narration", href: "/templates/t1?section=voice" },
      });
    });

    it("names every missing thing on its own line, each with its fix, so the count is true", () => {
      const empty = {
        ...document,
        form: {
          ...document.form,
          llm: { provider: "", model: "" },
          images: { provider: "", model: "" },
          audio: { ...document.form.audio, provider: "openai-tts" },
        },
      };
      const lines = providerLines({
        document: empty,
        providers: new Map([...ready, ["openai-tts", { name: "OpenAI", ready: false }]]),
      });
      expect(lines.map((one) => [one.ok, one.sentence, one.fix?.label])).toEqual([
        [false, "No writing service is chosen, so a run can't start.", "Choose one in Article"],
        [false, "No image service is chosen, so a run can't start.", "Choose one in Images"],
        [
          false,
          "OpenAI, the voice service, isn't set up on this computer: no key is stored or its program wasn't found.",
          "Set it up in Settings → Keys & services",
        ],
      ]);
    });

    it("fails when a used service has no model chosen, as the sample refuses it", () => {
      const modelless = {
        ...document,
        form: { ...document.form, images: { provider: "fal", model: "" } },
      };
      expect(providerLines({ document: modelless })).toEqual([
        {
          id: "providers",
          ok: false,
          sentence: "No model is chosen for fal.ai, the image service, so a run can't start.",
          fix: { label: "Choose one in Images", href: "/templates/t1?section=pictures" },
        },
      ]);
    });

    it("reads an unchosen writer and image service as this computer's defaults, as every run does", () => {
      const empty = {
        ...document,
        form: {
          ...document.form,
          llm: { provider: "", model: "" },
          images: { provider: "", model: "" },
        },
      };
      const defaults = {
        llm: { provider: "claude-code", model: "sonnet" },
        images: { provider: "codex-image", model: "gpt-image" },
      };
      const providers = new Map([
        ...ready,
        ["claude-code", { name: "Claude Code CLI", ready: true }],
        ["codex-image", { name: "Codex CLI (images)", ready: true }],
      ]);
      expect(providerLines({ document: empty, defaults, providers })).toEqual([
        { id: "providers", ok: true, sentence: "Every service this template uses is set up." },
      ]);
      expect(
        providerLines({
          document: empty,
          defaults,
          providers: new Map([
            ...ready,
            ["claude-code", { name: "Claude Code CLI", ready: false }],
          ]),
        }).map((one) => one.sentence),
      ).toEqual([
        "Claude Code CLI, the writing service, isn't set up on this computer: no key is stored or its program wasn't found.",
        "codex-image, the image service, isn't set up on this computer: no key is stored or its program wasn't found.",
      ]);
    });

    it("reads an unchosen writer as the default kind by kind, where the images were picked", () => {
      const half = {
        ...document,
        form: { ...document.form, llm: { provider: "", model: "" } },
      };
      expect(
        providerLines({
          document: half,
          defaults: { llm: { provider: "claude-code", model: "sonnet" } },
          providers: new Map([...ready, ["claude-code", { name: "Claude Code CLI", ready: true }]]),
        }),
      ).toEqual([
        { id: "providers", ok: true, sentence: "Every service this template uses is set up." },
      ]);
    });

    it("ignores the provider of a stage that is off or provided", () => {
      const off = {
        ...document,
        form: {
          ...document.form,
          sources: {
            ...document.form.sources,
            audio: "off" as const,
            images: "provide" as const,
            video: "off" as const,
          },
        },
      };
      const providers = new Map([["openai", { name: "OpenAI", ready: true }]]);
      expect(check({ document: off, providers }, "providers")?.ok).toBe(true);
    });

    it("checks the AI checks' service when reviews are on", () => {
      const reviewed = {
        ...document,
        form: {
          ...document.form,
          reviews: {
            provider: "anthropic",
            model: "m",
            retries: "1",
            stages: { article: { mode: "flag" as const, prompt: "" } },
          },
        },
      };
      expect(check({ document: reviewed }, "providers")?.sentence).toContain(
        ", the service for the AI checks,",
      );
    });
  });

  describe("release slots", () => {
    const schedule = {
      id: "s1",
      name: "Weekdays",
      topicKeyword: null,
      runDays: [1, 3],
      releases: [{ day: 1, shorts: 0 }],
    };

    it("fails when a run day has no release time", () => {
      expect(check({ schedules: [schedule] }, "release-slots")).toEqual({
        id: "release-slots",
        ok: false,
        sentence: "Weekdays runs on Wednesday but has no release time for that day.",
        fix: {
          label: "Add the release times in Weekdays",
          href: "/calendar?tab=schedules&schedule=s1",
        },
      });
    });

    it("fails when a run has fewer short release times than the template makes shorts", () => {
      const shorts = {
        ...document,
        form: {
          ...document.form,
          shorts: {
            enabled: true,
            count: "2",
            minSeconds: "60",
            maxSeconds: "120",
            prompt: "",
            imagePrompt: "",
          },
        },
      };
      const result = check(
        {
          document: shorts,
          schedules: [{ ...schedule, runDays: [1], releases: [{ day: 1, shorts: 1 }] }],
        },
        "release-slots",
      );
      expect(result?.sentence).toBe(
        "This template makes 2 shorts a video, but Weekdays gives Monday's run release times for 1.",
      );
    });

    it("passes a schedule that sets no release times", () => {
      expect(check({ schedules: [{ ...schedule, releases: [] }] }, "release-slots")?.ok).toBe(true);
    });
  });

  describe("monthly cost", () => {
    it("states the known monthly cost", () => {
      expect(check({ monthlyCost: { high: 12.5, unknown: 0 } }, "monthly-cost")?.sentence).toBe(
        "Its schedules cost up to about $12.50 a month.",
      );
    });

    it("passes with steps that have no price, naming them as not counted", () => {
      expect(
        check(
          {
            monthlyCost: {
              high: 6.08,
              unknown: 2,
              unpriced: ["Narration descriptions", "Delivery cue overhead"],
              problem: null,
            },
          },
          "monthly-cost",
        ),
      ).toEqual({
        id: "monthly-cost",
        ok: true,
        sentence:
          "Its schedules cost at least $6.08 a month. Not counted, with no known price: Narration descriptions and Delivery cue overhead.",
      });
    });

    it("says why a schedule's run couldn't be priced", () => {
      expect(
        check(
          { monthlyCost: { high: 0, unknown: 1, problem: "Daily's runs couldn't be priced: x." } },
          "monthly-cost",
        )?.sentence,
      ).toBe("Daily's runs couldn't be priced: x.");
    });

    it("says a paused schedule costs nothing now, and what it costs when resumed", () => {
      expect(
        check(
          {
            monthlyCost: { high: 0, unknown: 0, paused: { schedules: 1, runs: 8.7, high: 4.35 } },
          },
          "monthly-cost",
        ),
      ).toMatchObject({
        ok: true,
        sentence:
          "1 paused schedule uses this template: it costs nothing while paused, and up to about $4.35 a month when resumed.",
      });
      expect(
        check(
          {
            monthlyCost: { high: 3, unknown: 0, paused: { schedules: 2, runs: 17.4, high: 8.7 } },
          },
          "monthly-cost",
        )?.sentence,
      ).toBe(
        "Its schedules cost up to about $3.00 a month; 2 paused schedules would add up to about $8.70 a month when resumed.",
      );
    });

    it("names a paused schedule as paused where its release times are missing", () => {
      expect(
        check(
          {
            schedules: [
              {
                id: "s1",
                name: "Weekdays",
                topicKeyword: null,
                runDays: [1, 3],
                releases: [{ day: 1, shorts: 0 }],
                paused: true,
              },
            ],
          },
          "release-slots",
        )?.sentence,
      ).toBe("Weekdays (paused) runs on Wednesday but has no release time for that day.");
    });

    it("never fails on a step with no price: nothing fixes it, so it is counted out loud", () => {
      expect(check({ monthlyCost: { high: 3, unknown: 2 } }, "monthly-cost")).toEqual({
        id: "monthly-cost",
        ok: true,
        sentence:
          "Its schedules cost at least $3.00 a month. 2 steps have no known price and aren't counted.",
      });
    });

    it("doesn't repeat a missing service as an unknown cost: the line waits until it is fixed", () => {
      const unchosen = {
        document: { ...document, form: { ...document.form, images: { provider: "", model: "" } } },
      };
      const unpriced = {
        monthlyCost: { high: 0, unknown: 1, problem: "Daily's runs couldn't be priced: x." },
      };
      expect(check({ ...unchosen, ...unpriced }, "monthly-cost")).toBeUndefined();
      expect(
        freeChecks({ ...input, ...unchosen, ...unpriced }).filter((one) => !one.ok),
      ).toHaveLength(1);
      expect(
        check({ ...unchosen, monthlyCost: { high: 3, unknown: 0 } }, "monthly-cost"),
      ).toMatchObject({ ok: true });
    });
  });

  describe("voice", () => {
    const mine = [{ provider: "elevenlabs", voiceId: "v" }];

    it("passes when the narration's voice is one of your voices", () => {
      expect(check({ voices: mine }, "voice")).toEqual({
        id: "voice",
        ok: true,
        sentence: "The narration's voice is one of your voices.",
      });
    });

    it("asks for a voice when none is chosen", () => {
      const none = {
        ...document,
        form: { ...document.form, audio: { ...document.form.audio, voice: "" } },
      };
      expect(check({ document: none, voices: mine }, "voice")).toEqual({
        id: "voice",
        ok: false,
        sentence: "No voice is chosen for the narration, so a run can't start.",
        fix: { label: "Choose a voice in Narration", href: "/templates/t1?section=voice" },
      });
    });

    it("names a voice that isn't in Settings → Voices, such as one an imported pack brought", () => {
      expect(check({ voices: [{ provider: "elevenlabs", voiceId: "other" }] }, "voice")).toEqual({
        id: "voice",
        ok: false,
        sentence:
          "The narration's voice (ID v) isn't one of your voices in Settings → Voices. Add it there under that ID, or choose one of yours.",
        fix: { label: "Choose a voice in Narration", href: "/templates/t1?section=voice" },
      });
    });

    it("checks each speaker's voice too, and nothing when the narration isn't voiced", () => {
      const speakers = {
        ...document,
        form: {
          ...document.form,
          voices: {
            format: "audiobook" as const,
            speakers: [
              {
                id: "s1",
                name: "Ada",
                role: "narrator" as const,
                voice: { provider: "elevenlabs", model: "m", voice: "gone" },
              },
            ],
          },
        },
      } as unknown as PlayDraftDocument;
      expect(check({ document: speakers, voices: mine }, "voice")?.sentence).toBe(
        "Ada's voice (ID gone) isn't one of your voices in Settings → Voices. Add it there under that ID, or choose one of yours.",
      );
      const silent = {
        ...document,
        form: {
          ...document.form,
          sources: { ...document.form.sources, audio: "off" as const },
          audio: { ...document.form.audio, voice: "" },
        },
      };
      expect(check({ document: silent, voices: [] }, "voice")?.ok).toBe(true);
    });
  });

  describe("answerers", () => {
    const waits = { ...document, form: { ...document.form, checkpoints: ["audio" as const] } };

    it("fails when a checkpoint waits and nobody would hear of it", () => {
      expect(check({ document: waits }, "answerers")).toMatchObject({
        ok: false,
        fix: { href: "/settings?section=notifications" },
      });
    });

    it("passes with a notification address", () => {
      expect(check({ document: waits, notificationUrl: true }, "answerers")?.ok).toBe(true);
    });

    it("passes with an agent seen within 7 days, not one seen before", () => {
      expect(check({ document: waits, agentSeenAt: "2026-10-12T10:00:00Z" }, "answerers")?.ok).toBe(
        true,
      );
      expect(check({ document: waits, agentSeenAt: "2026-10-10T09:00:00Z" }, "answerers")?.ok).toBe(
        false,
      );
    });

    it("asks for an answerer when an agent reviews", () => {
      const agent = {
        ...document,
        form: {
          ...document.form,
          reviews: {
            provider: "",
            model: "",
            reviewer: "agent" as const,
            retries: "1",
            stages: { images: { mode: "redo" as const, prompt: "" } },
          },
        },
      };
      expect(check({ document: agent }, "answerers")?.ok).toBe(false);
      expect(check({ document: agent }, "providers")?.ok).toBe(true);
    });
  });
});
