import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { renderRouted, testDeps } from "@/test-app";
import { ContentSection } from "./content-section";
import { AudioRail } from "./media-rails";
import { freshForm, type PlayFormState } from "./state";

afterEach(cleanup);
it("shows shared text generation for a provided article and preserves preparation while Audio is inactive", async () => {
  const user = userEvent.setup();
  function Subject() {
    const [form, setForm] = useState<PlayFormState>({
      ...freshForm,
      narrationPrompt: "Delivery",
      sources: {
        ...freshForm.sources,
        article: "provide" as const,
        images: "off" as const,
        video: "off" as const,
      },
      provided: { ...freshForm.provided, article: "Exact words." },
    });
    const props = {
      form,
      update: (patch: Partial<typeof form>) => setForm((old) => ({ ...old, ...patch })),
      prompts: [],
      voices: [],
      providers: [],
      silenceGapSeconds: 0,
      problem: () => undefined,
      onPickFiles: () => {},
      onRemoveFile: () => {},
    };
    return (
      <>
        <ContentSection {...props} entries={[]} fields={[]} onLibrary={() => {}} />
        <AudioRail {...props} />
      </>
    );
  }
  renderRouted(<Subject />, testDeps({}));
  await screen.findByLabelText("LLM");
  expect((screen.getByLabelText("Narration Preparation") as HTMLSelectElement).value).toBe(
    "Delivery",
  );
  const audio = screen.getByRole("radiogroup", { name: "audio source" });
  for (const inactive of ["Off", "Provide"]) {
    await user.click(within(audio).getByRole("radio", { name: inactive }));
    expect(screen.queryByLabelText("Narration Preparation")).toBeNull();
    expect(screen.queryByLabelText("LLM")).toBeNull();
    await user.click(within(audio).getByRole("radio", { name: "Generate" }));
    expect((screen.getByLabelText("Narration Preparation") as HTMLSelectElement).value).toBe(
      "Delivery",
    );
    expect(screen.getByLabelText("LLM")).not.toBeNull();
  }
});
