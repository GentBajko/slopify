import type { StageKind } from "@app/kernel/pipeline.js";
import { sourceOf } from "@app/slices/admission/model.js";
import type { RevisionView } from "@app/slices/revisions/model.js";
import type { ReactNode } from "react";
import { useContext, useState } from "react";
import { ConfirmDialog } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Destructive } from "./confirmations.js";
import { confirmationFor } from "./confirmations.js";
import { RevisionControlContext } from "./revision-action-context.js";
import { useCurrentRevisionView } from "./revision-media.js";

// A control that stops and confirms. Every destructive action on this page goes through it, so
// none of them can be wired straight to a click by accident.

// Presentation eligibility only; the server remains authoritative for every rerun.
export function canRerunSection(view: RevisionView, stage: StageKind): boolean {
  const { config, content, fingerprints } = view.revision;
  switch (stage) {
    case "research":
      return config.sources.research === "generate";
    case "article":
      return config.sources.article === "generate" && !content.articleEdited;
    case "audio":
      return (
        config.sources.audio === "generate" &&
        Object.keys(fingerprints).some((key) => {
          if (
            !/^audio:(body:.+|intro|outro):[0-9]+$/.test(key) &&
            !/^audio:(body|intro|outro):future$/.test(key)
          )
            return false;
          return !Object.entries(content.narrationOverrides).some(
            ([logical, override]) =>
              override.kind === "asset" && (key === logical || key.startsWith(`${logical}:`)),
          );
        })
      );
    case "images":
      return (
        config.sources.images !== "off" &&
        content.imageOrder.some((key) => content.imageDefinitions[key]?.source === "generate")
      );
    case "thumbnail":
      return (
        config.sources.thumbnail === "from_prompt" || config.sources.thumbnail === "prompt_by_llm"
      );
    case "video":
      return config.sources.video !== "off" || config.sources.audio !== "off";
    case "document":
      return sourceOf(config.sources, "document") === "generate";
  }
}

export function ConfirmedButton({
  action,
  run,
  disabled = false,
  pending = false,
  variant = "outline",
  className,
  children,
}: {
  readonly action: Destructive;
  readonly run: () => void;
  readonly disabled?: boolean;
  readonly pending?: boolean;
  readonly variant?: "outline" | "ghost";
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  const copy = confirmationFor(action);
  const revisioned = useContext(RevisionControlContext);
  const view = useCurrentRevisionView();
  if (
    revisioned &&
    action.kind !== "cancel" &&
    !(action.kind === "rerun" && view !== undefined && canRerunSection(view, action.stage))
  )
    return null;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        disabled={disabled || pending}
        className={cn(variant === "ghost" ? "px-2 text-small" : undefined, className)}
        onClick={() => {
          setAsking(true);
        }}
      >
        {children}
      </Button>
      <ConfirmDialog
        open={asking}
        title={copy.title}
        consequence={copy.consequence}
        verb={copy.verb}
        dismiss={copy.dismiss}
        pending={pending}
        onConfirm={() => {
          setAsking(false);
          run();
        }}
        onCancel={() => {
          setAsking(false);
        }}
      />
    </>
  );
}
