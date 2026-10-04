import type { ChannelLink } from "@app/slices/youtube/placeholders.js";
import { PlusIcon, Trash2Icon } from "lucide-react";
import type { ReactElement } from "react";
import { defaultChannelId } from "@/channels/api";
import { Button } from "@/components/kit/button";
import { Input } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { ButtonLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";

// A channel's named links, edited on its Brand tab: the links a YouTube description's
// `{{Name}}` placeholders fill from when it is shown, copied or downloaded, such as {{Patreon}}
// or {{Discord}}. A project can set its own Previous video on its page, which wins over these.
// The list is part of the Brand form, so Save channel keeps it.
export function ChannelLinksEditor({
  rows,
  onChange,
}: {
  readonly rows: readonly ChannelLink[];
  readonly onChange: (rows: readonly ChannelLink[]) => void;
}): ReactElement {
  const change = (index: number, next: Partial<ChannelLink>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...next } : row)));
  return (
    <section aria-label="Channel links" {...helpScope}>
      <SectionHead
        title="Channel links"
        meta="Write a link's name in braces in a description, such as {{Patreon}}."
        info="planning.links.named"
      />
      {rows.length === 0 ? (
        <p className="m-0 border-y border-line py-4 text-ink-2">
          No channel links yet. Add one, then write its name in braces in a description.
        </p>
      ) : (
        <ul aria-label="Channel links" className="sl-list m-0 list-none p-0">
          {/* The column names, seen on a wide screen; a phone shows them above each box. */}
          <li
            aria-hidden="true"
            className="hidden grid-cols-[220px_minmax(0,1fr)_auto] gap-2 border-b border-line pt-1 pb-2 text-label text-ink-2 md:grid"
          >
            <span>Name, used as {"{{Name}}"}</span>
            <span>Address</span>
          </li>
          {rows.map((row, index) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place and never reorder
              key={index}
              className="grid grid-cols-[minmax(0,1fr)] items-center gap-2 border-b border-line py-3 md:grid-cols-[220px_minmax(0,1fr)_auto]"
            >
              <span className="grid gap-1">
                <span aria-hidden="true" className="text-label text-ink-2 md:hidden">
                  Name, used as {"{{Name}}"}
                </span>
                <Input
                  aria-label={`Name of link ${String(index + 1)}`}
                  placeholder="Patreon"
                  value={row.name}
                  onChange={(event) => change(index, { name: event.currentTarget.value })}
                />
              </span>
              <span className="grid gap-1">
                <span aria-hidden="true" className="text-label text-ink-2 md:hidden">
                  Address
                </span>
                <Input
                  aria-label={`Address of link ${String(index + 1)}`}
                  type="url"
                  placeholder="https://"
                  value={row.url}
                  onChange={(event) => change(index, { url: event.currentTarget.value })}
                />
              </span>
              <Button
                variant="quiet"
                size="small"
                className="justify-self-start"
                aria-label={`Remove link ${String(index + 1)}`}
                onClick={() => onChange(rows.filter((_row, at) => at !== index))}
              >
                <Trash2Icon aria-hidden="true" className="size-[14px]" />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <Button onClick={() => onChange([...rows, { name: "", url: "" }])}>
          <PlusIcon aria-hidden="true" className="size-[14px]" />
          Add link
        </Button>
      </div>
    </section>
  );
}

// Settings → Channel links: the links moved to each channel's Brand tab, so every channel fills
// `{{Patreon}}` with its own. A list saved here before still fills the default channel's
// projects until its Brand tab is saved.
export function ChannelLinksSettings(): ReactElement {
  return (
    <div {...helpScope}>
      <SectionHead title="Named links" info="planning.links.named" />
      <p className="m-0 max-w-[60ch] text-ink-2">
        Each channel keeps its own links now, on its Brand tab under Channel links. Links saved here
        before fill the default channel's descriptions until you save its Brand tab.
      </p>
      <div className="mt-3">
        <ButtonLink to="/channels/$channelId" params={{ channelId: defaultChannelId }}>
          Open the default channel's links
        </ButtonLink>
      </div>
    </div>
  );
}
