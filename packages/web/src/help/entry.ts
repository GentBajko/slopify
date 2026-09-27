// One answer behind an info button. `title` names the thing (the button reads "About {title}");
// `body` says, in plain words and exact numbers, what it does, when to change it, the default,
// and what it costs or slows. Second person, no jargon without a gloss, about 60 words at most.
// Paragraphs are separated by a blank line. `{name}` is filled from the tip's `vars`.
export interface HelpEntry {
  readonly title: string;
  readonly body: string;
}
