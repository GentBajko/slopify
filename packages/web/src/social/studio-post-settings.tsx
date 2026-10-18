import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { type SocialSettings, socialPlatforms } from "@app/slices/social/model.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { promptsQuery } from "@/queries";
import { PostSettings } from "./post-settings";

// How many shorts a draft makes, for the post's video picker; three when shorts are off.
export function shortsOf(
  shorts:
    | { readonly enabled?: boolean | undefined; readonly count?: string | undefined }
    | undefined,
): number {
  const count = Number(shorts?.count ?? "");
  return shorts?.enabled === true && Number.isInteger(count) && count > 0 ? count : 3;
}

type FormSocial = PlayDraftDocument["form"]["social"];

// The draft keeps plain arrays; the model's are read-only.
export function formSocial(settings: SocialSettings | undefined): FormSocial {
  if (settings === undefined) return undefined;
  const form: NonNullable<FormSocial> = {};
  for (const platform of socialPlatforms) {
    const choice = settings[platform];
    if (choice === undefined) continue;
    const { designs, ...media } = choice.media;
    form[platform] = {
      ...choice,
      media: designs === undefined ? media : { ...media, designs: [...designs] },
    };
  }
  return form;
}

// The posting settings of a draft, with the Library's post prompts to pick from: Template
// Studio's Upload pack shows each site's text and main media (`compact`), Fine-tune and Play
// show them all.
export function StudioPostSettings({
  form,
  onChange,
  compact = true,
}: {
  readonly form: PlayDraftDocument["form"];
  readonly onChange: (social: FormSocial) => void;
  readonly compact?: boolean;
}): ReactElement {
  const { api } = useApp();
  const prompts = useQuery(promptsQuery(api));
  return (
    <PostSettings
      value={form.social}
      onChange={(next) => onChange(formSocial(next))}
      prompts={prompts.data?.prompts ?? []}
      shorts={shortsOf(form.shorts)}
      compact={compact}
    />
  );
}
