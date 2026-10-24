import { xTierLabels } from "@app/slices/social/model.js";
import type { AiDisclosureSetting } from "@app/slices/studio/disclosure.js";
import { aiDisclosureLabels } from "@app/slices/studio/disclosure.js";
import type { ChannelLink } from "@app/slices/youtube/placeholders.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { readChannelLinks } from "@/api";
import { useApp } from "@/app-context";
import { ColourInput } from "@/components/colour-input";
import { ActionBar, StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Field, Input, Select, Textarea } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { LanguageSelect } from "@/language/language-select";
import { contrastWarning, hexProblem, parseHex } from "@/lib/hex-colour";
import { limitCount } from "@/lib/limit-count";
import { documentThemesQuery, entriesQuery, keys } from "@/queries";
import { fontsKey, listFonts } from "@/subtitles/api";
import { ChannelLinksEditor } from "@/youtube/channel-links";
import { AiDisclosureField } from "./ai-disclosure";
import { ChannelAmbientBed, channelBedForm, channelBedOf } from "./ambient-bed-kit";
import {
  type BrandKit,
  type Channel,
  channelKey,
  channelsKey,
  saveAiDisclosure,
  saveChannel,
} from "./api";
import { BrandPreview } from "./brand-preview";
import { accountCount, PostingBlock, type PostingDraft, postingBlocked } from "./posting-block";

// The ambient sound and the links are not text; `ambient-bed-kit.tsx` and
// `youtube/channel-links.tsx` keep them.
type Draft = Required<{
  readonly [K in Exclude<keyof BrandKit, "ambientBed" | "links">]-?: string;
}>;
const fields: readonly (keyof Draft)[] = [
  "captionFontId",
  "captionColor",
  "captionOutlineColor",
  "titleFontId",
  "titleColor",
  "intro",
  "outro",
  "endScreenText",
  "documentTheme",
  "language",
];

// The server's limit on the series brief (slices/channels/schema.ts), in characters.
const briefMax = 10000;

function draftOf(brand: BrandKit): Draft {
  return Object.fromEntries(fields.map((field) => [field, brand[field] ?? ""])) as Draft;
}

// The Name and look tab: the channel's name, language and series brief first, then its look
// beside a frame drawn with it, its intro, outro, PDF theme and ambient sound, and folded
// below, its named links and how it posts (the YouTube AI disclosure, the X subscription and
// its accounts). Every look field is optional: Not set leaves the template's own setting alone.
// One Save channel saves all of it.
export function BrandTab({ channel }: { readonly channel: Channel }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const fonts = useQuery({ queryKey: fontsKey, queryFn: () => listFonts(api) });
  const entries = useQuery(entriesQuery(api));
  const themes = useQuery(documentThemesQuery(api));
  const [name, setName] = useState(channel.name);
  const [brief, setBrief] = useState(channel.seriesBrief);
  const [kit, setKit] = useState<Draft>(draftOf(channel.brand));
  const [bed, setBed] = useState(channelBedForm(channel.brand));
  const [disclosure, setDisclosure] = useState<AiDisclosureSetting>(channel.aiDisclosure);
  const [posting, setPosting] = useState<PostingDraft>({
    xTier: channel.xTier ?? "free",
    accounts: channel.socialAccounts ?? {},
  });
  const badAccount = postingBlocked(posting);
  const bedSave = channelBedOf(bed);
  // The default channel shows the older Settings list until it saves a list of its own.
  const legacyLinks = useQuery({
    queryKey: keys.channelLinks,
    queryFn: () => readChannelLinks(api),
    enabled: channel.isDefault && channel.brand.links === undefined,
  });
  const [linksDraft, setLinksDraft] = useState<readonly ChannelLink[] | undefined>();
  const links = linksDraft ?? channel.brand.links ?? legacyLinks.data ?? [];
  // Left out while there is nothing to keep, so a channel that never had links saves as before.
  const sendLinks =
    linksDraft !== undefined ||
    channel.brand.links !== undefined ||
    (legacyLinks.data?.length ?? 0) > 0;
  const save = useMutation({
    mutationFn: async () => {
      // The disclosure has a request of its own, sent only when changed. It goes first: it
      // leaves the channel's version alone, so a refusal here saves nothing and the rest
      // can still be saved against the version this form was opened on.
      if (disclosure !== channel.aiDisclosure) await saveAiDisclosure(api, channel.id, disclosure);
      return saveChannel(api, channel.id, {
        name,
        seriesBrief: brief,
        brand: {
          ...Object.fromEntries(
            fields.flatMap((field) =>
              kit[field].trim() === "" ? [] : [[field, sentValue(field, kit[field])]],
            ),
          ),
          ...bedSave.brand,
          ...(sendLinks ? { links } : {}),
        },
        baseVersion: channel.version,
        // Left out while untouched, so a channel saves as it did before posting.
        ...(posting.xTier === (channel.xTier ?? "free") ? {} : { xTier: posting.xTier }),
        ...(JSON.stringify(posting.accounts) === JSON.stringify(channel.socialAccounts ?? {})
          ? {}
          : { socialAccounts: posting.accounts }),
      });
    },
    onSuccess: async (saved) => {
      notify("Channel saved.", "success");
      client.setQueryData(channelKey(saved.id), (current: unknown) =>
        current !== null && typeof current === "object" ? { ...current, channel: saved } : current,
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: channelsKey }),
        // Every project page's placeholders fill from its channel's links.
        client.invalidateQueries({ queryKey: keys.channelLinks }),
      ]);
    },
  });
  const set = (field: keyof Draft) => (value: string) => setKit({ ...kit, [field]: value });
  const badColour = colourFields.some((field) => hexProblem(kit[field]) !== undefined);
  const fontOptions = (fonts.data?.fonts ?? []).map((font) => ({
    value: font.id,
    label: font.name,
  }));
  const entryOptions = (category: "intro" | "outro") =>
    (entries.data?.entries ?? [])
      .filter((entry) => entry.category === category)
      .map((entry) => ({ value: entry.name, label: entry.name }));
  const themeOptions = [
    ...(themes.data?.builtIns ?? []).map((theme) => ({ value: theme.name, label: theme.label })),
    ...(themes.data?.themes ?? []).map((theme) => ({ value: theme.id, label: theme.name })),
  ];
  const accounts = accountCount(posting);
  return (
    <form
      aria-label="Name and look"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="sl-fields">
        <Field label="Channel name">
          <Input
            value={name}
            maxLength={200}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {/* The channel's language applies with the look off too: it is not styling. */}
        <LanguageSelect
          label="Language of new projects"
          tip="planning.channel.language"
          value={kit.language === "" ? undefined : kit.language}
          inherited={{ label: "Not set", language: undefined }}
          onChange={(language) => set("language")(language ?? "")}
        />
        <Field
          label="Series brief"
          className="sl-fields__wide"
          help={`What the channel covers; new topic ideas for its schedules start from it. ${limitCount(brief.length, briefMax, "characters")}.`}
        >
          <Textarea
            rows={3}
            value={brief}
            maxLength={briefMax}
            placeholder="Calm bedtime stories from ancient history, one figure or place each time."
            onChange={(event) => setBrief(event.target.value)}
          />
        </Field>
      </div>
      <section aria-label="Brand kit" className="flex flex-col gap-3 border-t border-line pt-4">
        <SectionHead
          title="Brand kit"
          meta="The look every video of this channel gets wherever its template leaves a setting at its default. Not set leaves the template's own."
          className="mb-0"
        />
        <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
          <div className="sl-fields">
            <Choice
              label="Caption font"
              value={kit.captionFontId}
              options={fontOptions}
              onPick={set("captionFontId")}
            />
            <Colour
              label="Caption colour"
              value={kit.captionColor}
              onChange={set("captionColor")}
            />
            <Colour
              label="Caption outline"
              value={kit.captionOutlineColor}
              onChange={set("captionOutlineColor")}
              contrast={contrastWarning(
                kit.captionColor,
                kit.captionOutlineColor,
                "the caption colour",
                3,
              )}
            />
            <Choice
              label="Title font"
              value={kit.titleFontId}
              options={fontOptions}
              onPick={set("titleFontId")}
            />
            <Colour label="Title colour" value={kit.titleColor} onChange={set("titleColor")} />
            <Field label="End screen text" help="Shown over the last 5 seconds.">
              <Input
                value={kit.endScreenText}
                maxLength={200}
                placeholder="Subscribe for more"
                onChange={(event) => set("endScreenText")(event.target.value)}
              />
            </Field>
          </div>
          <BrandPreview
            captionFontId={kit.captionFontId}
            titleFontId={kit.titleFontId}
            captionColor={kit.captionColor}
            captionOutlineColor={kit.captionOutlineColor}
            titleColor={kit.titleColor}
            endScreenText={kit.endScreenText}
          />
        </div>
        <div className="sl-fields">
          <Choice
            label="Intro"
            help="Narrated before each video: one voice request."
            value={kit.intro}
            options={entryOptions("intro")}
            onPick={set("intro")}
          />
          <Choice
            label="Outro"
            help="Narrated after each video: one voice request."
            value={kit.outro}
            options={entryOptions("outro")}
            onPick={set("outro")}
          />
          <Choice
            label="PDF theme"
            help="For videos that also make a PDF."
            value={kit.documentTheme}
            options={themeOptions}
            onPick={set("documentTheme")}
          />
        </div>
        <ChannelAmbientBed value={bed} onChange={setBed} />
      </section>
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <Fold
          summary="Channel links"
          state={
            links.length === 0
              ? "None yet"
              : `${String(links.length)} ${links.length === 1 ? "link" : "links"}`
          }
          remember="channel.links"
        >
          <div className="pt-3 pb-2">
            <ChannelLinksEditor rows={links} onChange={setLinksDraft} />
          </div>
        </Fold>
        <Fold
          summary="Posting"
          state={`AI disclosure ${aiDisclosureLabels[disclosure]} · X ${xTierLabels[posting.xTier]} · ${
            accounts === 0
              ? "no accounts"
              : `${String(accounts)} ${accounts === 1 ? "account" : "accounts"}`
          }`}
          remember="channel.posting"
        >
          <div className="flex flex-col gap-4 pt-3 pb-2">
            <div className="max-w-[360px]">
              <AiDisclosureField value={disclosure} onChange={setDisclosure} />
            </div>
            <PostingBlock value={posting} onChange={setPosting} />
          </div>
        </Fold>
      </div>
      <ActionBar
        status={
          <StatusSlot tone={save.error ? "error" : "info"}>
            {save.error?.message ?? (save.isPending ? "Saving…" : undefined)}
          </StatusSlot>
        }
      >
        <Button
          type="submit"
          variant="primary"
          disabled={
            save.isPending || name.trim() === "" || bedSave.blocked || badColour || badAccount
          }
          disabledReason={
            name.trim() === ""
              ? "Give the channel a name"
              : badColour
                ? "Fix the colour marked above"
                : badAccount
                  ? "Fix the account name marked under Posting"
                  : "Fix the ambient sound settings above"
          }
        >
          Save channel
        </Button>
      </ActionBar>
    </form>
  );
}

function Choice({
  label,
  help,
  value,
  options,
  onPick,
}: {
  readonly label: string;
  readonly help?: string;
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onPick: (value: string) => void;
}): ReactElement {
  return (
    <Field label={label} {...(help === undefined ? {} : { help })}>
      <Select value={value} onChange={(event) => onPick(event.target.value)}>
        <option value="">Not set</option>
        {value !== "" && !options.some((option) => option.value === value) ? (
          <option value={value}>{value} (no longer in the library)</option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

// A colour field: 3 or 6 hex digits, with or without #, saved as #RRGGBB; blank is Not set,
// which a colour input cannot say, so the box reads "Not set" while empty. `contrast` warns
// when the colour is hard to read on the one it is drawn against.
function Colour({
  label,
  value,
  onChange,
  contrast,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly contrast?: string | undefined;
}): ReactElement {
  const problem = hexProblem(value);
  return (
    <Field
      label={label}
      {...(problem === undefined ? {} : { error: problem })}
      {...(problem === undefined && contrast !== undefined ? { help: contrast } : {})}
    >
      <ColourInput
        value={value}
        placeholder="Not set"
        maxLength={7}
        pickerLabel={`${label} picker`}
        onChange={onChange}
      />
    </Field>
  );
}

const colourFields = ["captionColor", "captionOutlineColor", "titleColor"] as const;

// What Save sends for a kit field: a colour in the server's #RRGGBB, anything else trimmed.
function sentValue(field: keyof Draft, value: string): string {
  const trimmed = value.trim();
  if (!(colourFields as readonly string[]).includes(field)) return trimmed;
  return parseHex(trimmed)?.toUpperCase() ?? trimmed;
}
