import { documentThemeLabel } from "@app/slices/document/model.js";
import { ExternalLink } from "lucide-react";
import { Fact, Facts } from "@/components/kit/facts";
import { FileLink } from "@/components/kit/link";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { StageBody, StageFiles } from "./parts.js";
import { useOutputMedia } from "./revision-media.js";

// Document: Download PDF (the section's main action), its one Open folder and Open PDF in a
// browser tab in one row, then the theme it was set in as a fact of its own.
export function DocumentBody({ stage, project, outputs }: BodyProps) {
  const pdf = roleOf(outputsOf(outputs, stage), "document_pdf");
  const media = useOutputMedia(pdf);
  const theme = documentThemeLabel(project.config.document);

  return (
    <StageBody>
      {pdf === undefined ? (
        <p className="m-0 text-small text-ink-2">
          {stage.state === "running"
            ? "The PDF will be saved when rendering finishes."
            : "No PDF has been saved yet."}
        </p>
      ) : (
        <StageFiles files={[{ output: pdf, label: "PDF" }]} label="Download PDF">
          {/* Only a revision's file answers `inline=1`; the older project-file route always
              downloads. */}
          {media?.folder ? (
            <FileLink
              href={`${media.url}?inline=1`}
              target="_blank"
              rel="noopener"
              variant="secondary"
            >
              <ExternalLink aria-hidden="true" strokeWidth={1.75} />
              Open PDF
            </FileLink>
          ) : null}
        </StageFiles>
      )}
      <Facts label="PDF details">
        <Fact label="Theme">{theme}</Fact>
      </Facts>
    </StageBody>
  );
}
