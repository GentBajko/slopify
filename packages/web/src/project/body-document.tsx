import { documentThemeLabel } from "@app/slices/document/model.js";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/kit/button";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { ActionRow, EngravedLabel, OutputDownload, StageBody } from "./parts.js";
import { useOutputMedia } from "./revision-media.js";

// Document: the PDF's theme, Download and Open folder, and Open PDF in a browser tab.
export function DocumentBody({ stage, project, outputs }: BodyProps) {
  const pdf = roleOf(outputsOf(outputs, stage), "document_pdf");
  const media = useOutputMedia(pdf);
  const theme = documentThemeLabel(project.config.document);

  return (
    <StageBody>
      <EngravedLabel>{`${theme} theme`}</EngravedLabel>
      {pdf === undefined ? (
        <p className="text-small text-ink-2">
          {stage.state === "running"
            ? "The PDF will be saved when rendering finishes."
            : "No PDF has been saved yet."}
        </p>
      ) : null}
      <ActionRow>
        {/* Only a revision's file answers `inline=1`; the older project-file route always
            downloads. */}
        {media?.folder ? (
          <Button asChild size="small">
            <a href={`${media.url}?inline=1`} target="_blank" rel="noopener">
              <ExternalLink aria-hidden="true" strokeWidth={1.75} />
              Open PDF
            </a>
          </Button>
        ) : null}
        {pdf === undefined ? null : <OutputDownload output={pdf} label="Download PDF" />}
      </ActionRow>
    </StageBody>
  );
}
