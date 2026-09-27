import type { PromptKind } from "../library/model.js";
import type { subtitlePositions } from "../subtitles/model.js";
import type { ColorGrade, VideoEditSettings } from "../video/edit-settings.js";
import { defaultVideoEdit } from "../video/edit-settings.js";

// Starter packs: a niche's worth of library prompts, a suggested voice and a Play template
// that uses them, installed together from the first-run screen or the Library. Every prompt
// asks for one keyword, {{topic}}, so "pick a pack, type a topic, go" is all a first run
// needs. The "starter" set is what "Make a 60-second short" uses when no pack is picked.

export interface PackPrompt {
  // Stable within the pack; the install records which library row each one became.
  readonly key: PackPromptKey;
  readonly kind: PromptKind;
  readonly name: string;
  readonly body: string;
}

export type PackPromptKey =
  | "article"
  | "shortScript"
  | "image"
  | "thumbnail"
  | "description"
  | "shorts";

export interface PackVoice {
  readonly provider: "openai-tts";
  readonly model: string;
  readonly voiceId: string;
  readonly name: string;
}

// The video's style, as Play's controls hold it.
export interface PackStyle {
  readonly research: boolean;
  readonly expectedWords: number;
  readonly imagesPerVideo: number;
  readonly imageSeconds: number;
  readonly zoomPercent: number;
  readonly motionStyle: "zoom" | "pan" | "mixed" | "still";
  readonly captions: {
    readonly fontSize: number;
    readonly position: (typeof subtitlePositions)[number];
  };
  readonly videoEdit: VideoEditSettings;
}

export interface StarterPack {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly prompts: readonly PackPrompt[];
  readonly voice: PackVoice;
  readonly style: PackStyle;
}

const look = (grade: ColorGrade, change: Partial<VideoEditSettings> = {}): VideoEditSettings => ({
  ...defaultVideoEdit,
  grade,
  ...change,
});

const noText = "No text, letters, captions, logos or watermarks anywhere in the image.";

const shortsRules = (voice: string): string =>
  [
    "Pick the moments of this video that work best as vertical shorts.",
    "",
    "- Each short must stand on its own for someone who never saw the video.",
    `- ${voice}`,
    "- Start on the strongest line of the moment, never on a transition or a recap.",
    "- End on a finished thought.",
    "- Title: at most 60 characters, plain words, no clickbait, no hashtags.",
    "- Description: one line saying what the viewer gets from the clip.",
    "- Hashtags: 3-5, about the subject of that clip, most specific last.",
  ].join("\n");

const scriptRules = [
  "Write the narration for a vertical short video of about 60 seconds: 140-160 words.",
  "",
  "- Plain prose only: no headings, lists, stage directions, emoji or hashtags. Every word is spoken.",
  "- The first sentence is the hook. It must make someone stop scrolling on its own.",
  "- One idea, told as a small story with a turn near the end. No introduction, no recap, no 'in this video'.",
  "- Short sentences that read well aloud. Spell out numbers the way they are said.",
  "- End on a line that lands, not on a call to subscribe.",
  "- Stay accurate. If something is uncertain or disputed, say so in a few words instead of inventing detail.",
].join("\n");

export const starterPacks: readonly StarterPack[] = [
  {
    id: "sleep-lore",
    name: "Sleep lore",
    summary: "Slow, gentle myths and legends told to fall asleep to.",
    voice: {
      provider: "openai-tts",
      model: "gpt-4o-mini-tts",
      voiceId: "sage",
      name: "Sleep lore narrator (calm)",
    },
    style: {
      research: false,
      expectedWords: 3000,
      imagesPerVideo: 16,
      imageSeconds: 24,
      zoomPercent: 8,
      motionStyle: "pan",
      captions: { fontSize: 44, position: "bottom" },
      videoEdit: look("warm", {
        transition: "crossfade",
        transitionSeconds: 2,
        vignette: "subtle",
        atmosphere: "fog",
      }),
    },
    prompts: [
      {
        key: "article",
        kind: "article",
        name: "Sleep lore · Story",
        body: [
          "Write a long, calm bedtime telling of {{topic}} for listeners who want to drift off to sleep.",
          "",
          "Length: 2800-3200 words.",
          "",
          "Voice and pace:",
          "- Warm, unhurried and low in energy, like someone reading by lamplight. Nothing sudden, loud or frightening; soften any violence in the source into distance and suggestion.",
          "- Long, flowing sentences with gentle rhythm. Linger on places, weather, light, textures and small sounds.",
          "- Speak to the listener now and then ('you might picture...'), never more than once a section.",
          "",
          "Shape:",
          "- Open by setting a quiet scene, not with the plot.",
          "- Follow the story in order, in six to eight parts, each with a short heading.",
          "- No cliffhangers and no questions left hanging. Each part settles before the next begins.",
          "- Close with a slow, peaceful ending that asks nothing of the listener.",
          "",
          "Accuracy: tell the story as the traditional sources tell it. Where versions differ, choose one and mention the other in a single soft sentence. Do not invent names, dates or quotations.",
          "",
          "Return only the story in Markdown: the headings and the prose. No title page, notes or sources.",
        ].join("\n"),
      },
      {
        key: "shortScript",
        kind: "article",
        name: "Sleep lore · 60-second short",
        body: [
          `Subject: {{topic}}, as a quiet moment from myth or legend.`,
          "",
          scriptRules,
          "- Keep the calm, hushed tone of a bedtime story even in the hook.",
        ].join("\n"),
      },
      {
        key: "image",
        kind: "image",
        name: "Sleep lore · Scene",
        body: [
          "A dreamlike painted scene from the legend of {{topic}}.",
          "Soft oil-painting style with visible brushwork, muted twilight palette of deep blues, dusky violets and warm lantern gold.",
          "Gentle haze, low contrast, wide calm composition with plenty of quiet space; distant figures rather than close faces.",
          "Peaceful and still, nothing threatening in the frame.",
          noText,
        ].join(" "),
      },
      {
        key: "thumbnail",
        kind: "thumbnail",
        name: "Sleep lore · Thumbnail",
        body: [
          "A serene, luminous painting that sums up the legend of {{topic}} in one image.",
          "One clear subject in the centre, soft moonlight or candlelight, deep blue and gold palette, gentle mist.",
          "Readable at a small size: simple shapes, strong silhouette, calm mood.",
          noText,
        ].join(" "),
      },
      {
        key: "description",
        kind: "description",
        name: "Sleep lore · Description",
        body: [
          "Write a YouTube description for a sleep story about {{topic}}.",
          "",
          "- Summary: 2-3 soothing sentences that invite the viewer to settle in. Mention that the story is calm and has no sudden sounds.",
          "- Chapters: one per part of the story, 3-6 gentle words each.",
          "- Hashtags: 3-5, such as sleep story and the legend's subject, most specific last.",
          "- Tags: 15-25 search terms for sleep stories, bedtime myths and the legend itself.",
        ].join("\n"),
      },
      {
        key: "shorts",
        kind: "shorts",
        name: "Sleep lore · Shorts",
        body: shortsRules(
          "Prefer the most beautiful or mysterious images of the story over plot summaries.",
        ),
      },
    ],
  },
  {
    id: "true-crime",
    name: "True crime",
    summary: "Measured, factual retellings of real cases and their investigations.",
    voice: {
      provider: "openai-tts",
      model: "gpt-4o-mini-tts",
      voiceId: "onyx",
      name: "True crime narrator (deep)",
    },
    style: {
      research: true,
      expectedWords: 2400,
      imagesPerVideo: 18,
      imageSeconds: 10,
      zoomPercent: 15,
      motionStyle: "zoom",
      captions: { fontSize: 52, position: "bottom" },
      videoEdit: look("desaturated", {
        transition: "fadeblack",
        transitionSeconds: 0.8,
        vignette: "strong",
        grain: "subtle",
      }),
    },
    prompts: [
      {
        key: "article",
        kind: "article",
        name: "True crime · Case",
        body: [
          "Write a documentary narration about the case of {{topic}}.",
          "",
          "Length: 2200-2600 words.",
          "",
          "Tone: measured, serious and respectful of the victims and their families. Build tension from facts and timing, never from gore or speculation. No graphic detail of injuries.",
          "",
          "Shape:",
          "- Open with one concrete moment that sets the stakes, then step back to who the people were.",
          "- Tell the events in order, then the investigation: what was found, when, and what it meant.",
          "- Give the outcome as it stands today: charges, trial, verdict, appeals, or that it is unsolved.",
          "- Close by returning to the people at the centre of the case, not to the offender.",
          "- Six to eight sections with short, plain headings.",
          "",
          "Accuracy rules:",
          "- Use only facts supported by the research notes or reliable public records. If a detail is disputed or unproven, say so plainly ('police believed', 'the defence argued').",
          "- Name a living person who was never convicted only as the sources do, and never imply guilt.",
          "- Do not invent dialogue, quotes, times or places.",
          "",
          "Return only the narration in Markdown: headings and prose. No title page and no source list.",
        ].join("\n"),
      },
      {
        key: "shortScript",
        kind: "article",
        name: "True crime · 60-second short",
        body: [
          "Subject: one striking, well-documented moment from the case of {{topic}}.",
          "",
          scriptRules,
          "- Respectful and factual: no gore, no speculation about guilt, no invented detail.",
        ].join("\n"),
      },
      {
        key: "image",
        kind: "image",
        name: "True crime · Scene",
        body: [
          "A moody documentary-style photograph evoking the setting of {{topic}}: the place, the era, the objects, the weather.",
          "Cinematic 35mm look, overcast or night light, desaturated cool palette with deep shadows and a single practical light source.",
          "Empty streets, closed doors, rain on glass, paperwork on a desk; no recognisable real people, no bodies, no blood, no weapons pointed at anyone.",
          noText,
        ].join(" "),
      },
      {
        key: "thumbnail",
        kind: "thumbnail",
        name: "True crime · Thumbnail",
        body: [
          "A tense cinematic image that sums up the case of {{topic}}: one strong object or place in sharp focus against a dark, blurred background.",
          "High contrast, cold blue and amber light, heavy vignette, readable at phone size.",
          "No real people's faces, no gore.",
          noText,
        ].join(" "),
      },
      {
        key: "description",
        kind: "description",
        name: "True crime · Description",
        body: [
          "Write a YouTube description for a documentary about the case of {{topic}}.",
          "",
          "- Summary: 2-3 factual sentences on what happened and what the video covers. No sensational words.",
          "- Chapters: split where the story moves from events to investigation to outcome; 3-6 plain words each.",
          "- Hashtags: 3-5 about the case and true crime, most specific last.",
          "- Tags: 15-25 search terms for the case, the place, the people named in the sources and true crime documentaries.",
          "- End the summary with one line noting that the video discusses real crimes.",
        ].join("\n"),
      },
      {
        key: "shorts",
        kind: "shorts",
        name: "True crime · Shorts",
        body: shortsRules(
          "Prefer turning points of the investigation and verified surprising facts; never pick a moment that dwells on violence.",
        ),
      },
    ],
  },
  {
    id: "history",
    name: "History",
    summary: "Narrative history of people, places and events, told like a documentary.",
    voice: {
      provider: "openai-tts",
      model: "gpt-4o-mini-tts",
      voiceId: "fable",
      name: "History narrator (storyteller)",
    },
    style: {
      research: true,
      expectedWords: 2200,
      imagesPerVideo: 16,
      imageSeconds: 12,
      zoomPercent: 20,
      motionStyle: "mixed",
      captions: { fontSize: 48, position: "bottom" },
      videoEdit: look("sepia", {
        transition: "crossfade",
        transitionSeconds: 1,
        vignette: "subtle",
        grain: "subtle",
        atmosphere: "dust",
        chapterCards: true,
      }),
    },
    prompts: [
      {
        key: "article",
        kind: "article",
        name: "History · Documentary",
        body: [
          "Write a documentary narration about {{topic}}.",
          "",
          "Length: 2000-2400 words.",
          "",
          "Tone: vivid and curious, like a good museum guide who loves the subject. Explain terms the first time they appear. Avoid modern slang and avoid judging the past by today's words without saying so.",
          "",
          "Shape:",
          "- Open in a specific scene: a place, a year and a person doing something.",
          "- Then the background a newcomer needs, in a few paragraphs.",
          "- The main story in order, with the causes and consequences made clear.",
          "- A section on how we know: the sources, what archaeology or documents show, and what historians still argue about.",
          "- Close with what changed because of it and what survives today.",
          "- Six to nine sections with short headings.",
          "",
          "Accuracy: stay with what the research notes and mainstream scholarship support. Give dates where they matter. Mark legends as legends and estimates as estimates. Never invent quotations.",
          "",
          "Return only the narration in Markdown: headings and prose. No title page and no source list.",
        ].join("\n"),
      },
      {
        key: "shortScript",
        kind: "article",
        name: "History · 60-second short",
        body: [
          "Subject: one surprising, true story or detail about {{topic}}.",
          "",
          scriptRules,
          "- Put the year and the place in the first two sentences.",
        ].join("\n"),
      },
      {
        key: "image",
        kind: "image",
        name: "History · Scene",
        body: [
          "A historically grounded illustration of {{topic}}: period-accurate clothing, architecture, tools and landscape.",
          "Rich painterly realism in the manner of a museum reconstruction, warm golden light, earthy ochre, umber and faded blue palette.",
          "Wide establishing views and mid shots of daily life; figures shown at a distance or from behind rather than as portraits of real people.",
          noText,
        ].join(" "),
      },
      {
        key: "thumbnail",
        kind: "thumbnail",
        name: "History · Thumbnail",
        body: [
          "A dramatic, detailed painting that sums up {{topic}} in one moment: one clear focal subject, strong light from one side, dust or smoke in the air.",
          "Warm ochre and deep blue palette, high contrast, simple composition that reads at phone size.",
          noText,
        ].join(" "),
      },
      {
        key: "description",
        kind: "description",
        name: "History · Description",
        body: [
          "Write a YouTube description for a history documentary about {{topic}}.",
          "",
          "- Summary: 2-3 sentences that name the period and place and say what the viewer will understand by the end.",
          "- Chapters: one per section of the narration, 2-6 words each, in title case.",
          "- Hashtags: 3-5 about the period and subject, most specific last.",
          "- Tags: 15-25 search terms for the event, the people, the place, the century and history documentaries.",
        ].join("\n"),
      },
      {
        key: "shorts",
        kind: "shorts",
        name: "History · Shorts",
        body: shortsRules(
          "Prefer little-known facts, turning points and vivid scenes over dates and summaries.",
        ),
      },
    ],
  },
  {
    id: "science",
    name: "Science explainers",
    summary: "Clear, friendly explanations of how the world works, one idea at a time.",
    voice: {
      provider: "openai-tts",
      model: "gpt-4o-mini-tts",
      voiceId: "nova",
      name: "Science narrator (bright)",
    },
    style: {
      research: true,
      expectedWords: 1600,
      imagesPerVideo: 14,
      imageSeconds: 9,
      zoomPercent: 15,
      motionStyle: "zoom",
      captions: { fontSize: 50, position: "bottom" },
      videoEdit: look("cold", { transition: "slide", transitionSeconds: 0.6 }),
    },
    prompts: [
      {
        key: "article",
        kind: "article",
        name: "Science · Explainer",
        body: [
          "Write an explainer video narration about {{topic}} for curious viewers with no science background.",
          "",
          "Length: 1400-1800 words.",
          "",
          "Tone: friendly, clear and precise. Enthusiastic without hype. Use 'we' for shared discovery.",
          "",
          "Shape:",
          "- Open with an everyday observation or a puzzling question the topic answers.",
          "- Build the idea step by step: each section adds one concept and ends where the next begins.",
          "- Use one concrete analogy per hard idea, then say where the analogy breaks down.",
          "- Give real numbers with units and a comparison that makes them graspable.",
          "- A short section on what scientists still don't know or are testing now.",
          "- Close by returning to the opening question, answered.",
          "- Five to seven sections with short headings.",
          "",
          "Accuracy: follow the research notes and the current scientific consensus. Separate established results from hypotheses. Do not invent studies, figures or quotations.",
          "",
          "Return only the narration in Markdown: headings and prose. No title page and no source list.",
        ].join("\n"),
      },
      {
        key: "shortScript",
        kind: "article",
        name: "Science · 60-second short",
        body: [
          "Subject: one mind-bending but true fact about {{topic}}, and why it is so.",
          "",
          scriptRules,
          "- Give one real number with its unit and a comparison that makes it graspable.",
        ].join("\n"),
      },
      {
        key: "image",
        kind: "image",
        name: "Science · Visual",
        body: [
          "A clean, striking visual that explains an aspect of {{topic}}.",
          "Modern 3D-rendered or macro-photography look, crisp detail, dark background with vivid cyan, magenta and amber accents, soft rim light.",
          "One clear subject, scientifically plausible shapes and scales, generous negative space.",
          noText,
        ].join(" "),
      },
      {
        key: "thumbnail",
        kind: "thumbnail",
        name: "Science · Thumbnail",
        body: [
          "A bold, eye-catching image about {{topic}}: one surprising subject, glowing against a deep dark background.",
          "Saturated cyan and amber, strong contrast, simple composition that reads at phone size.",
          noText,
        ].join(" "),
      },
      {
        key: "description",
        kind: "description",
        name: "Science · Description",
        body: [
          "Write a YouTube description for a science explainer about {{topic}}.",
          "",
          "- Summary: 2-3 sentences that pose the question and promise a clear answer, without exaggeration.",
          "- Chapters: one per step of the explanation, 2-6 words each.",
          "- Hashtags: 3-5 about the field and the topic, most specific last.",
          "- Tags: 15-25 search terms, from the broad field to the specific phenomenon.",
        ].join("\n"),
      },
      {
        key: "shorts",
        kind: "shorts",
        name: "Science · Shorts",
        body: shortsRules("Prefer the most surprising facts and the clearest 'aha' explanations."),
      },
    ],
  },
];

// What "Make a 60-second short" installs when no pack is picked.
export const starterSet: StarterPack = {
  id: "starter",
  name: "Starter",
  summary: "What a first short uses when no pack is picked.",
  voice: {
    provider: "openai-tts",
    model: "gpt-4o-mini-tts",
    voiceId: "alloy",
    name: "Starter narrator",
  },
  style: {
    research: false,
    expectedWords: 150,
    imagesPerVideo: 4,
    imageSeconds: 15,
    zoomPercent: 15,
    motionStyle: "zoom",
    captions: { fontSize: 48, position: "bottom" },
    videoEdit: defaultVideoEdit,
  },
  prompts: [
    {
      key: "shortScript",
      kind: "article",
      name: "Starter · 60-second short",
      body: ["Subject: {{topic}}.", "", scriptRules].join("\n"),
    },
    {
      key: "image",
      kind: "image",
      name: "Starter · Vertical scene",
      body: [
        "A cinematic vertical image about {{topic}}.",
        "Rich colour, dramatic light, one clear subject large in the frame so it reads on a phone.",
        "Keep the lower half calm: captions are drawn over it.",
        noText,
      ].join(" "),
    },
  ],
};

export function packById(id: string): StarterPack | undefined {
  return id === starterSet.id ? starterSet : starterPacks.find((pack) => pack.id === id);
}
