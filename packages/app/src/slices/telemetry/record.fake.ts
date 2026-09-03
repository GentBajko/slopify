import type { RecordEvent, TelemetryCounters, TelemetryEventType } from "./model.js";

// The recorder a stage test is handed in place of the real one. It keeps what the stage
// counted and writes no row, so a slice test can assert the counters without a database or
// the queue behind them. The tests that need the row as well - the privacy sweep, the Usage
// totals - use `record` itself.

export interface CountedEvent {
  readonly type: TelemetryEventType;
  readonly counters: TelemetryCounters;
}

export interface Counted {
  readonly count: RecordEvent;
  readonly events: () => readonly CountedEvent[];
}

export function recordingCounter(): Counted {
  const events: CountedEvent[] = [];
  return {
    count: (type: TelemetryEventType, counters: TelemetryCounters): void => {
      events.push({ type, counters });
    },
    events: (): readonly CountedEvent[] => events,
  };
}
