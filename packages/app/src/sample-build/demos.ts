// The two demo projects bundled beside "The Library of Alexandria": an audiobook read by a
// narrator and two character voices, and a two-host podcast. Maintainer-only: read when a demo
// is rebuilt (`build-sample.mjs --demo <id>`); the app only imports the finished archives.

export const demoIds = ["audiobook", "podcast"] as const;
export type DemoId = (typeof demoIds)[number];

export interface DemoSpeaker {
  readonly id: string;
  readonly name: string;
  readonly role: "narrator" | "host" | "character";
  // The Inworld stock voice the bundled archive was spoken with.
  readonly voice: string;
  // What the portrait shows, for a podcast host (painted by the Codex CLI).
  readonly portrait?: string | undefined;
}

export interface DemoScene {
  // The picture's file name in the assets folder, without `.jpg`.
  readonly scene: string;
  readonly name: string;
  readonly subject: string;
}

export interface DemoShort {
  // Words of the sentence the short opens on; it runs from there to the end of the video.
  readonly opens: string;
  readonly title: string;
  readonly description: string;
  readonly hashtags: readonly string[];
  // The scenes its pictures show, by `DemoScene.scene`.
  readonly scenes: readonly string[];
}

export interface Demo {
  readonly id: DemoId;
  readonly title: string;
  readonly format: "audiobook" | "podcast";
  readonly speakers: readonly DemoSpeaker[];
  // The provided text: the story excerpt (an audiobook's text the writer hands to speakers),
  // or the podcast's script itself.
  readonly article: string;
  // The audiobook's speaker split, the answer the sample writer gives to the attribution
  // request. Every word is the text's own (the pipeline checks it).
  readonly attributed?: string | undefined;
  readonly style: string;
  readonly scenes: readonly DemoScene[];
  // The scene painted tall as well, for the short; the short's other pictures are crops of
  // the wide paintings.
  readonly vertical: string;
  readonly thumbnail: string;
  readonly summary: string;
  readonly chapters: readonly { readonly opens: string; readonly title: string }[];
  readonly hashtags: readonly string[];
  readonly tags: readonly string[];
  readonly short: DemoShort;
  readonly imageSeconds: number;
  // The Narration Preparation prompt the demo is made with, and the delivery cues the sample
  // writer answers for each turn (1-based script order), in the preparation step's own cue
  // format: an instruction or a sound at a sentence of the turn. A turn not listed gets none.
  readonly direction: string;
  readonly delivery: Readonly<Record<number, readonly DemoCue[]>>;
  // The least pause between sentences inside a turn, in seconds (`narration/pauses-model.ts`):
  // an audiobook's relaxed pace, a podcast's conversational one.
  readonly sentencePause: number;
}

export type DemoCue =
  | { readonly sentence: number; readonly kind: "instruction"; readonly text: string }
  | {
      readonly sentence: number;
      readonly kind: "sound";
      readonly sound: "laugh" | "breathe" | "clear throat" | "sigh" | "cough" | "yawn";
    };

const say = (text: string, sentence = 1): DemoCue => ({ sentence, kind: "instruction", text });

// Kenneth Grahame, The Wind in the Willows (1908), chapter I "The River Bank", abridged:
// Project Gutenberg eBook #289, public domain. The words are the book's own; paragraphs in
// between, and the Mole's "Is it so nice as all that?" exchange, are left out.
const willows = `# The River Bank

He thought his happiness was complete when, as he meandered aimlessly along, suddenly he stood by the edge of a full-fed river. Never in his life had he seen a river before—this sleek, sinuous, full-bodied animal, chasing and chuckling, gripping things with a gurgle and leaving them with a laugh, to fling itself on fresh playmates that shook themselves free, and were caught and held again.

Then the two animals stood and regarded each other cautiously.

“Hullo, Mole!” said the Water Rat.

“Hullo, Rat!” said the Mole.

“Would you like to come over?” enquired the Rat presently.

# Messing About in Boats

“This has been a wonderful day!” said he, as the Rat shoved off and took to the sculls again. “Do you know, I’ve never been in a boat before in all my life.”

“What?” cried the Rat, open-mouthed: “Never been in a—you never—well I—what have you been doing, then?”

“Believe me, my young friend, there is nothing—absolute nothing—half so much worth doing as simply messing about in boats. Simply messing,” he went on dreamily: “messing—about—in—boats; messing——”

“Look ahead, Rat!” cried the Mole suddenly.

It was too late. The boat struck the bank full tilt. The dreamer, the joyous oarsman, lay on his back at the bottom of the boat, his heels in the air.
`;

const willowsAttributed = `# The River Bank

Narrator: He thought his happiness was complete when, as he meandered aimlessly along, suddenly he stood by the edge of a full-fed river. Never in his life had he seen a river before—this sleek, sinuous, full-bodied animal, chasing and chuckling, gripping things with a gurgle and leaving them with a laugh, to fling itself on fresh playmates that shook themselves free, and were caught and held again.

Narrator: Then the two animals stood and regarded each other cautiously.

Rat: Hullo, Mole!

Narrator: said the Water Rat.

Mole: Hullo, Rat!

Narrator: said the Mole.

Rat: Would you like to come over?

Narrator: enquired the Rat presently.

# Messing About in Boats

Mole: This has been a wonderful day!

Narrator: said he, as the Rat shoved off and took to the sculls again.

Mole: Do you know, I’ve never been in a boat before in all my life.

Rat: What?

Narrator: cried the Rat, open-mouthed:

Rat: Never been in a—you never—well I—what have you been doing, then?

Rat: Believe me, my young friend, there is nothing—absolute nothing—half so much worth doing as simply messing about in boats. Simply messing,

Narrator: he went on dreamily:

Rat: messing—about—in—boats; messing——

Mole: Look ahead, Rat!

Narrator: cried the Mole suddenly.

Narrator: It was too late. The boat struck the bank full tilt. The dreamer, the joyous oarsman, lay on his back at the bottom of the boat, his heels in the air.
`;

// The maintainer's own script about a public-domain subject.
const antikythera = `# A Lump of Bronze

Nell: In the spring of 1901, sponge divers working off the Greek island of Antikythera brought up something nobody could explain.

Theo: This is the shipwreck, right? A cargo ship that went down in the first century BC, loaded with bronze statues and glassware.

Nell: That's the one. And among the treasures was a corroded lump of bronze and wood, about the size of a shoebox. The next year, an archaeologist noticed a gear wheel in it.

Theo: A gear wheel. Two thousand years old.

Nell: Today it survives as eighty-two fragments in the National Archaeological Museum in Athens, with at least thirty bronze gears.

# A Computer for the Sky

Theo: So what did it actually do?

Nell: You turned a handle, and the dials showed where the sun and the moon were, the phase of the moon, and when the next eclipses would come.

Theo: And the moon even sped up and slowed down, the way it really does in the sky. That came from a pin riding in a slot between two gears.

Nell: X-ray scans in 2005 revealed thousands of tiny letters engraved on it, a user's guide of sorts. There's even a dial for the athletic games, the Olympics among them.

Theo: And nothing that intricate turns up again for more than a thousand years.

Nell: Which is why it's often called the first analog computer.
`;

export const demos: Readonly<Record<DemoId, Demo>> = {
  audiobook: {
    id: "audiobook",
    title: "The Wind in the Willows: The River Bank",
    format: "audiobook",
    speakers: [
      { id: "narrator", name: "Narrator", role: "narrator", voice: "Winston" },
      { id: "mole", name: "Mole", role: "character", voice: "Freddie" },
      { id: "rat", name: "Rat", role: "character", voice: "Ronald" },
    ],
    article: willows,
    attributed: willowsAttributed,
    style:
      "Painterly landscape, oil on canvas with visible brushwork, soft English countryside light, gentle greens and golds",
    scenes: [
      {
        scene: "meadow",
        name: "Demo · Spring meadow",
        subject:
          "a spring meadow with hedgerows and copses, blossom on the hawthorn, a path winding through the grass towards the sound of water, early morning mist. No people, no animals, no text.",
      },
      {
        scene: "river",
        name: "Demo · Full-fed river",
        subject:
          "a full, fast river winding between grassy banks, sunlight glinting and sparkling on the rippling water, willows trailing their branches in the current. No people, no animals, no text.",
      },
      {
        scene: "boat",
        name: "Demo · Little boat",
        subject:
          "a little rowing boat painted blue outside and white within, moored below a dark hole in the opposite river bank just above the water's edge, reeds and willow shade. No people, no animals, no text.",
      },
      {
        scene: "bank",
        name: "Demo · Boat on the bank",
        subject:
          "an empty rowing boat run aground on a grassy river bank, one oar trailing in the water, a wicker basket on the cushions, a summer river at golden hour. No people, no animals, no text.",
      },
    ],
    vertical: "river",
    thumbnail: "boat",
    summary:
      'An abridged reading of the opening of The Wind in the Willows, chapter I, "The River Bank": the Mole meets the river, and the Water Rat takes him out in a boat. A narrator and two character voices; the text is Kenneth Grahame\'s (1908, public domain), from Project Gutenberg eBook #289.',
    chapters: [
      { opens: "He thought his happiness", title: "The River Bank" },
      { opens: "Then the two animals", title: "Hullo, Mole!" },
      { opens: "This has been a wonderful day", title: "Messing About in Boats" },
    ],
    hashtags: ["#audiobook", "#windinthewillows", "#classicbooks"],
    tags: [
      "the wind in the willows",
      "kenneth grahame",
      "audiobook",
      "the river bank",
      "mole and rat",
      "classic children's books",
      "public domain audiobook",
      "project gutenberg",
    ],
    short: {
      opens: "What?",
      title: "Nothing half so much worth doing as messing about in boats",
      description: "The Water Rat explains boats to the Mole, from The Wind in the Willows (1908).",
      hashtags: ["#audiobook", "#windinthewillows", "#books"],
      scenes: ["river", "boat", "bank"],
    },
    imageSeconds: 25,
    sentencePause: 0.6,
    direction:
      "Direct an audiobook of a classic children's story. The narrator reads warmly and unhurriedly, like a storyteller by the fire; each character speaks with the feeling of the line. Tasteful and sparing, never theatrical.",
    delivery: {
      1: [say("narrate warmly and unhurriedly, with quiet wonder")],
      2: [say("narrate softly, with a hint of suspense")],
      3: [say("call out cheerfully across the water")],
      5: [say("say shyly and a little uncertainly")],
      7: [say("say kindly, with an inviting warmth")],
      9: [say("say breathlessly, bursting with delight")],
      11: [
        say("confide in an awed, happy voice"),
        { sentence: 1, kind: "sound", sound: "breathe" },
      ],
      12: [say("say in open-mouthed astonishment")],
      14: [say("splutter in disbelief, tripping over the words")],
      15: [
        say("say earnestly and warmly, as if sharing a great secret"),
        say("say dreamily, drifting off", 2),
      ],
      17: [say("say slowly and dreamily, trailing away")],
      18: [say("shout in sudden alarm")],
      20: [say("narrate briskly, with comic timing"), say("narrate with warm amusement", 3)],
    },
  },
  podcast: {
    id: "podcast",
    title: "The Antikythera Mechanism",
    format: "podcast",
    speakers: [
      {
        id: "nell",
        name: "Nell",
        role: "host",
        voice: "Naomi",
        portrait:
          "a head-and-shoulders portrait of a fictional podcast host, a woman in her thirties with short dark curly hair and a warm, amused expression, wearing a mustard cardigan, plain teal background",
      },
      {
        id: "theo",
        name: "Theo",
        role: "host",
        voice: "Jake",
        portrait:
          "a head-and-shoulders portrait of a fictional podcast host, a man in his forties with a trimmed grey beard and round glasses, curious expression, wearing a navy sweater, plain warm ochre background",
      },
    ],
    article: antikythera,
    style:
      "Painterly documentary illustration, oil on canvas with visible brushwork, deep Aegean blues and warm bronze tones",
    scenes: [
      {
        scene: "sea",
        name: "Demo · Aegean sea",
        subject:
          "the sea off a rocky Greek island at dawn, a small wooden sponge-diving boat from around 1900 at anchor, calm deep blue water. No people, no text.",
      },
      {
        scene: "fragment",
        name: "Demo · Bronze fragment",
        subject:
          "a corroded green bronze fragment with the teeth of a small gear wheel visible, lying on dark cloth under a museum spotlight. No people, no text.",
      },
      {
        scene: "gears",
        name: "Demo · Gears and dials",
        subject:
          "a reconstruction of an ancient Greek bronze gearwork, interlocking toothed wheels behind a round dial marked with the zodiac, warm lamplight. No people, no readable text.",
      },
      {
        scene: "sky",
        name: "Demo · Eclipse over the sea",
        subject:
          "a night sky over the Aegean with the moon in eclipse, glowing copper red, stars above a dark rocky coastline. No people, no text.",
      },
    ],
    vertical: "gears",
    thumbnail: "gears",
    summary:
      "Two hosts on the Antikythera mechanism: the shipwreck it came from, what its gears and dials showed, and why it is often called the first analog computer. A script written for Slopify's demo.",
    chapters: [
      { opens: "In the spring of 1901", title: "The Shipwreck" },
      { opens: "That's the one", title: "A Lump of Bronze" },
      { opens: "So what did it actually do", title: "A Computer for the Sky" },
    ],
    hashtags: ["#podcast", "#history", "#antikythera"],
    tags: [
      "antikythera mechanism",
      "ancient greek technology",
      "ancient computer",
      "history podcast",
      "archaeology",
      "astronomy",
      "shipwreck",
    ],
    short: {
      opens: "So what did it actually do",
      title: "A 2,000-year-old computer for the sky",
      description: "What the Antikythera mechanism's gears and dials could show.",
      hashtags: ["#history", "#antikythera", "#science"],
      scenes: ["gears", "sky", "fragment"],
    },
    imageSeconds: 22,
    sentencePause: 0.35,
    direction:
      "Direct a lively, friendly two-host history podcast: conversational and curious, with the odd laugh where a person would laugh. Never overdone.",
    delivery: {
      1: [say("speak with bright, conversational energy, drawing the listener in")],
      2: [say("say with eager curiosity")],
      3: [say("say warmly"), say("say with a hint of suspense, slowing down", 3)],
      4: [say("say slowly, in amazed disbelief"), { sentence: 2, kind: "sound", sound: "laugh" }],
      6: [say("ask with lively curiosity")],
      7: [say("explain enthusiastically, with a smile in the voice")],
      8: [say("say excitedly, building momentum")],
      9: [say("say with growing wonder"), { sentence: 2, kind: "sound", sound: "laugh" }],
      10: [say("say thoughtfully, a little slower")],
      11: [say("say warmly, wrapping up with a smile")],
    },
  },
};

export function demoOf(id: string): Demo {
  const demo = (demos as Readonly<Record<string, Demo>>)[id];
  if (demo === undefined)
    throw new Error(`There is no demo "${id}". Use one of: ${demoIds.join(", ")}.`);
  return demo;
}

export function portraitPrompt(subject: string): string {
  return `Painterly portrait, oil on canvas with visible brushwork, clearly a painting and not a photograph: ${subject}. The face centred in the frame. No text.`;
}

// A picture prompt in the demo's painted style, or saying "Procedural art" for a build without
// pictures (CI), which draws it locally.
export function demoPrompt(
  demo: Demo,
  subject: string,
  vertical = false,
  procedural = false,
): string {
  const style = procedural ? "Procedural art" : demo.style;
  return `${vertical ? `Vertical ${style.charAt(0).toLowerCase()}${style.slice(1)}` : style}: ${subject}`;
}

// Which scene an image request asks for: the one whose subject the prompt carries, else the
// scene its words name.
export function demoSceneOf(demo: Demo, prompt: string): string {
  const text = prompt.toLowerCase();
  const exact = demo.scenes.find((one) => text.includes(one.subject.toLowerCase()));
  if (exact !== undefined) return exact.scene;
  const named = demo.scenes.find((one) => new RegExp(`\\b${one.scene}\\b`).test(text));
  return named?.scene ?? demo.scenes[0]?.scene ?? "";
}
