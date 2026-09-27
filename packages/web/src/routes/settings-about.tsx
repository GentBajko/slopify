import type { ReactElement } from "react";
import { SupportGlyph, type SupportGlyphName } from "@/components/glyph";
import { SectionHead } from "@/components/kit/section-head";
import { coffeeUrl, donationHref, donationUrl, patreonUrl, sourceUrl } from "@/lib/support-links";

interface SupportLink {
  readonly href: string;
  readonly label: string;
  readonly detail: string;
  readonly glyph?: SupportGlyphName;
}

// The rows Settings → About lists. The donation row is left out while its address is the
// placeholder (lib/support-links.ts), so the app never links to a page that isn't there.
export function aboutLinks(donation: string = donationUrl): readonly SupportLink[] {
  const donate = donationHref(donation);
  return [
    { href: sourceUrl, label: "GitHub", detail: "The code, issues and releases.", glyph: "github" },
    {
      href: patreonUrl,
      label: "Patreon",
      detail: "Monthly support for the project.",
      glyph: "patreon",
    },
    {
      href: coffeeUrl,
      label: "Buy Me a Coffee",
      detail: "A one-off thank you.",
      glyph: "coffee",
    },
    ...(donate === undefined
      ? []
      : [{ href: donate, label: "Donate", detail: "Support the project directly." }]),
    {
      href: "https://slopify.stream/channel.html",
      label: "How I run a channel with it",
      detail: "A lore channel run on Slopify, start to finish.",
    },
  ];
}

export function AboutSettings({
  donation = donationUrl,
}: {
  readonly donation?: string;
}): ReactElement {
  return (
    <div className="max-w-prose">
      <SectionHead title="Support Slopify" meta="If it saves you time, you can support it here." />
      <ul aria-label="Links" className="sl-list m-0 list-none p-0">
        {aboutLinks(donation).map((link) => (
          <li key={link.label} className="sl-row">
            <div className="sl-row__lead">
              {link.glyph === undefined ? (
                <span aria-hidden="true" className="size-[14px] shrink-0" />
              ) : (
                <SupportGlyph name={link.glyph} className="shrink-0 text-ink-2" />
              )}
              <div className="sl-row__text">
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-ink underline underline-offset-3"
                >
                  {link.label}
                </a>
                <span className="sl-row__meta">{link.detail}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
