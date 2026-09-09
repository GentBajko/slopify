import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { type Box, spotlightHole, spotlightLayout } from "./spotlight-geometry";
import { useSpotlightInteraction } from "./use-spotlight-interaction";
import { useSpotlightMeasurement } from "./use-spotlight-measurement";

interface SpotlightProps {
  readonly stepId: string;
  readonly target: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly progress: string;
  readonly onNext: () => void;
  readonly onBack?: (() => void) | undefined;
  readonly onClose: () => void;
  readonly nextLabel?: string | undefined;
  readonly nextDisabled?: boolean | undefined;
  readonly onSkip?: (() => void) | undefined;
  readonly skipLabel?: string | undefined;
}

/** A nonmodal guide: the highlighted page controls keep their original DOM, focus and state. */
export function Spotlight({
  stepId,
  target,
  title,
  children,
  progress,
  onNext,
  onBack,
  onClose,
  nextLabel = "Next",
  nextDisabled = false,
  onSkip,
  skipLabel = "Skip this step",
}: SpotlightProps) {
  const id = useId();
  const key = `${stepId}:${target}`;
  const cardRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const measurement = useSpotlightMeasurement(
    key,
    target,
    cardRef,
    titleRef,
    overlayRef,
    spacerRef,
  );
  useSpotlightInteraction(target, onClose, cardRef, titleRef);
  const [scrollReserve, setScrollReserve] = useState({ key, height: 0 });

  const currentTarget = measurement.key === key ? measurement.target : null;
  const viewport = { width: measurement.width, height: measurement.height };
  const card = { width: Math.min(360, viewport.width - 24), height: measurement.cardHeight };
  const layout = spotlightLayout(currentTarget, viewport, card);
  const hole = currentTarget
    ? spotlightHole(currentTarget, viewport, layout.docked ? layout.top - 12 : viewport.height)
    : null;
  const portalHoles =
    measurement.key === key
      ? measurement.portals
          .map((box) => spotlightHole(box, viewport))
          .filter((box): box is Box => box !== null)
      : [];
  const holes = [...(hole ? [hole] : []), ...portalHoles];
  const pointerBoundary =
    `M0 0H${viewport.width}V${viewport.height}H0Z` +
    (hole
      ? `M${hole.left} ${hole.top}H${hole.left + hole.width}V${hole.top + hole.height}H${hole.left}Z`
      : "");
  // Keep any added scrolling room for the remainder of this step. Removing it as the
  // target approaches the page bottom would pull the target back beneath the card.
  useLayoutEffect(() => {
    setScrollReserve((previous) => {
      const height = Math.max(
        previous.key === key ? previous.height : 0,
        layout.docked ? card.height + 24 : 0,
      );
      return previous.key === key && previous.height === height ? previous : { key, height };
    });
  }, [key, layout.docked, card.height]);
  const reserve = scrollReserve.key === key ? scrollReserve.height : 0;

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.scrollPaddingBottom;
    root.style.scrollPaddingBottom = `${reserve}px`;
    return () => {
      root.style.scrollPaddingBottom = previous;
    };
  }, [reserve]);

  return createPortal(
    <>
      <div ref={spacerRef} aria-hidden="true" style={{ height: reserve }} />
      <div
        ref={overlayRef}
        hidden={measurement.modalOpen}
        data-tutorial="spotlight"
        className="pointer-events-none fixed inset-0 z-[100] font-sans"
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          width={viewport.width}
          height={viewport.height}
        >
          <defs>
            <mask id={`${id}-mask`}>
              <rect width="100%" height="100%" fill="white" />
              {holes.map((box) => (
                <rect
                  key={`${box.left}:${box.top}:${box.width}:${box.height}`}
                  x={box.left}
                  y={box.top}
                  width={box.width}
                  height={box.height}
                  rx="6"
                  fill="black"
                />
              ))}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgb(0 0 0 / 0.72)" mask={`url(#${id}-mask)`} />
          <path d={pointerBoundary} fill="transparent" fillRule="evenodd" pointerEvents="fill" />
          {hole && (
            <rect
              data-tutorial="hole"
              x={hole.left}
              y={hole.top}
              width={hole.width}
              height={hole.height}
              rx="6"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2"
            />
          )}
        </svg>
        <section
          ref={cardRef}
          aria-label="Interactive getting started guide"
          aria-describedby={`${id}-instructions`}
          data-tutorial="card"
          className="pointer-events-auto fixed z-[101] flex flex-col gap-3 rounded-panel border border-line2 bg-panel p-4 text-body text-ink shadow-[0_8px_24px_var(--color-shadow)]"
          style={{
            left: layout.left,
            top: layout.top,
            width: layout.width,
            maxHeight: Math.min(
              viewport.height - 24,
              Math.max(160, Math.min(420, viewport.height * 0.48)),
            ),
          }}
        >
          <div className="flex shrink-0 items-center justify-between gap-3">
            <span className="engraved text-run-text">Getting started · {progress}</span>
            <Button variant="ghost" onClick={onClose} aria-label="Exit guide" className="h-7 px-2">
              Exit
            </Button>
          </div>
          <h2
            ref={titleRef}
            id={`${id}-title`}
            tabIndex={-1}
            className="shrink-0 text-title font-bold outline-none"
          >
            {title}
          </h2>
          <div
            id={`${id}-instructions`}
            className="min-h-0 overflow-y-auto text-ink2 [&_p+p]:mt-2 [&_code]:text-ink"
          >
            {children}
            {!currentTarget && (
              <p role="status" className="mt-3 text-amber">
                This section is not available yet. Wait for the page to load, go back, or exit the
                guide.
              </p>
            )}
            {layout.docked && currentTarget && (
              <p className="mt-3 text-small">
                Scroll the page to work through the highlighted section.
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line pt-3">
            {onBack && <Button onClick={onBack}>Back</Button>}
            {onSkip && (
              <Button variant="ghost" onClick={onSkip} className="px-2">
                {skipLabel}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={onNext}
              disabled={nextDisabled || !currentTarget}
              className="ml-auto"
            >
              {nextLabel}
            </Button>
          </div>
        </section>
      </div>
    </>,
    document.body,
  );
}
