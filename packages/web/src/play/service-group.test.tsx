import type { ProviderStatus, Voice } from "@app/slices/settings/model.js";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { modelStatusWords } from "./model-picker";
import { ServiceGroup } from "./service-group";
import { VoicePicker } from "./voice-picker";

afterEach(cleanup);

const keyed = (id: ProviderStatus["id"], displayName: string, hasKey: boolean): ProviderStatus => ({
  id,
  family: "tts",
  displayName,
  readiness: { kind: "keyed", hasKey },
});

function Group({
  providers,
  provider: initial = "",
  onLeave = () => {},
  fillModel = false,
}: {
  readonly providers: readonly ProviderStatus[];
  readonly provider?: string;
  readonly onLeave?: () => void;
  readonly fillModel?: boolean;
}) {
  const [provider, setProvider] = useState(initial);
  const [model, setModel] = useState("");
  return (
    <ServiceGroup
      family="tts"
      providers={providers}
      provider={provider}
      model={model}
      serviceField="audio.provider"
      modelField="audio.model"
      serviceProblem={undefined}
      modelProblem={undefined}
      leaveOut={{ label: "Set Narration to Off", onLeave }}
      fillModel={fillModel}
      onService={(next) => {
        setProvider(next);
        setModel("");
      }}
      onModel={setModel}
    />
  );
}

const view = (standing: string, checkedAt: string | null = null) => ({
  standing,
  checkedAt,
  sentence: null,
  source: "check",
});

describe("who does a stage", () => {
  it("names the group and its two selects, and greys a service that can't be used", async () => {
    renderRouted(
      <Group
        providers={[keyed("openai-tts", "OpenAI", true), keyed("cartesia", "Cartesia", false)]}
      />,
      testDeps({}),
    );
    const group = await screen.findByRole("group", { name: "Read by" });
    const service = within(group).getByRole<HTMLSelectElement>("combobox", {
      name: "Read by Service",
    });
    expect(
      within(service).getByRole<HTMLOptionElement>("option", { name: "Cartesia · No key" })
        .disabled,
    ).toBe(true);
    expect(
      within(group).getByRole<HTMLSelectElement>("combobox", { name: "Read by Model" }).disabled,
    ).toBe(true);
    expect(within(group).getByRole("option", { name: "Pick a service first" })).not.toBeNull();
    // Some service works, so there is nothing to fix.
    expect(screen.queryByText(/None of these has a key yet/)).toBeNull();
  });

  it("says when no service has a key, with the way to add one and the way to leave the stage out", async () => {
    const onLeave = vi.fn();
    renderRouted(
      <Group
        providers={[keyed("openai-tts", "OpenAI", false), keyed("cartesia", "Cartesia", false)]}
        onLeave={onLeave}
      />,
      testDeps({}),
    );
    expect(await screen.findByText(/None of these has a key yet/)).not.toBeNull();
    const add = screen.getByRole("link", { name: "Add a voice key ↗" });
    const href = new URL(add.getAttribute("href") ?? "", "http://slopify.test");
    expect(href.pathname).toBe("/settings");
    expect(href.searchParams.get("section")).toBe("providers");
    expect(href.searchParams.get("family")).toBe("tts");
    await userEvent.click(screen.getByRole("button", { name: "Set Narration to Off" }));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it("says when the picked service can't be used, with the way to add its key", async () => {
    renderRouted(
      <Group
        providers={[keyed("openai-tts", "OpenAI", false), keyed("cartesia", "Cartesia", true)]}
        provider="openai-tts"
      />,
      testDeps({}),
    );
    expect(await screen.findByText(/OpenAI has no key yet/)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Add a voice key ↗" })).not.toBeNull();
    // Another service works, so the stage need not be left out.
    expect(screen.queryByRole("button", { name: "Set Narration to Off" })).toBeNull();
  });

  it("says under the model whether it works, and links to Settings → Models for the rest", async () => {
    renderRouted(
      <Group providers={[keyed("openai-tts", "OpenAI", true)]} provider="openai-tts" />,
      testDeps({
        "GET /api/providers/openai-tts/models": jsonAnswer({
          models: [
            { id: "mini", name: "Mini" },
            { id: "big", name: "Big" },
            { id: "old", name: "Old" },
          ],
          allowsCustom: true,
          standings: {
            mini: view("works", "2026-10-24T07:00:00.000Z"),
            big: view("works"),
            old: view("known"),
          },
        }),
      }),
    );
    const model = await screen.findByRole<HTMLSelectElement>("combobox", { name: "Read by Model" });
    await within(model).findByRole("option", { name: "Mini" });
    // No upkeep buttons on Create: the list's own last entries show more or take an id.
    for (const name of [/Refresh/, /Custom ID/, /^Check/, /^Show all/])
      expect(screen.queryByRole("button", { name })).toBeNull();
    expect(within(model).queryByRole("option", { name: "Old" })).toBeNull();
    await userEvent.selectOptions(model, "mini");
    expect(screen.getByText(/^Works · checked/)).not.toBeNull();
    const manage = screen.getByRole("link", { name: "Manage models ↗" });
    expect(manage.getAttribute("href")).toBe("/settings?section=models");
    await userEvent.selectOptions(model, "::show-all");
    expect(within(model).getByRole("option", { name: "Old" })).not.toBeNull();
    expect(model.value).toBe("mini");
    await userEvent.selectOptions(model, "::type-id");
    const typed = screen.getByRole<HTMLInputElement>("textbox", { name: "Read by Model" });
    expect(typed.value).toBe("mini");
    await userEvent.click(screen.getByRole("button", { name: "Pick from the list" }));
    expect(screen.getByRole("combobox", { name: "Read by Model" })).not.toBeNull();
  });

  it("on Create, a service picked takes the model Slopify would pick for it", async () => {
    renderRouted(
      <Group providers={[keyed("openai-tts", "OpenAI", true)]} fillModel />,
      testDeps({
        "GET /api/providers/openai-tts/models": jsonAnswer({
          models: [
            { id: "tts-1", name: "TTS 1" },
            { id: "gpt-4o-mini-tts", name: "GPT-4o mini TTS" },
          ],
          allowsCustom: true,
        }),
      }),
    );
    const service = await screen.findByRole("combobox", { name: "Read by Service" });
    await userEvent.selectOptions(service, "openai-tts");
    const model = screen.getByRole<HTMLSelectElement>("combobox", { name: "Read by Model" });
    await vi.waitFor(() => expect(model.value).toBe("gpt-4o-mini-tts"));
  });

  it("elsewhere, a service picked leaves the model to the person", async () => {
    renderRouted(
      <Group providers={[keyed("openai-tts", "OpenAI", true)]} />,
      testDeps({
        "GET /api/providers/openai-tts/models": jsonAnswer({
          models: [{ id: "gpt-4o-mini-tts", name: "GPT-4o mini TTS" }],
          allowsCustom: true,
        }),
      }),
    );
    const service = await screen.findByRole("combobox", { name: "Read by Service" });
    await userEvent.selectOptions(service, "openai-tts");
    const model = screen.getByRole<HTMLSelectElement>("combobox", { name: "Read by Model" });
    await within(model).findByRole("option", { name: "GPT-4o mini TTS" });
    expect(model.value).toBe("");
  });
});

describe("the model's state in words", () => {
  const now = new Date("2026-10-24T08:00:00.000Z");
  it("drops the badge's sign and starts with a capital", () => {
    expect(
      modelStatusWords(
        {
          standing: "works",
          checkedAt: "2026-10-24T07:42:00.000Z",
          sentence: null,
          source: "check",
        } as never,
        false,
        now,
      ),
    ).toBe("Works · checked 18 min ago");
    expect(modelStatusWords(undefined, true, now)).toBe("Not checked yet");
    expect(
      modelStatusWords(
        { standing: "no-access", checkedAt: null, sentence: null, source: "check" } as never,
        false,
        now,
      ),
    ).toBe("Not on your plan");
  });
});

describe("who reads", () => {
  const voices: readonly Voice[] = [
    { id: "v1", provider: "openai-tts", name: "Alloy", voiceId: "alloy" },
  ];
  const providers = [keyed("openai-tts", "OpenAI", true), keyed("cartesia", "Cartesia", true)];
  function Voices({ provider }: { readonly provider: string }) {
    return (
      <VoicePicker
        field="audio.voice"
        provider={provider}
        providers={providers}
        voices={voices}
        language={undefined}
        value=""
        problem={undefined}
        onPick={() => {}}
      />
    );
  }

  it("asks for the voice service first, and draws the select greyed until then", async () => {
    renderRouted(<Voices provider="" />, testDeps({}));
    const select = await screen.findByRole<HTMLSelectElement>("combobox", { name: "Voice" });
    expect(select.disabled).toBe(true);
    expect(
      within(select).getByRole("option", { name: "Pick a voice service first" }),
    ).not.toBeNull();
  });

  it("lists the service's voices once it is picked", async () => {
    renderRouted(<Voices provider="openai-tts" />, testDeps({}));
    const select = await screen.findByRole("combobox", { name: "Voice" });
    expect(within(select).getByRole("option", { name: "Pick a voice" })).not.toBeNull();
    expect(within(select).getByRole("option", { name: "Alloy" })).not.toBeNull();
    expect(screen.queryByRole("link", { name: /Add a voice/ })).toBeNull();
  });

  it("says a service has no voices yet, and links to adding one for it", async () => {
    renderRouted(<Voices provider="cartesia" />, testDeps({}));
    const select = await screen.findByRole("combobox", { name: "Voice" });
    expect(
      within(select).getByRole("option", { name: "No voices for Cartesia yet" }),
    ).not.toBeNull();
    const add = screen.getByRole("link", { name: "Add a voice for Cartesia ↗" });
    const href = new URL(add.getAttribute("href") ?? "", "http://slopify.test");
    expect(href.searchParams.get("section")).toBe("voices");
    expect(href.searchParams.get("provider")).toBe("cartesia");
  });
});
