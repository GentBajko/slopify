import type { Speaker } from "./model.js";
import type { Script } from "./script.js";

// What each speaker reads in an audition: their first line of the script, cut at a sentence
// end near 200 characters, or a sample line in their name while there is no script yet.
export const auditionLineMax = 300;

export function auditionLine(speaker: Speaker, script?: Script): string {
  const first = script?.turns.find((turn) => turn.speaker === speaker.id)?.text;
  const text = first ?? sampleLine(speaker);
  if (text.length <= 200) return text;
  const cut = text.slice(0, 200);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return end > 60 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

function sampleLine(speaker: Speaker): string {
  const name = speaker.name.trim() || "your speaker";
  switch (speaker.role) {
    case "narrator":
      return `The night was quiet, and the old house held its breath. I'm ${name}, and I'll be telling this story.`;
    case "host":
      return `Hi everyone, I'm ${name}, and welcome back to the show. Today's topic is a good one.`;
    case "guest":
      return `Thanks for having me. I'm ${name}, and I've been looking forward to this conversation.`;
    case "character":
      return `You really thought I wouldn't find out? My name is ${name}, and I always find out.`;
  }
}
