import {
  type AiDisclosureSetting,
  aiDisclosureLabels,
  aiDisclosureSettings,
} from "@app/slices/studio/disclosure.js";
import type { ReactElement } from "react";
import { Field, Select } from "@/components/kit/field";

const options = aiDisclosureSettings.map((value) => ({
  value,
  label: aiDisclosureLabels[value],
}));

// The channel's answer to YouTube Studio's "AI use" question, which Copy for YouTube Studio and
// the Studio extension give for every video and short. Part of the Brand form under Posting,
// saved by its Save channel like everything else there.
export function AiDisclosureField({
  value,
  onChange,
}: {
  readonly value: AiDisclosureSetting;
  readonly onChange: (value: AiDisclosureSetting) => void;
}): ReactElement {
  return (
    <Field
      label="YouTube AI disclosure"
      tip="planning.channel.ai-disclosure"
      help="YouTube asks this on every upload; Automatic answers it for you."
    >
      <Select
        value={value}
        options={options}
        onChange={(event) => {
          const picked = aiDisclosureSettings.find((one) => one === event.currentTarget.value);
          if (picked !== undefined) onChange(picked);
        }}
      />
    </Field>
  );
}
