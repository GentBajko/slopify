import { documentThemeLabels, documentThemeOf } from "@app/slices/document/model.js";
import { ExternalLink } from "lucide-react";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { ConfirmedButton } from "./controls.js";
import { ActionRow, EngravedLabel, OutputDownload, StageBody } from "./parts.js";
import { useOutputMedia } from "./revision-media.js";

// Document: the PDF's theme, Download and Open folder, and Open PDF in a browser tab.
export function DocumentBody({ stage, project, outputs, actions, busy }: BodyProps) {
  const pdf = roleOf(outputsOf(outputs, stage), "document_pdf");
  const media = useOutputMedia(pdf);
  const theme = documentThemeLabels[documentThemeOf(project.config.document)];

  return (
    <StageBody>
      <EngravedLabel>{`${theme} theme`}</EngravedLabel>
      {pdf === undefined ? (
        <p className="text-small text-ink2">
          {stage.state === "running"
            ? "The PDF will be saved when rendering finishes."
            : "No PDF has been saved yet."}
        </p>
      ) : null}
      <ActionRow>
        <ConfirmedButton
          action={{ kind: "rerun", stage: stage.kind }}
          run={() => {
            actions.run({ kind: "rerun", stage: stage.kind });
          }}
          disabled={busy}
          pending={actions.pending}
        >
          Render again
        </ConfirmedButton>
        {/* Only a revision's file answers `inline=1`; the older project-file route always
            downloads. */}
        {media?.folder ? (
          <a
            href={`${media.url}?inline=1`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-[5px] rounded-control text-small text-ink2 hover:text-ink"
          >
            <ExternalLink aria-hidden="true" className="size-[14px] shrink-0" />
            Open PDF
          </a>
        ) : null}
        {pdf === undefined ? null : <OutputDownload output={pdf} label="Download PDF" />}
      </ActionRow>
    </StageBody>
  );
}
