// A design is a picture edited step by step ("edit") or a designed piece whose text Slopify
// lays out on the AI's artwork ("design"). Every step is one version of the picture.
export const designKinds = ["edit", "design"] as const;
export type DesignKind = (typeof designKinds)[number];

export const stepKinds = ["upload", "edit", "generate"] as const;
export type StepKind = (typeof stepKinds)[number];

export const stepStates = ["making", "ready", "failed"] as const;
export type StepState = (typeof stepStates)[number];

export const designFormats = [
  "a4",
  "a3",
  "flyer",
  "square",
  "portrait",
  "story",
  "wide",
  "brochure",
] as const;
export type DesignFormat = (typeof designFormats)[number];

export const formatLabels: Readonly<Record<DesignFormat, string>> = {
  a4: "Poster A4",
  a3: "Poster A3",
  flyer: "Flyer A5",
  square: "Square 1:1",
  portrait: "Portrait 4:5",
  story: "Story 9:16",
  wide: "Wide 16:9",
  brochure: "Brochure A4",
};

export const layoutPresets = ["top-title", "bottom-band", "centered", "left-column"] as const;
export type LayoutPreset = (typeof layoutPresets)[number];

export const scrims = ["none", "soft", "band"] as const;
export type Scrim = (typeof scrims)[number];

export const blockRoles = ["headline", "subhead", "details", "small"] as const;
export type BlockRole = (typeof blockRoles)[number];

export const designNameMax = 200;
export const instructionMax = 4000;
export const promptMax = 4000;
export const blocksMax = 8;
export const blockTextMax = 500;
export const castPerDesignMax = 3;
export const daysBeforeMax = 90;

export interface Design {
  readonly id: string;
  readonly kind: DesignKind;
  readonly name: string;
  readonly channelId: string;
  readonly projectId: string | null;
  readonly templateId: string | null;
  readonly templateVersion: number | null;
  readonly scheduleId: string | null;
  readonly scheduleRunId: string | null;
  readonly document: unknown;
  readonly values: Readonly<Record<string, string>>;
  readonly headStepId: string | null;
  readonly sampleOf: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface DesignStep {
  readonly id: string;
  readonly designId: string;
  readonly n: number;
  readonly parentId: string | null;
  readonly kind: StepKind;
  readonly instruction: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly inputs: StepInputs;
  readonly state: StepState;
  readonly error: string | null;
  readonly sha256: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly createdAt: string;
  readonly settledAt: string | null;
}

// What a paid step was asked with, kept so Try again asks the same.
export interface StepInputs {
  readonly castMemberIds: readonly string[];
  readonly aspect?: "16:9" | "9:16" | "1:1" | undefined;
  readonly prompt?: string | undefined;
}

export type DesignRefusal =
  | "not-found"
  | "invalid"
  | "changed"
  | "mutation-reused"
  | "not-an-image"
  | "still-uploading"
  | "upload-gone"
  | "project-not-found"
  | "channel-not-found"
  | "busy"
  | "no-image-provider"
  | "cost-changed"
  | "missing-values"
  | "not-ready";

export type DesignResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason: DesignRefusal;
      readonly message: string;
      readonly current?: unknown;
    };

export interface DesignView extends Design {
  readonly steps: readonly DesignStep[];
}

export type DesignEvent = { readonly type: "design.changed"; readonly designId: string };
