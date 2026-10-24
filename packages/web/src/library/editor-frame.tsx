import { ChevronRightIcon } from "lucide-react";
import { Children, type ReactElement, type ReactNode } from "react";
import { Callout } from "@/components/kit/callout";

// The editors' frame (prompt, intro/outro, PDF theme): the form straight on the page, its
// sections separated by space rather than a box, `EditorActions` as its Save bar pinned to the
// bottom of the window, and a plain column beside it on a wide screen.
export const editorSurface = "pt-1";
export const editorAside = "flex min-w-0 flex-col gap-3 pt-1 lg:sticky lg:top-4";

// "Prompts › Article" above an editor's title: the way back to the list it was opened from,
// each part a link or a word.
export function EditorCrumb({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <>
      {Children.toArray(children).flatMap((part, index) =>
        index === 0
          ? [part]
          : [<ChevronRightIcon key={`after-${String(index)}`} aria-hidden="true" />, part],
      )}
    </>
  );
}

// What an editor shows instead of its form when there is no row to edit: what failed and why,
// and the way back to its list.
export function EditorProblem({
  children,
  back,
}: {
  readonly children: string;
  readonly back: ReactNode;
}): ReactElement {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-3">
      <Callout tone="danger" title="This can't be opened.">
        {children}
      </Callout>
      <p className="m-0 text-small text-accent-ink underline underline-offset-[3px]">{back}</p>
    </div>
  );
}
