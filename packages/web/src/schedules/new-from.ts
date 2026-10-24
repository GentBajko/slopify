import { intents, requestIntent } from "@/lib/intents";

// New schedule asked for from another screen (a template's row on its channel's page, the
// calendar): the Schedules tab opens its form, on that template when one is named.
export function requestNewSchedule(templateId?: string): void {
  requestIntent(intents.newSchedule, templateId);
}
