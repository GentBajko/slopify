import { ChevronRightIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Callout } from "@/components/kit/callout";

// The Library editors' frame (prompt, intro/outro, document theme): one surface for the form,
// whose sticky Save bar is `EditorActions`, and a plain column beside it on a wide screen.
// The 18 px padding is the one `EditorActions` bleeds out of to reach the surface's edges.
export const editorSurface = "rounded-media border border-line bg-surface p-[18px]";
export const editorAside = "flex min-w-0 flex-col gap-3 pt-1 lg:sticky lg:top-16";

// "Library › Prompts" above an editor's title: the way back to the tab it was opened from.
export function EditorCrumb({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <>
      <span>Library</span>
      <ChevronRightIcon aria-hidden="true" />
      {children}
    </>
  );
}

// What an editor shows instead of its form when there is no row to edit: what failed and why,
// and the way back to its Library tab.
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
