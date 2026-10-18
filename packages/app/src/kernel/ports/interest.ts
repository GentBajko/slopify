// Public search interest in a topic: the search suggestions offered for it and how often its
// Wikipedia article is read. Used only by schedules the person set to rank topics by search
// interest; it sends the topic's title and nothing else. Never a channel's own analytics.

export type InterestResult =
  | {
      readonly ok: true;
      // Up to ten suggestions; null when no suggestion service answered.
      readonly suggestions: readonly string[] | null;
      // Its Wikipedia article's views last month; null without one, or when Wikipedia didn't
      // answer.
      readonly wikiViews: number | null;
    }
  | { readonly ok: false; readonly reason: "offline" | "refused" | "timeout" };

// Never throws: a service that can't be reached is a reading left out, or `ok: false` when
// none answered.
export type TopicInterest = (
  topic: string,
  language: string,
  signal: AbortSignal,
) => Promise<InterestResult>;
