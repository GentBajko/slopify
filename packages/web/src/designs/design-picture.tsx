import type { DesignStep, DesignView } from "@app/slices/designs/model.js";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { List, ListRow } from "@/components/kit/list-row";
import { MediaFrame } from "@/components/kit/media";
import { SectionHead } from "@/components/kit/section-head";
import { Status } from "@/components/kit/status";
import { Segmented } from "@/components/kit/switch";
import { stepPictureUrl } from "./api";

// The picture of a design, framed, with Before and After for an edit, and every version under
// it: what each asked for, and "Continue from here" to take the next edit from that version.

export function headStep(design: DesignView): DesignStep | undefined {
  return design.steps.find((step) => step.id === design.headStepId);
}

function aspectOf(step: DesignStep | undefined): "landscape" | "portrait" | "square" {
  if (step?.width == null || step.height == null) return "landscape";
  const ratio = step.width / step.height;
  return ratio > 1.15 ? "landscape" : ratio < 0.87 ? "portrait" : "square";
}

// A tall or square picture is kept to the window's height.
const frameWidth = {
  landscape: "",
  portrait: "max-w-[calc(70vh*0.5625)]",
  square: "max-w-[70vh]",
} as const;

const kindWords: Readonly<Record<DesignStep["kind"], string>> = {
  upload: "Your picture",
  edit: "Edit",
  generate: "Artwork",
};

export function DesignPicture({
  design,
  pending,
  onContinue,
  onRetry,
}: {
  readonly design: DesignView;
  readonly pending: boolean;
  readonly onContinue: (stepId: string) => void;
  readonly onRetry: (stepId: string) => void;
}): ReactElement {
  const { api } = useApp();
  const head = headStep(design);
  const parent =
    head?.parentId == null ? undefined : design.steps.find((step) => step.id === head.parentId);
  const [side, setSide] = useState<"before" | "after">("after");
  const shown = side === "before" && parent?.sha256 != null ? parent : head;
  const making = design.steps.find((step) => step.state === "making");
  return (
    <section aria-label="Picture" className="flex min-w-0 flex-col gap-4">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Show"
          tip="library.design.show"
          value={shown === parent && parent !== undefined ? "before" : "after"}
          options={[
            { value: "before", label: "Before", disabled: parent?.sha256 == null },
            { value: "after", label: "After" },
          ]}
          onChange={setSide}
        />
        {making === undefined ? null : (
          <Status tone="running">{`Making version ${String(making.n)}`}</Status>
        )}
      </div>
      <MediaFrame
        aspect={aspectOf(shown)}
        alt={
          shown === undefined ? "No picture yet" : `Version ${String(shown.n)} of ${design.name}`
        }
        {...(shown?.sha256 == null ? {} : { src: stepPictureUrl(api, design.id, shown.id) })}
        {...(shown === undefined
          ? {
              generating:
                making === undefined
                  ? "No picture yet: press Make artwork."
                  : "Making the artwork…",
            }
          : {})}
        title={
          shown === undefined ? undefined : `Version ${String(shown.n)} · ${kindWords[shown.kind]}`
        }
        meta={
          shown?.width == null || shown.height == null
            ? undefined
            : `${String(shown.width)} × ${String(shown.height)}`
        }
        className={`mx-auto w-full [&_img]:object-contain ${frameWidth[aspectOf(shown)]}`}
      />
      <SectionHead
        as="h3"
        size="small"
        title="Versions"
        meta="Every version is kept. The next edit starts from the one marked current."
      />
      <List label="Versions">
        {[...design.steps].reverse().map((step) => (
          <ListRow
            key={step.id}
            lead={
              step.sha256 == null ? (
                <span className="inline-block size-12 shrink-0 rounded-control bg-raised" />
              ) : (
                <img
                  src={stepPictureUrl(api, design.id, step.id)}
                  alt=""
                  className="size-12 shrink-0 rounded-control border border-line object-cover"
                />
              )
            }
            title={`Version ${String(step.n)} · ${kindWords[step.kind]}${step.id === design.headStepId ? " · current" : ""}`}
            meta={
              step.state === "making"
                ? "Being made…"
                : step.state === "failed"
                  ? (step.error ?? "This version failed.")
                  : (step.instruction ?? undefined)
            }
            actions={
              step.state === "failed" ? (
                <Button size="small" disabled={pending} onClick={() => onRetry(step.id)}>
                  Try again
                </Button>
              ) : (
                <Button
                  size="small"
                  disabled={pending || step.id === design.headStepId || step.state !== "ready"}
                  disabledReason={
                    step.id === design.headStepId
                      ? "The next edit already starts from this version."
                      : "This version has no picture yet."
                  }
                  onClick={() => onContinue(step.id)}
                >
                  Continue from here
                </Button>
              )
            }
          />
        ))}
      </List>
    </section>
  );
}
