import type { HelpEntry } from "../entry.js";

// Templates → Edit template: the settings whose consequence needs a paragraph, in the Compare
// models drawer and wherever a price includes steps with no known price.

const studio = (anchor: string) => ({ page: "Template-Studio", anchor });

export const templateStudioHelp = {
  "template-studio.compare-provider": {
    title: "Service to compare",
    body: "Whose model to try. Services you haven't set up are greyed with the reason; set one up in Settings → Keys & services. Voice models are compared within the template's voice service, because a voice is chosen per service.",
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
} as const satisfies Readonly<Record<string, HelpEntry>>;
