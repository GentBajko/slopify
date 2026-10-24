import { intents, requestIntent } from "@/lib/intents";

// New schedule asked for from another screen (a template's row on its channel's page): the
// Schedules tab opens its form, on that template when one is named. The template waits here
// until the form takes it, once.
let pending: string | undefined;

export function requestNewSchedule(templateId?: string): void {
  pending = templateId;
  requestIntent(intents.newSchedule);
}

export function takeNewScheduleTemplate(): string | undefined {
  const templateId = pending;
  pending = undefined;
  return templateId;
}
