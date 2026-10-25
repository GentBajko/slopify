import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { ButtonRow } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { categoryOf } from "@/lib/entry-options";
import { kindOf } from "@/lib/prompt-kinds";
import { cn } from "@/lib/utils";

// The pages that hold what a video is made from: Prompts (with intros and outros), Templates
// and Designs, PDF looks, Pronunciation and What worked on YouTube. There is no Library page:
// each is reached on its own (the rail, Settings, a channel) and draws its own header, and each
// is found by name in Ctrl+K from anywhere (components/shell-commands.tsx). This layout only
// keeps New prompt and New intro or outro in Ctrl+K while one of them is open.
export function LibraryLayout(): ReactElement {
  return (
    <>
      <LibraryCommands />
      <Outlet />
    </>
  );
}

// The frequent actions in Ctrl+K: a new prompt, intro or outro (on the kind or list showing).
// Open Prompts and Open Templates are the rail's own (components/shell-commands.tsx), listed
// once.
function LibraryCommands(): null {
  const navigate = useNavigate();
  const location = useRouterState({ select: (state) => state.location });
  const search = location.search as Readonly<Record<string, unknown>>;
  const kind = kindOf(location.pathname === "/prompts" ? search.kind : undefined);
  const category = categoryOf(location.pathname === "/entries" ? search.category : undefined);
  useCommand({
    id: "library.new-prompt",
    title: "New prompt",
    group: "Prompts",
    keywords: ["create", "article", "image", "thumbnail"],
    run: () => {
      void navigate({ to: "/prompts/new", search: { kind } });
    },
  });
  useCommand({
    id: "library.new-entry",
    title: `New ${category}`,
    group: "Prompts",
    keywords: ["create", "intro", "outro"],
    run: () => {
      void navigate({ to: "/entries/new", search: { category } });
    },
  });
  return null;
}

// The row a list page opens with: its filters on the left, its actions on the right. On a
// phone the actions wrap under the filters.
export function LibraryToolbar({
  children,
  action,
  className,
}: {
  readonly children?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      data-slot="library-toolbar"
      className={cn("mb-4 flex min-h-9 flex-wrap items-center gap-x-4 gap-y-3", className)}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">{children}</div>
      {action === undefined ? null : <ButtonRow className="ml-auto shrink-0">{action}</ButtonRow>}
    </div>
  );
}
