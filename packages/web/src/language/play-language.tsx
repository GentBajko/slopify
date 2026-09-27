import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { channelsQuery } from "@/channels/api";
import { useDraftChannelId } from "@/play/channel-picker";
import { usePlaySession } from "@/play/draft-context";
import { LanguageSelect } from "./language-select";

// The language the draft will run in, as the server reads it (`brandedForm`): the one picked
// on Play, else its channel's, else English.
export function useDraftLanguage(): string {
  const { api } = useApp();
  const { document } = usePlaySession();
  const channels = useQuery(channelsQuery(api));
  const channelId = useDraftChannelId();
  const channel = channels.data?.find((one) => one.id === channelId);
  return document.form.language ?? channel?.brand.language ?? "en";
}

// Play's language control: an edit of the draft, then the review is out of date.
export function PlayLanguage({ disabled = false }: { readonly disabled?: boolean }): ReactElement {
  const { api } = useApp();
  const session = usePlaySession();
  const channels = useQuery(channelsQuery(api));
  const channelId = useDraftChannelId();
  const channel = channels.data?.find((one) => one.id === channelId);
  const { document } = session;
  return (
    <div>
      <LanguageSelect
        value={document.form.language}
        inherited={{ label: "Channel's language", language: channel?.brand.language }}
        disabled={disabled}
        onChange={(language) => {
          const { language: _previous, ...form } = document.form;
          session.edit({
            ...document,
            form: language === undefined ? form : { ...form, language },
          });
          session.invalidateReview(true);
        }}
      />
    </div>
  );
}
