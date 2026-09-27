// The model-upkeep vocabulary, free of the database so the browser can import it too.

// The four model choices a run makes, and the catalogue list each one comes from.
export const usageSlots = ["llm", "audio", "images", "animate"] as const;
export type UsageSlot = (typeof usageSlots)[number];
export const usageKinds = ["template", "schedule", "draft", "project"] as const;
export type UsageKind = (typeof usageKinds)[number];
export const slotLabels: Readonly<Record<UsageSlot, string>> = {
  llm: "Text model",
  audio: "Voice model",
  images: "Image model",
  animate: "Animation model",
};

export interface ModelChoice {
  readonly provider: string;
  readonly model: string;
}
// One place a model that is no longer offered is still chosen.
export interface RetiredUsage {
  readonly key: string;
  readonly kind: UsageKind;
  readonly id: string;
  readonly name: string;
  readonly slot: UsageSlot;
  readonly provider: string;
  readonly model: string;
  // "retired": the catalogue lists it as deprecated; "unlisted": it is not in the list at all.
  readonly why: "retired" | "unlisted";
  readonly replacement: { readonly id: string; readonly name: string } | null;
  // Why the one-click switch cannot be used here, and what to do instead.
  readonly blocked: string | null;
}
