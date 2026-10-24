import { documentThemeLabel } from "@app/slices/document/model.js";
import { ExternalLink } from "lucide-react";
import { use } from "react";
import { ButtonRow } from "@/components/kit/button";
import { FileLink } from "@/components/kit/link";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { DownloadMenu, fileSize, MetaLine, OutputFolder, StageBody } from "./parts.js";
import { LeadDownloadContext } from "./read-only.js";
import { useOutputMedia } from "./revision-media.js";

// PDF: the document itself on the page, its first page in view, with its three actions —
// Download PDF, Open in a new tab and its one Open folder — and one line of facts beside it
// once the column is wide enough, under it when not.
export function DocumentBody({ stage, project, outputs }: BodyProps) {
  const lead = use(LeadDownloadContext);
  const pdf = roleOf(outputsOf(outputs, stage), "document_pdf");
  const media = useOutputMedia(pdf);
  const theme = documentThemeLabel(project.config.document);
  // Only a revision's file answers `inline=1`; the older project-file route always downloads,
  // so it can be neither shown here nor opened in a tab.
  const inline = media?.folder ? `${media.url}?inline=1` : undefined;
  // A browser without its own PDF viewer says so in a line rather than drawing an empty box.
  const viewer = typeof navigator === "undefined" || navigator.pdfViewerEnabled !== false;

  if (pdf === undefined)
    return (
      <StageBody>
        <p className="m-0 text-small text-ink-2">
          {stage.state === "running"
            ? "The PDF will be saved when it is made."
            : "No PDF has been saved yet."}
        </p>
      </StageBody>
    );
  return (
    <StageBody className="@container">
      <div className="grid items-start gap-x-6 gap-y-3 @min-[760px]:grid-cols-[minmax(0,1fr)_minmax(240px,300px)]">
        {inline === undefined || !viewer ? null : (
          // The browser's own PDF viewer, the first page in view.
          <object
            data={inline}
            type="application/pdf"
            title={`The PDF of ${project.title}`}
            className="h-[min(640px,75vh)] w-full rounded-control border border-line bg-screen"
          >
            <p className="m-0 p-4 text-small text-ink-2">
              This browser does not show PDFs on the page. Open in a new tab to read it.
            </p>
          </object>
        )}
        <div className="flex min-w-0 flex-col gap-3">
          <ButtonRow>
            <DownloadMenu
              files={[{ output: pdf, label: "PDF" }]}
              variant={lead ? "primary" : "secondary"}
            />
            {inline === undefined ? null : (
              <FileLink href={inline} target="_blank" rel="noopener" variant="secondary">
                <ExternalLink aria-hidden="true" strokeWidth={1.75} />
                Open in a new tab
              </FileLink>
            )}
            <OutputFolder output={pdf} />
          </ButtonRow>
          {inline !== undefined && !viewer ? (
            <p className="m-0 text-small text-ink-2">
              This browser does not show PDFs on the page: open it in a new tab to read it.
            </p>
          ) : null}
          <MetaLine>
            {[fileSize(pdf.bytes), `${theme} theme`, "contents link to their pages"]
              .filter((part) => part !== undefined)
              .join(" · ")}
          </MetaLine>
        </div>
      </div>
    </StageBody>
  );
}
