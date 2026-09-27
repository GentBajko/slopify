import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { useCommand } from "@/components/kit/command-palette";
import { tutorialsQuery } from "./api.js";

// Ctrl+K → "Open tutorial: Schedules", one per page of Help → Tutorials. Searched, not
// listed: fifty pages would bury the screen's own commands in an empty palette.
export function TutorialCommands(): ReactElement {
  const { api } = useApp();
  const index = useQuery(tutorialsQuery(api));
  return (
    <>
      {(index.data?.pages ?? []).map((page) => (
        <OpenTutorialCommand key={page.id} id={page.id} title={page.title} />
      ))}
    </>
  );
}

function OpenTutorialCommand({ id, title }: { readonly id: string; readonly title: string }): null {
  const navigate = useNavigate();
  useCommand({
    id: `tutorial.open.${id}`,
    title: `Open tutorial: ${title}`,
    group: "Tutorials",
    keywords: ["help", "guide", "wiki", "docs", "how"],
    searchOnly: true,
    run: () => {
      void navigate({ to: "/help/tutorials/$page", params: { page: id } });
    },
  });
  return null;
}
