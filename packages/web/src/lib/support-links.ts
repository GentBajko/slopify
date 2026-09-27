// Where people can support Slopify. Settings → About reads these; slopify.stream
// (packages/site/public/main.js) and the README carry the same donation value and rule.

export const sourceUrl = "https://github.com/GentBajko/slopify";
export const patreonUrl = "https://www.patreon.com/cw/GentBajko";
export const coffeeUrl = "https://buymeacoffee.com/gentbajko";

// The donation page is not known yet. This is a clearly marked placeholder; while it is the
// placeholder, nothing in the app links to it. Replace it with the real page to show the
// Donate link in Settings → About.
export const donationPlaceholder = "https://example.com/donate";
export const donationUrl: string = donationPlaceholder;

// The donation address to link to, or undefined while there is none: the placeholder, an
// example.com address, or anything that is not an https URL.
export function donationHref(url: string): string | undefined {
  if (url === donationPlaceholder) return undefined;
  const parsed = URL.parse(url);
  return parsed !== null && parsed.protocol === "https:" && parsed.hostname !== "example.com"
    ? parsed.href
    : undefined;
}
