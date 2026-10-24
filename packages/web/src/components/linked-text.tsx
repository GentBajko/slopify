import { useRouter } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { TextLink } from "@/components/kit/link";
import { settingsSections } from "@/routes/settings-sections";

type SectionId = (typeof settingsSections)[number]["id"];
interface SettingsPart {
  readonly label: string;
  readonly section: SectionId;
}

// Every name a Settings page goes by: its own, and the ones older messages still use
// ("Settings → Providers" for Keys & services).
const names = settingsSections.flatMap((section) =>
  ["formerly" in section ? section.formerly : [], [section.label]]
    .flat()
    .map((label) => ({ label, section })),
);

// A message that names a Settings page ("Settings → Providers") with that name as a link to it,
// so an error that says where the fix is also takes you there.
const pattern = new RegExp(
  `Settings → (${names
    .map((name) => name.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .toSorted((a, b) => b.length - a.length)
    .join("|")})`,
  "g",
);

export function settingsLinkParts(text: string): readonly (string | SettingsPart)[] {
  const parts: (string | SettingsPart)[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const label = match[1];
    const section = names.find((one) => one.label === label)?.section;
    if (section === undefined || match.index === undefined) continue;
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ label: match[0], section: section.id });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function LinkedText({ text }: { readonly text: string }): ReactElement {
  // Outside a router (a component rendered on its own) the words stay plain text.
  const router: unknown = useRouter({ warn: false });
  if (router === null || router === undefined) return <>{text}</>;
  const nodes: ReactNode[] = settingsLinkParts(text).map((part, index) =>
    typeof part === "string" ? (
      part
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed sentence.
      <TextLink key={index} to="/settings" search={{ section: part.section }}>
        {part.label}
      </TextLink>
    ),
  );
  return <>{nodes}</>;
}
