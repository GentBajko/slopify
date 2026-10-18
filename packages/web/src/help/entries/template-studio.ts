import type { HelpEntry } from "../entry.js";

// Library → Templates → Open studio: a template set up section by section with live samples,
// and what travels with it (packs) or is compared on it (Compare models).

const studio = (anchor: string) => ({ page: "Template-Studio", anchor });

export const templateStudioHelp = {
  "templates.import-pack": {
    title: "Import template pack",
    body: "Makes a new template from a template pack, the .zip made by Export pack in a template's studio. Its prompts and intros join your Library; a name you already use for other text comes in as \"name (2)\". It opens in its studio with the pack's samples, unchecked: no schedule runs it until you press Mark ready. A pack holding anything that looks like a key is refused.",
    tutorial: { page: "Template-Studio", anchor: "template-packs" },
  },
  "template-studio.export-pack": {
    title: "Export pack",
    body: "Saves the version marked ready as a template pack (.zip) to share: its prompts' and intros' text, the voice it picks, the Look, the PDF theme, and its sample's thumbnail, up to four pictures and its narration. No key, login or file of yours goes in; a template whose text looks like a key is refused.",
    tutorial: { page: "Template-Studio", anchor: "template-packs" },
  },
  "template-studio.pack-samples": {
    title: "Samples from the pack",
    body: "What the person who exported this pack got from it, to look at before you spend anything. They are replaced by your own samples once you press Save, which makes them with your keys and voices.",
    tutorial: { page: "Template-Studio", anchor: "template-packs" },
  },
  "template-studio.compare-models": {
    title: "Compare models",
    body: "Makes this section's sample again with one or two other models, each on a copy of the sample, so you see what each one makes, what it cost and how long it took beside the model in use. Only this section's work runs on each copy. It is priced first and counts against today's sample budget. Your template doesn't change until you press Use this model and Save.",
    tutorial: studio("compare-models"),
  },
  "template-studio.compare-provider": {
    title: "Provider to compare",
    body: "Whose model to try. Providers you haven't set up are greyed with the reason; set one up in Settings → Providers. Voice models are compared within the template's voice provider, because a voice is chosen per provider.",
    tutorial: studio("compare-models"),
  },
  "template-studio.compare-model": {
    title: "Model to compare",
    body: "The model to make this section's sample with. The list shows the models that work for your key or CLI first, with when they were last checked; Show all lists the rest. The model the template uses now is compared from the current sample, so pick another.",
    tutorial: studio("compare-models"),
  },
  "template-studio.accept-unknown": {
    title: "Steps with no known price",
    body: "Some steps have no price in Slopify's model list, so the total above can't include them. Turn this on to accept that and go ahead; whatever they are charged still counts against today's sample budget. Off, nothing with an unknown price is started.",
    tutorial: studio("budget-and-prices"),
  },
  "template-studio.full-script": {
    title: "Write the full script in the sample",
    body: "A sample normally writes the outline and the first chapter only, so a Save costs cents. Turn this on to have the sample write the whole script, priced on the switch; only the script and what is made from it are made again. Your videos always get the full script either way.",
    tutorial: studio("samples"),
  },
  "template-studio.sample-topic": {
    title: "Sample topic",
    body: "What every section's sample is made about. Type one, take the next topic a schedule has queued, or go back to the fixed one (going back is free: the earlier sample is restored). A new topic makes every sample again, priced on Use topic.",
    tutorial: studio("samples"),
  },
  "template-studio.say-it-as": {
    title: "Say it as",
    body: "Names the sample's script says that a voice may get wrong. Play one to hear it, type how it should be said and Save: that writes a Library → Narration aliases row for every project started later, and voices again only the sample's lines that say it, priced on the button. Another word to check adds a name of your own.",
    tutorial: studio("say-it-as"),
  },
  "template-studio.bakeoff-results": {
    title: "Compared models",
    body: "Each model's copy of this section's sample: what it made, what it was charged and how long it took, with the model in use first. Use this model switches the section to it; press Save then to make the template's own sample with it. Discard removes the copies; what they cost today still counts against the budget.",
    tutorial: studio("compare-models"),
  },
} as const satisfies Readonly<Record<string, HelpEntry>>;
