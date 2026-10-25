import { type ReactElement, useEffect, useRef, useState } from "react";
import { Button, ButtonRow } from "@/components/kit/button";
import { Field, HelpLine, Textarea } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";

// The passage of the narration a line was spoken in: the words the voice read in one go, the
// key the project's settings know it by, and how many voice calls reading it again takes.
export interface Passage {
  readonly key: string;
  readonly text: string;
  readonly calls: number;
  // The whole narration is one passage: reading it again reads all of it.
  readonly whole: boolean;
}

// Fix this line, in place under the line's paragraph: the passage's words to correct, and one
// button that has the passage read again, with the corrected words or as it is. It saves a
// version and starts at once; the old narration stays under Versions.
export function LineFix({
  passage,
  line,
  onMake,
  onClose,
}: {
  readonly passage: Passage;
  // The words of the line pressed, selected in the box so the person sees where it is.
  readonly line: string;
  readonly onMake: (words: string) => void;
  readonly onClose: () => void;
}): ReactElement {
  const [words, setWords] = useState(passage.text);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const field = box.current;
    if (field === null) return;
    field.focus();
    const at = passage.text.indexOf(line.trim());
    if (at !== -1) field.setSelectionRange(at, at + line.trim().length);
  }, [passage.text, line]);
  const changed = words.trim() !== passage.text.trim();
  const calls = `${String(passage.calls)} voice ${passage.calls === 1 ? "call" : "calls"}`;
  return (
    <fieldset
      aria-label="Fix this line"
      className="m-0 flex w-full min-w-0 max-w-[68ch] flex-col gap-2 rounded-control border border-line-strong p-3"
      {...helpScope}
    >
      <Field
        label={passage.whole ? "The narration's words" : "The words of this passage"}
        help={
          passage.whole
            ? "This narration is read in one piece, so the voice reads all of it again. Correct the words, or leave them to have it read again."
            : "The line you pressed is selected; the voice reads the whole passage again. Correct the words, or leave them to have it read again."
        }
      >
        <Textarea
          ref={box}
          value={words}
          rows={Math.min(8, Math.max(3, Math.ceil(passage.text.length / 80)))}
          onChange={(event) => setWords(event.target.value)}
        />
      </Field>
      <ButtonRow>
        <Button onClick={() => onMake(words)}>
          {changed
            ? `Make this passage again with your words · ${calls}`
            : `Make this passage again · ${calls}`}
        </Button>
        {changed ? (
          <Button variant="quiet" onClick={() => setWords(passage.text)}>
            Undo my changes
          </Button>
        ) : null}
        <Button variant="quiet" onClick={onClose}>
          Close
        </Button>
      </ButtonRow>
      <HelpLine>
        The voice service's price isn't known in advance. The video keeps the current narration
        until you make it again (free), and the old narration stays under Versions.
      </HelpLine>
    </fieldset>
  );
}
