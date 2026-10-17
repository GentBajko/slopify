// The keywords themselves, in the order the Insert bar and the wiki list them.

import type { KeywordPlace, KeywordSpec } from "./model.js";
import { keywordPlaces } from "./model.js";

const everywhere: readonly KeywordPlace[] = keywordPlaces.filter((place) => place !== "title");
const afterArticle: readonly KeywordPlace[] = everywhere.filter(
  (place) => place !== "article" && place !== "script",
);
const pictures: readonly KeywordPlace[] = ["image", "thumbnail"];
const fromDigest: readonly KeywordPlace[] = [
  "image",
  "thumbnail",
  "description",
  "shorts",
  "review",
];
const atStart = "When the run starts; later changes don't change this project.";
const digestAvailable =
  "Once the article is written: one shared AI call writes every digest keyword the run uses.";
const sceneAvailable =
  "Once the article is written: the scenes call writes one for each picture, even with Scenes from the article off.";

export const keywordSpecs: readonly KeywordSpec[] = [
  {
    name: "Slopify_Title",
    filler: "facts",
    fills: "The video's title, with its keywords filled in.",
    example: "The Fall of the Silver City",
    available: atStart,
    places: everywhere,
    cost: "free",
    batch: 1,
  },
  {
    name: "Slopify_Channel",
    filler: "facts",
    fills: "The name of the project's channel.",
    example: "Night Archive",
    available: atStart,
    places: everywhere,
    cost: "free",
    batch: 1,
  },
  {
    name: "Slopify_Series",
    filler: "facts",
    fills:
      "The channel's series brief from Channels → Edit. A line with an empty brief is left out.",
    example: "Calm retellings of old legends, one city at a time.",
    available: atStart,
    places: everywhere,
    cost: "free",
    batch: 2,
  },
  {
    name: "Slopify_Chapters",
    filler: "chapters",
    fills: "The article's chapter titles, one per line.",
    example: "The founding\nThe long siege\nWhat was left",
    available: "Once the article is written, so never in the Article or Script prompt.",
    places: afterArticle,
    cost: "free",
    batch: 1,
  },
  {
    name: "Slopify_Links",
    filler: "facts",
    fills:
      "The channel's links, one per line as name and address. In a Description prompt they stay links the page fills when it shows the description.",
    example: "Website: https://example.com\nPatreon: https://patreon.com/example",
    available: atStart,
    places: everywhere,
    cost: "free",
    batch: 1,
  },
  {
    name: "Slopify_Previous_Video",
    filler: "facts",
    fills:
      "The title and link of the channel's previous video in the same series. A line with none is left out; in a Description prompt it stays the Previous video link.",
    example: "The Drowned Library – https://youtu.be/abc123",
    available: atStart,
    places: everywhere,
    cost: "free",
    batch: 1,
  },
  {
    name: "Slopify_Next_Video",
    filler: "facts",
    fills:
      "The title of the next planned video in the same series and posting plan line. A line with none is left out; in a Description prompt it stays the Next video link.",
    example: "The Glass Queen",
    available: atStart,
    places: everywhere,
    cost: "free",
    batch: 1,
  },
  {
    name: "Slopify_Release_Date",
    filler: "release",
    fills:
      "The release date from the posting plan. A line with no date is left out; moving the date later doesn't remake anything.",
    example: "Thursday 22 October 2026",
    available: "When the step runs.",
    places: everywhere,
    cost: "free",
    batch: 2,
  },
  {
    name: "Slopify_Episode",
    filler: "facts",
    fills: "This video's number in its series on the channel.",
    example: "7",
    available: atStart,
    places: everywhere,
    cost: "free",
    batch: 2,
  },
  {
    name: "Slopify_Duration",
    filler: "duration",
    fills: "The finished video's length.",
    example: "42 min 10 s",
    available: "Once the narration is finished.",
    places: ["description", "shorts", "review"],
    cost: "free",
    batch: 2,
  },
  {
    name: "Slopify_Cast",
    filler: "facts",
    fills:
      "The channel's cast members, each with their description. A line with no cast is left out.",
    example: "Mira: a tall archivist with a silver lantern",
    available: atStart,
    places: everywhere,
    cost: "free",
    batch: 2,
  },
  {
    name: "Slopify_Covered_Before",
    filler: "facts",
    fills:
      "The titles of the videos the channel already made, so the article avoids repeating them. A line with none is left out.",
    example: "The Drowned Library\nThe Iron Bridge",
    available: atStart,
    places: everywhere,
    cost: "free",
    batch: 2,
  },
  {
    name: "Slopify_Brand",
    filler: "facts",
    fills:
      "The brand kit's caption and title colours and font names. A line with an empty kit is left out.",
    example: "Colours: #f5c542, #101010. Fonts: Barlow Condensed",
    available: atStart,
    places: pictures,
    cost: "free",
    batch: 2,
  },
  {
    name: "Slopify_Summary",
    filler: "digest",
    fills: "Two or three sentences on what the video covers.",
    example: "How a city of silver fell in one winter, and what its last archivist saved.",
    available: digestAvailable,
    places: fromDigest,
    cost: "digest",
    batch: 1,
  },
  {
    name: "Slopify_Hook",
    filler: "digest",
    fills: "The video's most click-worthy idea.",
    example: "The city wasn't conquered. It was sold.",
    available: digestAvailable,
    places: fromDigest,
    cost: "digest",
    batch: 1,
  },
  {
    name: "Slopify_Thumbnail_Text",
    filler: "digest",
    fills: "Two to four words to put on the thumbnail.",
    example: "SOLD FOR SILVER",
    available: digestAvailable,
    places: fromDigest,
    cost: "digest",
    batch: 1,
  },
  {
    name: "Slopify_Key_Facts",
    filler: "digest",
    fills: "Three to five striking facts from the article, one per line.",
    example: "The walls stood 40 feet high.\nThe siege lasted 90 days.",
    available: digestAvailable,
    places: fromDigest,
    cost: "digest",
    batch: 2,
  },
  {
    name: "Slopify_Quote",
    filler: "digest",
    fills: "One quotable line from the article.",
    example: "Silver buys everything except time.",
    available: digestAvailable,
    places: fromDigest,
    cost: "digest",
    batch: 2,
  },
  {
    name: "Slopify_Tags",
    filler: "digest",
    fills: "Search terms for the video, separated by commas.",
    example: "lost cities, legends, siege, history for sleep",
    available: digestAvailable,
    places: fromDigest,
    cost: "digest",
    batch: 2,
  },
  {
    name: "Slopify_Scene",
    filler: "scenes",
    fills: "What this picture shows: a moment of the article, written for each picture.",
    example: "The archivist climbs the burning stair, a lantern held high.",
    available: sceneAvailable,
    places: pictures,
    cost: "scenes",
    legacy: "Scene",
    batch: 1,
  },
  {
    name: "Slopify_Setting",
    filler: "scenes",
    fills: "The era and place of this picture's moment, so it stays period-correct.",
    example: "A walled river city, late medieval, early winter",
    available: sceneAvailable,
    places: pictures,
    cost: "scenes",
    batch: 1,
  },
  {
    name: "Slopify_Mood",
    filler: "scenes",
    fills: "The feeling of this picture's moment, for its light and colour.",
    example: "tense",
    available: sceneAvailable,
    places: pictures,
    cost: "scenes",
    batch: 2,
  },
  {
    name: "Slopify_Appearance",
    filler: "appearance",
    fills: "How the video's subject and the characters in this picture look, looked up on the web.",
    example: "Mira: a tall woman in a grey archivist's coat, silver lantern at her belt.",
    available: "Once the article is written: one AI call with web search looks them up.",
    places: pictures,
    cost: "appearance",
    legacy: "Appearance",
    batch: 1,
  },
];

export const keywordNames: readonly string[] = keywordSpecs.map((spec) => spec.name);
export const legacyNames: readonly string[] = keywordSpecs.flatMap((spec) =>
  spec.legacy === undefined ? [] : [spec.legacy],
);

// The keyword a slot name stands for: its own name, or Scene's and Appearance's old ones. Names
// are case-sensitive, like every slot name.
export function keywordOf(name: string): KeywordSpec | undefined {
  return keywordSpecs.find((spec) => spec.name === name || spec.legacy === name);
}

export function keywordsFor(place: KeywordPlace): readonly KeywordSpec[] {
  return keywordSpecs.filter((spec) => spec.places.includes(place));
}
