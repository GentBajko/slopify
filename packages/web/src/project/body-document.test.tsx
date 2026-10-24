import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { body, output, stage } from "@/routes/project-fixtures";
import { jsonAnswer, renderApp, testDeps, testOrigin } from "@/test-app";
import { DocumentBody } from "./body-document.js";
import { RevisionControlContext } from "./revision-action-context.js";
import { revisionView } from "./revision-fixture.js";
import { RevisionMedia } from "./revision-media.js";

afterEach(cleanup);
it("shows the PDF on the page, downloads it and opens the same record in a new tab", async () => {
  const document = stage("document", "done");
  const pdf = output("document_pdf", "document");
  const config = {
    ...revisionView().revision.config,
    sources: { ...revisionView().revision.config.sources, document: "generate" as const },
    document: { theme: "plain" as const },
  };
  const project = {
    ...body({ status: "done", stages: [document], outputs: [pdf] }).project,
    format: "16:9" as const,
    config,
  };
  const view = {
    ...revisionView(),
    outputs: [
      {
        recordId: "record-pdf",
        publicationId: null,
        selected: true,
        available: true,
        slot: "document:pdf",
        workKey: "document:pdf",
        assetId: pdf.id,
        output: pdf,
        fingerprint: "document",
        state: "ready" as const,
      },
    ],
  };
  renderApp(
    <RevisionMedia projectId="p1" revisionId="r1">
      <RevisionControlContext value>
        <DocumentBody
          stage={document}
          project={project}
          outputs={[pdf]}
          busy={false}
          actions={{
            run: () => undefined,
            pending: false,
            refusal: undefined,
            dismissRefusal: () => undefined,
          }}
        />
      </RevisionControlContext>
    </RevisionMedia>,
    testDeps({ "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }) }),
  );
  const url = `${testOrigin}/files/p1/revisions/r1/record-pdf`;
  await waitFor(() =>
    expect(screen.getByRole("link", { name: "Download PDF" }).getAttribute("href")).toBe(url),
  );
  const open = screen.getByRole("link", { name: "Open in a new tab" });
  expect(open.getAttribute("href")).toBe(`${url}?inline=1`);
  expect(open.getAttribute("target")).toBe("_blank");
  expect(open.getAttribute("rel")).toContain("noopener");
  // The document itself, its first page in view, not only buttons that lead to it.
  expect(screen.getByTitle("The PDF of Rope Tricks").getAttribute("data")).toBe(`${url}?inline=1`);
  expect(screen.getAllByRole("button", { name: "Open folder" })).toHaveLength(1);
  expect(screen.getByText("Plain theme", { exact: false })).not.toBeNull();
});
