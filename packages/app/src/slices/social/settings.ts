import { type PostChoice, type SocialSettings, socialPlatforms } from "./model.js";

// The settings as a run keeps them: only the sites turned on, each without a prompt name its
// text source doesn't use or a custom text it doesn't post. None turned on is undefined, so a
// draft without posting converts to the run it always did.
export function socialOfForm(form: SocialSettings | undefined): SocialSettings | undefined {
  if (form === undefined) return undefined;
  const kept: { [P in (typeof socialPlatforms)[number]]?: PostChoice } = {};
  for (const platform of socialPlatforms) {
    const choice = form[platform];
    if (choice === undefined) continue;
    const { prompt, custom, ...rest } = choice;
    kept[platform] = {
      ...rest,
      ...(choice.text === "prompt" && prompt?.trim() ? { prompt: prompt.trim() } : {}),
      ...(choice.text === "custom" && custom !== undefined ? { custom } : {}),
    };
  }
  return Object.keys(kept).length === 0 ? undefined : kept;
}
