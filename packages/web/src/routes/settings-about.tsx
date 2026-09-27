import type { ReactElement } from "react";
import { SupportGlyph, type SupportGlyphName } from "@/components/glyph";
import { Button } from "@/components/kit/button";
import { InfoTip } from "@/components/kit/info-tip";
import { SectionHead } from "@/components/kit/section-head";
import { coffeeUrl, patreonUrl, sourceUrl } from "@/lib/support-links";

interface SupportLink {
  readonly href: string;
  readonly label: string;
  readonly detail: string;
  readonly glyph?: SupportGlyphName;
}

// The rows Settings → About lists.
export function aboutLinks(): readonly SupportLink[] {
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
    {
      href: "https://slopify.stream/channel.html",
      label: "How I run a channel with it",
      detail: "A lore channel run on Slopify, start to finish.",
    },
  ];
}

export function AboutSettings({
  onWhatsNew,
}: {
  // Opens this version's patch notes; the button is left out without it.
  readonly onWhatsNew?: () => void;
}): ReactElement {
  return (
    <div className="max-w-prose">
      <SectionHead title="About" />
      <p className="m-0 mb-3 text-ink-2">
        Slopify is free and open source, and runs on your machine with your own keys. If it saves
        you time, you can support it here.
      </p>
      <p className="m-0 mb-3 flex items-center gap-1 text-small text-ink-2">
        Updates: the circular-arrows button at the top of every page.
        <InfoTip id="settings.updates" />
      </p>
      {onWhatsNew === undefined ? null : (
        <p className="m-0 mb-3 flex items-center gap-1">
          <Button onClick={onWhatsNew}>What's new in this version</Button>
          <InfoTip id="settings.whats-new" />
        </p>
      )}
      <p className="m-0 mb-4 text-small text-ink-2">
        Made by Gent Bajko. Apache License 2.0: anyone who redistributes Slopify or builds on it
        keeps this credit.
      </p>
      <ul aria-label="Links" className="sl-list m-0 list-none p-0">
        {aboutLinks().map((link) => (
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
