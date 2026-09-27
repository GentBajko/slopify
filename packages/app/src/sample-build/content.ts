// The sample project's words, written for Slopify: a public-domain subject, told in the
// maintainer's own text. Maintainer-only: read when the sample is rebuilt.

export const sampleTitle = "The Library of Alexandria";

export const sampleArticle = `## A library at the edge of the sea

Around three hundred years before our era, on the coast of Egypt, the city of Alexandria set out to gather the world's knowledge in one place. Alexandria was a young city then, a busy port where Greek, Egyptian and Jewish communities lived side by side. The Ptolemies, the Greek-speaking kings who ruled Egypt after Alexander the Great, paid for a research institute called the Mouseion, a house of the Muses. Beside it grew the library that became a legend.

## Collecting everything

Nobody knows how many scrolls it held. Ancient writers give numbers from forty thousand to seven hundred thousand, and historians today trust none of them. What is clear is the ambition. The collection reached across poetry, medicine, mathematics, astronomy, geography and law, mostly in Greek. Agents bought books all around the Mediterranean. A story told by the physician Galen says that ships docking in the harbor had their books copied, and the library kept the originals.

Scholars worked there on a salary. Callimachus compiled the Pinakes, a catalog of Greek writers often called the first library catalog. Eratosthenes, one of its head librarians, measured the size of the Earth with shadows, geometry and the distance between two cities, and came remarkably close. Editors compared copies of Homer line by line.

## How it disappeared

The famous picture of one great fire is almost certainly wrong. When Julius Caesar was trapped in Alexandria in 48 BCE, fire spread from the harbor, and some ancient writers say books burned, though no one agrees how many. Royal money faded under Roman rule. Scholars were driven out in political purges. The palace quarter was wrecked in the wars of the third century, and a daughter library in the Serapeum temple was destroyed in 391. Stories that blame one ruler for everything were mostly written centuries later.

## What it left behind

The library did not vanish in a night. It faded over hundreds of years, as money, peace and attention ran out. Much of what it held survived only because copies had already travelled to other cities. Its real legacy is an idea: that knowledge is worth gathering, checking and sharing, and that it needs care to last. In 2002 Egypt opened the Bibliotheca Alexandrina near the old site, a new library built in honour of that idea.
`;

export type SampleScene = "harbor" | "scrolls" | "embers" | "disc";

// How a prompt names the look of its picture. A build with a pictures folder uses the painted
// look the folder's images were made with (by the Codex CLI, see sample-build/README in
// generate.ts); a build without one draws procedural art locally, and its prompts say so.
export type SampleStyle = "painted" | "procedural";

const styleWords: Record<SampleStyle, string> = {
  painted:
    "Painterly documentary illustration, oil on canvas with visible brushwork, warm muted palette, soft cinematic light",
  procedural: "Procedural art",
};

export function styled(style: SampleStyle, subject: string, vertical = false): string {
  const words = styleWords[style];
  return `${vertical ? `Vertical ${words.charAt(0).toLowerCase()}${words.slice(1)}` : words}: ${subject}`;
}

// The Images stage's prompts. Each says honestly what the sample's image step drew.
const imageSubjects: readonly {
  readonly name: string;
  readonly subject: string;
  readonly scene: SampleScene;
}[] = [
  {
    name: "Sample · Harbor at dusk",
    scene: "harbor",
    subject:
      "the harbor of ancient Alexandria at dusk, the Pharos lighthouse on the horizon, merchant ships with furled sails, the sun setting over calm water. Warm sky, deep blue sea, no text.",
  },
  {
    name: "Sample · Scroll shelves",
    scene: "scrolls",
    subject:
      "shelves of rolled papyrus scrolls in lamplit stone niches inside the ancient library, a scholar reading at a long table, warm amber light and floating dust. No text.",
  },
  {
    name: "Sample · Ruined colonnade",
    scene: "embers",
    subject:
      "a ruined colonnade against an orange sky, one broken column, embers drifting in the air. No text.",
  },
  {
    name: "Sample · New library at night",
    scene: "disc",
    subject:
      "a vast tilted disc roof rising from the waterfront at night, like the Bibliotheca Alexandrina, under a starry sky. No text.",
  },
];

export function sampleImagePrompts(style: SampleStyle): readonly {
  readonly name: string;
  readonly body: string;
  readonly scene: SampleScene;
}[] {
  return imageSubjects.map((prompt) => ({
    name: prompt.name,
    scene: prompt.scene,
    body: styled(style, prompt.subject),
  }));
}

export const sampleThumbnailSubject =
  "stacks of scrolls glowing in lamplight, bold and simple enough to read at phone size. No text.";

export function sampleThumbnailPrompt(style: SampleStyle): {
  readonly name: string;
  readonly body: string;
} {
  return { name: "Sample · Thumbnail", body: styled(style, sampleThumbnailSubject) };
}

// Which scene an image request asks for, by the words its prompt uses.
export function sceneOf(prompt: string): SampleScene {
  const text = prompt.toLowerCase();
  if (text.includes("lighthouse") || text.includes("harbor")) return "harbor";
  if (text.includes("colonnade") || text.includes("ember") || text.includes("fire"))
    return "embers";
  if (text.includes("disc") || text.includes("night")) return "disc";
  return "scrolls";
}
