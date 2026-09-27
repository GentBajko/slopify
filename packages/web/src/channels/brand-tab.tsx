import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { ActionBar, StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Field, Input, Select, Textarea } from "@/components/kit/field";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { LanguageSelect } from "@/language/language-select";
import { documentThemesQuery, entriesQuery } from "@/queries";
import { fontsKey, listFonts } from "@/subtitles/api";
import { type BrandKit, type Channel, channelKey, channelsKey, saveChannel } from "./api";

type Draft = Required<{ readonly [K in keyof BrandKit]-?: string }>;
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
  const save = useMutation({
    mutationFn: () =>
      saveChannel(api, channel.id, {
        name,
        seriesBrief: brief,
        brand: Object.fromEntries(
          fields.flatMap((field) => (kit[field].trim() === "" ? [] : [[field, kit[field].trim()]])),
        ),
        baseVersion: channel.version,
      }),
    onSuccess: async (saved) => {
      notify("Channel saved.", "success");
      client.setQueryData(channelKey(saved.id), (current: unknown) =>
        current !== null && typeof current === "object" ? { ...current, channel: saved } : current,
      );
      await client.invalidateQueries({ queryKey: channelsKey });
    },
  });
  const set = (field: keyof Draft) => (value: string) => setKit({ ...kit, [field]: value });
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
        <Field label="Channel name">
          <Input
            value={name}
            maxLength={200}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field
          label="Series brief"
          help="What the channel covers, its style and what makes a topic worth a video."
        >
          <Textarea
            rows={4}
            value={brief}
            maxLength={10000}
            onChange={(event) => setBrief(event.target.value)}
          />
        </Field>
        <SectionHead
          title="Brand kit"
          meta="Fills what a template leaves at its default. Blank fields add nothing."
          className="mt-2 border-t border-line pt-6"
        />
        <section aria-label="Language" className="max-w-md">
          {/* The channel's language applies with the brand kit off too: it is not styling. */}
          <LanguageSelect
            label="Language of new projects"
            value={kit.language === "" ? undefined : kit.language}
            inherited={{ label: "Not set", language: undefined }}
            onChange={(language) => set("language")(language ?? "")}
          />
        </section>
        <section aria-label="Captions" className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-3">
          <Choice
            label="Caption font"
            value={kit.captionFontId}
            options={fontOptions}
            onPick={set("captionFontId")}
          />
          <Colour label="Caption colour" value={kit.captionColor} onChange={set("captionColor")} />
          <Colour
            label="Caption outline"
            value={kit.captionOutlineColor}
            onChange={set("captionOutlineColor")}
          />
        </section>
        <section
          aria-label="Chapter cards and end screen"
          className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-3"
        >
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
        </section>
        <section
          aria-label="Intro, outro and document"
          className="grid grid-cols-1 gap-4 min-[700px]:grid-cols-3"
        >
          <Choice
            label="Intro"
            value={kit.intro}
            options={entryOptions("intro")}
            onPick={set("intro")}
          />
          <Choice
            label="Outro"
            value={kit.outro}
            options={entryOptions("outro")}
            onPick={set("outro")}
          />
          <Choice
            label="Document theme"
            value={kit.documentTheme}
            options={themeOptions}
            onPick={set("documentTheme")}
          />
        </section>
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
          disabled={save.isPending || name.trim() === ""}
          disabledReason="Give the channel a name"
        >
          Save channel
        </Button>
      </ActionBar>
    </form>
  );
}

function Choice({
  label,
  value,
  options,
  onPick,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onPick: (value: string) => void;
}): ReactElement {
  return (
    <Field label={label}>
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

// A #RRGGBB field with a swatch; blank is "not set", which a colour input cannot say.
function Colour({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): ReactElement {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <Field
      label={label}
      {...(value !== "" && !valid ? { error: "Write the colour as # and six hex digits." } : {})}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="size-6 shrink-0 rounded-control border border-line-strong"
          style={{ background: valid ? value : "transparent" }}
        />
        <Input
          value={value}
          placeholder="#FFFFFF"
          maxLength={7}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </Field>
  );
}
