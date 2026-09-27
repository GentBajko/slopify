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
    <div>
      <SectionHead title="About" />
      <p className="mb-4 max-w-prose text-ink2">
        Slopify is free and open source, and runs on your machine with your own keys. If it saves
        you time, you can support it here.
      </p>
      <ul className="grid max-w-prose divide-y divide-line border-y border-line">
        {aboutLinks(donation).map((link) => (
          <li key={link.label} className="flex items-center gap-3 py-3">
            {link.glyph === undefined ? (
              <span aria-hidden="true" className="size-[14px] shrink-0" />
            ) : (
              <SupportGlyph name={link.glyph} className="text-ink2" />
            )}
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-ink underline underline-offset-3"
            >
              {link.label}
            </a>
            <span className="text-small text-ink2">{link.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
