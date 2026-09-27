import { FilmIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { fileUrl } from "@/api";
import { useApp } from "@/app-context";
import { cn } from "@/lib/utils";

// A project's thumbnail in a fixed 16:9 frame, or a quiet well with the film mark while it has
// none (not made yet, or the run makes no thumbnail). Decorative: the row names the project.
export function ProjectThumb({
  projectId,
  className,
}: {
  readonly projectId: string;
  readonly className?: string;
}): ReactElement {
  const { api } = useApp();
  const [missing, setMissing] = useState(false);
  return (
    <div className={cn("sl-media__frame", className)} aria-hidden="true">
      {missing ? (
        <div className="flex size-full items-center justify-center bg-sunken text-ink-3">
          <FilmIcon strokeWidth={1.75} className="size-6" />
        </div>
      ) : (
        <img
          src={fileUrl(api, projectId, "thumbnail")}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setMissing(true)}
        />
      )}
    </div>
  );
}
