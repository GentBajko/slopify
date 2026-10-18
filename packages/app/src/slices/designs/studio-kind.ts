import type { Catalogue } from "../../catalog/schema.js";
import type { CostEstimate } from "../estimate/index.js";
import { estimateRequests } from "../estimate/requests.js";
import type { DesignResult } from "./model.js";
import type { DesignSamples, SampleView } from "./sample.js";
import type { DesignDocument } from "./schema.js";
import {
  type DesignSectionId,
  designAffectedSections,
  designSections,
  sampleNeedsPicture,
} from "./sections.js";
import { documentChecks, type TemplateCheck } from "./template-checks.js";
import { quoteDocument } from "./template-make.js";

// The seam the Template Studio (built on another branch) plugs a template kind into: its
// sections, which a Save changed, the checks that cost nothing, what a sample costs and the
// sample's state per section. Until both are merged, the design template editor
// (`library/design-templates/$templateId`) uses this same implementation directly.

export type Check = TemplateCheck;
export interface CheckContext {
  readonly templateId: string;
}
export type SectionState = "current" | "making" | "waiting" | "needs-fix" | "stale" | "off";
export type SampleRequestResult = DesignResult<SampleView>;

export interface StudioKind<Doc> {
  readonly kind: "project" | "design";
  readonly sections: readonly { readonly id: string; readonly label: string }[];
  readonly affectedSections: (before: Doc, after: Doc) => readonly string[];
  readonly freeChecks: (doc: Doc, ctx: CheckContext) => readonly Check[];
  // Nothing when only free sections changed.
  readonly quoteSample: (doc: Doc, affected: readonly string[]) => CostEstimate;
  readonly requestSample: (
    templateId: string,
    version: number,
    acknowledgedHigh: number,
    acknowledgedUnknown?: boolean,
  ) => SampleRequestResult;
  readonly sampleState: (templateId: string) => Readonly<Record<string, SectionState>>;
}

export function freeSample(catalogue: Catalogue): CostEstimate {
  return estimateRequests([{ kind: "local", stage: "Sample" }], catalogue);
}

export function designStudioKind(deps: {
  readonly catalogue: () => Catalogue;
  readonly samples: DesignSamples;
  readonly document: (templateId: string) => DesignDocument | undefined;
}): StudioKind<DesignDocument> {
  return {
    kind: "design",
    sections: designSections,
    affectedSections: designAffectedSections,
    freeChecks: (doc, ctx) => documentChecks(doc, ctx.templateId),
    quoteSample: (doc, affected) =>
      sampleNeedsPicture(affected as readonly DesignSectionId[])
        ? quoteDocument(deps.catalogue(), doc)
        : freeSample(deps.catalogue()),
    requestSample: (templateId, version, acknowledgedHigh, acknowledgedUnknown) =>
      deps.samples.request(templateId, version, acknowledgedHigh, acknowledgedUnknown),
    sampleState: (templateId) => {
      const sample = deps.samples.state(templateId);
      const doc = deps.document(templateId);
      const picture: SectionState =
        sample === null
          ? "off"
          : sample.state === "making" || sample.state === "queued"
            ? "making"
            : sample.state === "held"
              ? "waiting"
              : sample.state === "failed"
                ? "needs-fix"
                : "current";
      const drawn: SectionState = sample?.designId == null ? "off" : "current";
      return {
        picture,
        text: drawn,
        formats: drawn,
        schedule: doc?.schedule === undefined ? "off" : "current",
      };
    },
  };
}
