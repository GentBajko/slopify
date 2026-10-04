import type { ChannelLink } from "@app/slices/youtube/placeholders.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { readChannelLinks } from "@/api";
import { useApp } from "@/app-context";
import { ColourInput } from "@/components/colour-input";
import { ActionBar, StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Field, Input, Select, Textarea } from "@/components/kit/field";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import type { HelpId } from "@/help/catalog";
import { LanguageSelect } from "@/language/language-select";
import { contrastWarning, hexProblem, parseHex } from "@/lib/hex-colour";
import { limitCount } from "@/lib/limit-count";
import { documentThemesQuery, entriesQuery, keys } from "@/queries";
import { fontsKey, listFonts } from "@/subtitles/api";
import { ChannelLinksEditor } from "@/youtube/channel-links";
import { ChannelAmbientBed, channelBedForm, channelBedOf } from "./ambient-bed-kit";
import { type BrandKit, type Channel, channelKey, channelsKey, saveChannel } from "./api";

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

// The Brand tab: the channel's name, series brief and brand kit. Every kit field is optional;
// a blank one leaves the template's own setting alone.
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
    mutationFn: () =>
      saveChannel(api, channel.id, {
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
      }),
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
  return (
    <form
      aria-label="Brand kit"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid max-w-3xl grid-cols-1 gap-5">
        <Field label="Channel name" tip="planning.channel.name">
          <Input
            value={name}
            maxLength={200}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field
          label="Series brief"
          tip="planning.channel.brief"
          help={`Topic generation reads it for this channel's schedules. ${limitCount(brief.length, briefMax, "characters")}.`}
        >
          <Textarea
            rows={4}
            value={brief}
            maxLength={briefMax}
            onChange={(event) => setBrief(event.target.value)}
          />
        </Field>
        <SectionHead
          title="Brand kit"
          meta="Fills what a template leaves at its default. Blank fields add nothing."
          info="planning.channel.brand-kit"
          className="mt-2 border-t border-line pt-6"
        />
        <section aria-label="Language" className="max-w-md">
          {/* The channel's language applies with the brand kit off too: it is not styling. */}
          <LanguageSelect
            label="Language of new projects"
            tip="planning.channel.language"
            value={kit.language === "" ? undefined : kit.language}
            inherited={{ label: "Not set", language: undefined }}
            onChange={(language) => set("language")(language ?? "")}
          />
        </section>
        <section aria-label="Captions" className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-3">
          <Choice
            label="Caption font"
            tip="planning.channel.brand.caption-font"
            value={kit.captionFontId}
            options={fontOptions}
            onPick={set("captionFontId")}
          />
          <Colour
            label="Caption colour"
            tip="planning.channel.brand.caption-colour"
            value={kit.captionColor}
            onChange={set("captionColor")}
          />
          <Colour
            label="Caption outline"
            tip="planning.channel.brand.caption-outline"
            value={kit.captionOutlineColor}
            onChange={set("captionOutlineColor")}
            contrast={contrastWarning(
              kit.captionColor,
              kit.captionOutlineColor,
              "the caption colour",
              3,
            )}
          />
        </section>
        <section
          aria-label="Chapter cards and end screen"
          className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-3"
        >
          <Choice
            label="Title font"
            tip="planning.channel.brand.font"
            value={kit.titleFontId}
            options={fontOptions}
            onPick={set("titleFontId")}
          />
          <Colour
            label="Title colour"
            tip="planning.channel.brand.title-colour"
            value={kit.titleColor}
            onChange={set("titleColor")}
          />
          <Field
            label="End screen text"
            tip="planning.channel.brand.end-screen"
            help="Shown over the last 5 seconds."
          >
            <Input
              value={kit.endScreenText}
              maxLength={200}
              placeholder="Subscribe for more"
              onChange={(event) => set("endScreenText")(event.target.value)}
            />
          </Field>
        </section>
        <section
          aria-label="Intro, outro and document"
          className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-3"
        >
          <Choice
            label="Intro"
            tip="planning.channel.brand.intro"
            value={kit.intro}
            options={entryOptions("intro")}
            onPick={set("intro")}
          />
          <Choice
            label="Outro"
            tip="planning.channel.brand.outro"
            value={kit.outro}
            options={entryOptions("outro")}
            onPick={set("outro")}
          />
          <Choice
            label="PDF theme"
            tip="planning.channel.brand.document-theme"
            value={kit.documentTheme}
            options={themeOptions}
            onPick={set("documentTheme")}
          />
        </section>
        <ChannelAmbientBed value={bed} onChange={setBed} />
        <div className="border-t border-line pt-6">
          <ChannelLinksEditor rows={links} onChange={setLinksDraft} />
        </div>
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
          disabled={save.isPending || name.trim() === "" || bedSave.blocked || badColour}
          disabledReason={
            name.trim() === ""
              ? "Give the channel a name"
              : badColour
                ? "Fix the colour marked above"
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
  tip,
  value,
  options,
  onPick,
}: {
  readonly label: string;
  readonly tip: HelpId;
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onPick: (value: string) => void;
}): ReactElement {
  return (
    <Field label={label} tip={tip}>
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

// A colour field: 3 or 6 hex digits, with or without #, saved as #RRGGBB; blank is "not set",
// which a colour input cannot say. `contrast` warns when the colour is hard to read on the one
// it is drawn against.
function Colour({
  label,
  tip,
  value,
  onChange,
  contrast,
}: {
  readonly label: string;
  readonly tip: HelpId;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly contrast?: string | undefined;
}): ReactElement {
  const problem = hexProblem(value);
  return (
    <Field
      label={label}
      tip={tip}
      {...(problem === undefined ? {} : { error: problem })}
      {...(problem === undefined && contrast !== undefined ? { help: contrast } : {})}
    >
      <ColourInput
        value={value}
        placeholder="#FFFFFF"
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
