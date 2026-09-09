export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

const margin = 12;
const gap = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

/** Choose a free side first; a broad or tall section leaves a scrollable work area above a dock. */
export function spotlightLayout(target: Box | null, viewport: Size, card: Size) {
  const width = Math.min(card.width, viewport.width - margin * 2);
  const left = clamp(
    target?.left ?? (viewport.width - width) / 2,
    margin,
    viewport.width - width - margin,
  );
  const centeredTop = clamp(
    (target?.top ?? 0) + ((target?.height ?? viewport.height) - card.height) / 2,
    margin,
    viewport.height - card.height - margin,
  );
  const bottom = viewport.height - card.height - margin;
  if (!target) return { left, top: centeredTop, width, docked: false };
  const right = target.left + target.width;
  const targetBottom = target.top + target.height;
  if (right + gap + width <= viewport.width - margin) {
    return { left: right + gap, top: centeredTop, width, docked: false };
  }
  if (target.left - gap - width >= margin) {
    return { left: target.left - gap - width, top: centeredTop, width, docked: false };
  }
  if (targetBottom >= margin && targetBottom + gap + card.height <= viewport.height - margin) {
    return { left, top: targetBottom + gap, width, docked: false };
  }
  if (target.top - gap - card.height >= margin && target.top <= viewport.height - margin) {
    return { left, top: target.top - gap - card.height, width, docked: false };
  }
  return {
    left: viewport.width - width - margin,
    top: Math.max(margin, bottom),
    width,
    docked: true,
  };
}

export function spotlightHole(box: Box, viewport: Size, bottom = viewport.height): Box | null {
  const left = clamp(box.left - 6, 0, viewport.width);
  const top = clamp(box.top - 6, 0, Math.min(bottom, viewport.height));
  const right = clamp(box.left + box.width + 6, 0, viewport.width);
  const edge = clamp(box.top + box.height + 6, 0, Math.min(bottom, viewport.height));
  return right > left && edge > top ? { left, top, width: right - left, height: edge - top } : null;
}
