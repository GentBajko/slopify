import type { VoiceChoice } from "@app/slices/admission/model.js";
import type { RevisionEdit } from "@app/slices/revisions/model.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { revisionView } from "@/project/revision-fixture";
import { formOfRevision } from "@/project/revision-form-state";
import { RevisionProviders } from "@/project/revision-providers";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { ContentSection } from "./content-section";
import { AudioRail } from "./media-rails";
import { PronunciationGlossary } from "./pronunciation-glossary";
import { freshForm, type PlayFormState } from "./state";

afterEach(cleanup);

const providers: readonly ProviderStatus[] = [
  {
    id: "inworld",
    family: "tts",
    displayName: "Inworld",
    readiness: { kind: "keyed", hasKey: true },
  },
  {
    id: "cartesia",
    family: "tts",
    displayName: "Cartesia",
    readiness: { kind: "keyed", hasKey: true },
  },
];

function deps() {
  return testDeps({
    "GET /api/providers/inworld/models": jsonAnswer({
      models: [
        { id: "inworld-tts-2", name: "TTS-2" },
        { id: "inworld-tts-2-flash", name: "TTS-2 Flash" },
        { id: "unsupported-model", name: "Unsupported model" },
      ],
      allowsCustom: true,
    }),
    "GET /api/providers/cartesia/models": jsonAnswer({
      models: [{ id: "sonic-3.5", name: "Sonic 3.5" }],
      allowsCustom: true,
    }),
  });
}

function audioFor(preference: boolean | undefined): VoiceChoice {
  return {
    provider: "inworld",
    model: "inworld-tts-2",
    voice: "v",
    ...(preference === undefined ? {} : { usePronunciationGlossary: preference }),
  };
}

function PlaySubject({
  preference,
  preparation = "",
}: {
  readonly preference: boolean | undefined;
  readonly preparation?: string;
}): ReactElement {
  const [form, setForm] = useState<PlayFormState>({
    ...freshForm,
    sources: { ...freshForm.sources, article: "provide", images: "off", video: "off" },
    narrationPrompt: preparation,
    audio: audioFor(preference),
    provided: { ...freshForm.provided, article: "Arda." },
  });
  const props = {
    form,
    update: (patch: Partial<PlayFormState>) => setForm((previous) => ({ ...previous, ...patch })),
    providers,
    prompts: [
      {
        id: "delivery",
        kind: "narration" as const,
        name: "Delivery",
        body: "Calm delivery.",
        slots: [],
        updatedAt: "2026-09-25T00:00:00.000Z",
      },
    ],
    voices: [],
    silenceGapSeconds: 0,
    problem: () => undefined,
    onPickFiles: () => {},
    onRemoveFile: () => {},
  };
  return (
    <>
      <ContentSection {...props} entries={[]} fields={[]} onLibrary={() => {}} />
      <AudioRail {...props} />
      <output aria-label="Saved audio">{JSON.stringify(form.audio)}</output>
    </>
  );
}

function ProjectSubject({
  preference,
}: {
  readonly preference: boolean | undefined;
}): ReactElement {
  const initial = formOfRevision(revisionView());
  const [edit, setEdit] = useState<RevisionEdit>({
    ...initial,
    config: {
      ...initial.config,
      sources: { ...initial.config.sources, audio: "generate" as const },
      audio: audioFor(preference),
    },
  });
  return (
    <>
      <RevisionProviders edit={edit} providers={providers} voices={[]} onChange={setEdit} />
      <output aria-label="Saved audio">{JSON.stringify(edit.config.audio)}</output>
    </>
  );
}

const surfaces = [
  { name: "Play", Subject: PlaySubject, providerLabel: "TTS", modelLabel: "TTS model" },
  {
    name: "Project",
    Subject: ProjectSubject,
    providerLabel: "Narration provider",
    modelLabel: "Narration model",
  },
] as const;

it("uses an explicitly typed native checkbox with an associated label and help", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<PronunciationGlossary value={undefined} supported onChange={onChange} />);
  const input = screen.getByRole<HTMLInputElement>("checkbox", {
    name: "Use Pronunciation Glossary",
  });
  expect(input.tagName).toBe("INPUT");
  expect(input.type).toBe("checkbox");
  expect(input.checked).toBe(false);
  expect(input.getAttribute("data-play-field")).toBe("audio.usePronunciationGlossary");
  const helpId = input.getAttribute("aria-describedby");
  if (helpId === null) throw new Error("Missing checkbox description");
  expect(document.getElementById(helpId)?.textContent).toContain("Arda: /ˈɑɹdə/");
  await user.tab();
  expect(document.activeElement).toBe(input);
  await user.keyboard(" ");
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(true);
});

for (const surface of surfaces) {
  const { Subject } = surface;
  it.each([undefined, false, true])(
    `${surface.name} preserves preference %s through unsupported models and provider changes`,
    async (preference) => {
      const user = userEvent.setup();
      renderRouted(<Subject preference={preference} />, deps());
      const checkbox = await screen.findByRole<HTMLInputElement>("checkbox", {
        name: "Use Pronunciation Glossary",
      });
      expect(checkbox.checked).toBe(preference === true);
      expect(checkbox.disabled).toBe(false);
      expect(screen.getByLabelText("Saved audio").textContent).toBe(
        JSON.stringify(audioFor(preference)),
      );
      const model = screen.getByRole<HTMLSelectElement>("combobox", { name: surface.modelLabel });
      await within(model).findByRole("option", { name: "Unsupported model" });
      await user.selectOptions(model, "unsupported-model");
      expect(checkbox.disabled).toBe(true);
      expect(checkbox.checked).toBe(preference === true);
      await user.click(checkbox);
      expect(screen.getByLabelText("Saved audio").textContent).toBe(
        JSON.stringify({ ...audioFor(preference), model: "unsupported-model" }),
      );
      expect(screen.getByText(/Your saved preference is retained/)).not.toBeNull();
      await user.selectOptions(
        screen.getByRole("combobox", { name: surface.providerLabel }),
        "cartesia",
      );
      const otherModel = screen.getByRole("combobox", { name: surface.modelLabel });
      await within(otherModel).findByRole("option", { name: "Sonic 3.5" });
      await user.selectOptions(otherModel, "sonic-3.5");
      expect(checkbox.disabled).toBe(true);
      expect(screen.getByLabelText("Saved audio").textContent).toBe(
        JSON.stringify({
          ...audioFor(preference),
          provider: "cartesia",
          model: "sonic-3.5",
          voice: "",
        }),
      );
      await user.selectOptions(
        screen.getByRole("combobox", { name: surface.providerLabel }),
        "inworld",
      );
      const returnedModel = screen.getByRole("combobox", { name: surface.modelLabel });
      await within(returnedModel).findByRole("option", { name: "TTS-2 Flash" });
      await user.selectOptions(returnedModel, "inworld-tts-2-flash");
      expect(checkbox.disabled).toBe(false);
      expect(checkbox.checked).toBe(preference === true);
      expect(screen.getByLabelText("Saved audio").textContent).toBe(
        JSON.stringify({ ...audioFor(preference), model: "inworld-tts-2-flash", voice: "" }),
      );
      await user.click(checkbox);
      expect(checkbox.checked).toBe(preference !== true);
      expect(screen.getByLabelText("Saved audio").textContent).toBe(
        JSON.stringify({
          ...audioFor(preference),
          model: "inworld-tts-2-flash",
          voice: "",
          usePronunciationGlossary: preference !== true,
        }),
      );
      await user.click(checkbox);
      expect(checkbox.checked).toBe(preference === true);
      expect(screen.getByLabelText("Saved audio").textContent).toBe(
        JSON.stringify({
          ...audioFor(preference),
          model: "inworld-tts-2-flash",
          voice: "",
          usePronunciationGlossary: preference === true,
        }),
      );
      expect(screen.queryByRole("combobox", { name: "LLM" })).toBeNull();
      expect(screen.queryByRole("combobox", { name: "Text provider" })).toBeNull();
      if (surface.name === "Play") {
        expect(
          screen.getByRole<HTMLSelectElement>("combobox", { name: "Narration Preparation" }).value,
        ).toBe("");
      }
    },
  );
}

it("changes pronunciation and Narration Preparation independently", async () => {
  const user = userEvent.setup();
  renderRouted(<PlaySubject preference={false} preparation="Delivery" />, deps());
  const checkbox = await screen.findByRole<HTMLInputElement>("checkbox", {
    name: "Use Pronunciation Glossary",
  });
  const preparation = screen.getByRole<HTMLSelectElement>("combobox", {
    name: "Narration Preparation",
  });
  await user.click(checkbox);
  expect(checkbox.checked).toBe(true);
  expect(preparation.value).toBe("Delivery");
  await user.selectOptions(preparation, "");
  expect(checkbox.checked).toBe(true);
  expect(screen.queryByRole("combobox", { name: "LLM" })).toBeNull();
  await user.selectOptions(preparation, "Delivery");
  await user.click(checkbox);
  expect(checkbox.checked).toBe(false);
  expect(preparation.value).toBe("Delivery");
  expect(screen.getByRole("combobox", { name: "LLM" })).not.toBeNull();
});

it("retains Play's preference when Audio is Off or Provide and restores it on Generate", async () => {
  const user = userEvent.setup();
  renderRouted(<PlaySubject preference={true} />, deps());
  await screen.findByRole("checkbox", { name: "Use Pronunciation Glossary" });
  const sources = screen.getByRole("radiogroup", { name: "audio source" });
  for (const source of ["Off", "Provide"]) {
    await user.click(within(sources).getByRole("radio", { name: source }));
    expect(screen.queryByRole("checkbox", { name: "Use Pronunciation Glossary" })).toBeNull();
    expect(screen.getByLabelText("Saved audio").textContent).toBe(JSON.stringify(audioFor(true)));
    await user.click(within(sources).getByRole("radio", { name: "Generate" }));
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Use Pronunciation Glossary" })
        .checked,
    ).toBe(true);
  }
});
