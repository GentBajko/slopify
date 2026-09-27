import {
  type AiDisclosureSetting,
  aiDisclosureLabels,
  aiDisclosureSettings,
} from "@app/slices/studio/disclosure.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Field, Select } from "@/components/kit/field";
import { useToast } from "@/components/kit/toast";
import { type Channel, channelKey, channelsKey, saveAiDisclosure } from "./api";

const options = aiDisclosureSettings.map((value) => ({
  value,
  label: aiDisclosureLabels[value],
}));

// The channel's answer to YouTube Studio's "AI use" question, which
// Prepare upload and the Studio extension give for every video and short. It saves as soon as
// it is picked, apart from the Brand form and its Save button.
export function AiDisclosureSettingField({ channel }: { readonly channel: Channel }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const save = useMutation({
    mutationFn: (value: AiDisclosureSetting) => saveAiDisclosure(api, channel.id, value),
    onSuccess: async (saved) => {
      notify(`YouTube AI disclosure set to ${aiDisclosureLabels[saved.aiDisclosure]}.`, "success");
      client.setQueryData(channelKey(saved.id), (current: unknown) =>
        current !== null && typeof current === "object" && "channel" in current
          ? {
              ...current,
              channel: { ...(current.channel as Channel), aiDisclosure: saved.aiDisclosure },
            }
          : current,
      );
      await client.invalidateQueries({ queryKey: channelsKey, exact: true });
    },
  });
  return (
    <section
      aria-label="YouTube AI disclosure"
      className="mb-6 max-w-3xl border-b border-line pb-5"
    >
      <Field
        label="YouTube AI disclosure"
        tip="planning.channel.ai-disclosure"
        help="Mark voices in Settings → Voices and Image prompts in Library → Prompts."
      >
        <Select
          value={save.isPending ? save.variables : channel.aiDisclosure}
          options={options}
          disabled={save.isPending}
          onChange={(event) => {
            const value = aiDisclosureSettings.find((one) => one === event.currentTarget.value);
            if (value !== undefined) save.mutate(value);
          }}
          className="max-w-[260px]"
        />
      </Field>
      <StatusSlot tone="error">
        {save.error ? `Couldn't save the YouTube AI disclosure: ${save.error.message}` : undefined}
      </StatusSlot>
    </section>
  );
}
