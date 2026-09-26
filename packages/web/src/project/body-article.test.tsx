import type { Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { body, output, stage } from "@/routes/project-fixtures";
import { jsonAnswer, renderApp, testDeps, testOrigin } from "@/test-app";
import { ArticleBody } from "./body-article.js";
import { RevisionControlContext } from "./revision-action-context.js";
import { revisionView } from "./revision-fixture.js";
import { RevisionMedia } from "./revision-media.js";

afterEach(cleanup);
it.each([false, true])(
  "reads and downloads the retained article when Markdown exists: %s",
  async (hasMarkdown) => {
    const article = stage("article", "provided");
    const text = output("article_txt", "article");
    const markdown = output("article_md", "article");
    const outputs = hasMarkdown ? [text, markdown] : [text];
    const project = {
      ...body({ status: "done", stages: [article], outputs }).project,
      format: "16:9" as const,
      config: revisionView().revision.config,
    };
    const view = {
      ...revisionView(),
      outputs: outputs.map((one) => ({
        recordId: one.role,
        publicationId: null,
        selected: true,
        available: true,
        slot: `article:${one.role}`,
        workKey: "article:body",
        assetId: one.id,
        output: one,
        fingerprint: "article",
        state: "ready" as const,
      })),
    };
    const requests: string[] = [];
    renderApp(
      <RevisionMedia projectId="p1" revisionId="r1">
        <RevisionControlContext value>
          <ArticleBody
            stage={article}
            project={project}
            outputs={outputs}
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
      testDeps({
        "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }),
        "GET /files/p1/revisions/r1/article_txt": () => {
          requests.push("text");
          return new Response("Provided narration stays readable.");
        },
        "GET /files/p1/revisions/r1/article_md": () => {
          requests.push("markdown");
          return new Response("# Article heading\n\nRich article stays readable.");
        },
      }),
    );
    await screen.findByText(
      hasMarkdown ? "Rich article stays readable." : "Provided narration stays readable.",
    );
    const expected = hasMarkdown ? "article_md" : "article_txt";
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Download" }).getAttribute("href")).toBe(
        `${testOrigin}/files/p1/revisions/r1/${expected}`,
      ),
    );
    expect(requests).toEqual([hasMarkdown ? "markdown" : "text"]);
  },
);

it("gives the sources and the pronunciation table tabs of their own, one source per line", async () => {
  const article = stage("article", "done");
  const markdown = output("article_md", "article");
  const outputs = [markdown];
  const project = {
    ...body({ status: "done", stages: [article], outputs }).project,
    format: "16:9" as const,
    config: revisionView().revision.config,
  };
  const view = {
    ...revisionView(),
    outputs: [
      {
        recordId: "article_md",
        publicationId: null,
        selected: true,
        available: true,
        slot: "article:article_md",
        workKey: "article:body",
        assetId: markdown.id,
        output: markdown,
        fingerprint: "article",
        state: "ready" as const,
      },
    ],
  };
  renderApp(
    <RevisionMedia projectId="p1" revisionId="r1">
      <RevisionControlContext value>
        <ArticleBody
          stage={article}
          project={project}
          outputs={outputs}
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
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }),
      "GET /files/p1/revisions/r1/article_md": () =>
        new Response(
          [
            "# Szass Tam",
            "",
            "The body of the article.",
            "",
            "## Sources Consulted",
            "",
            'Wikipedia, "Lich" — https://en.wikipedia.org/wiki/Lich',
            "TSR, Monster Manual (1977)",
            "",
            "## Pronunciation Glossary",
            "",
            "| Name / Term | IPA |",
            "|---|---|",
            "| lich | /lɪtʃ/ |",
          ].join("\n"),
        ),
    }),
  );
  await screen.findByText("The body of the article.");
  const reading = screen.getByRole("region", { name: "Article content" });
  expect(within(reading).queryByText(/Monster Manual/u)).toBeNull();
  screen.getByRole("tab", { name: /Sources/u }).click();
  await screen.findByText("TSR, Monster Manual (1977)");
  expect(
    within(screen.getByRole("tabpanel", { name: /Sources/u })).getAllByRole("listitem"),
  ).toHaveLength(2);
  screen.getByRole("tab", { name: "Pronunciation" }).click();
  expect(await screen.findByRole("cell", { name: "/lɪtʃ/" })).toBeTruthy();
});

it("shows no tab row for an article without sources or a glossary", async () => {
  const article = stage("article", "done");
  const markdown = output("article_md", "article");
  const project = {
    ...body({ status: "done", stages: [article], outputs: [markdown] }).project,
    format: "16:9" as const,
    config: revisionView().revision.config,
  };
  renderApp(
    <RevisionMedia projectId="p1" revisionId="r1">
      <RevisionControlContext value>
        <ArticleBody
          stage={article}
          project={project}
          outputs={[markdown]}
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
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({
        view: {
          ...revisionView(),
          outputs: [
            {
              recordId: "article_md",
              publicationId: null,
              selected: true,
              available: true,
              slot: "article:article_md",
              workKey: "article:body",
              assetId: markdown.id,
              output: markdown,
              fingerprint: "article",
              state: "ready" as const,
            },
          ],
        },
      }),
      "GET /files/p1/revisions/r1/article_md": () => new Response("# T\n\nJust the article."),
    }),
  );
  await screen.findByText("Just the article.");
  expect(screen.queryByRole("tablist")).toBeNull();
});

function mountWithResearch(
  article: Stage,
  research: Stage,
  outputs: readonly Output[],
  files: Readonly<Record<string, string>>,
) {
  const saved = revisionView();
  const config = {
    ...saved.revision.config,
    sources: { ...saved.revision.config.sources, research: "generate", article: "generate" },
  } as const;
  const project = {
    ...body({ status: "done", stages: [research, article], outputs }).project,
    format: "16:9" as const,
    config,
  };
  renderApp(
    <RevisionMedia projectId="p1" revisionId="r1">
      <RevisionControlContext value>
        <ArticleBody
          stage={article}
          companion={research}
          project={project}
          outputs={outputs}
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
    testDeps({
      "GET /api/projects/p1/revisions/r1": jsonAnswer({
        view: {
          ...saved,
          revision: { ...saved.revision, config },
          outputs: outputs.map((one) => ({
            recordId: one.role,
            publicationId: null,
            selected: true,
            available: true,
            slot: `${one.stageKind}:${one.role}`,
            workKey: `${one.stageKind}:body`,
            assetId: one.id,
            output: one,
            fingerprint: one.stageKind,
            state: "ready" as const,
          })),
        },
      }),
      ...Object.fromEntries(
        Object.entries(files).map(([role, text]) => [
          `GET /files/p1/revisions/r1/${role}`,
          () => new Response(text),
        ]),
      ),
    }),
  );
}

it("puts Research second among the article's tabs and copies its notes", async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  mountWithResearch(
    stage("article", "done"),
    stage("research", "done"),
    [output("notes", "research"), output("article_md", "article")],
    {
      notes: "Liches keep phylacteries.",
      article_md: [
        "# Szass Tam",
        "",
        "The body of the article.",
        "",
        "## Sources Consulted",
        "",
        "TSR, Monster Manual (1977)",
        "",
        "## Pronunciation Glossary",
        "",
        "| Name / Term | IPA |",
        "|---|---|",
        "| lich | /lɪtʃ/ |",
      ].join("\n"),
    },
  );
  await screen.findByText("The body of the article.");
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
    "Article",
    "Research",
    "Sources1",
    "Pronunciation",
  ]);
  await userEvent.click(screen.getByRole("tab", { name: "Research" }));
  const notes = await screen.findByRole("region", { name: "Research notes" });
  expect(await within(notes).findByText("Liches keep phylacteries.")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Re-run research" })).not.toBeNull();
  await userEvent.click(await screen.findByRole("button", { name: "Copy research notes" }));
  expect(writeText).toHaveBeenLastCalledWith("Liches keep phylacteries.\n");
  vi.unstubAllGlobals();
});

it("opens on Research while the research has failed and the article waits", async () => {
  mountWithResearch(stage("article", "pending"), stage("research", "failed"), [], {});
  const tab = await screen.findByRole("tab", { name: "Research" });
  expect(tab.getAttribute("aria-selected")).toBe("true");
  expect(
    screen.getByText(
      "Research stopped before any notes were saved. Use Retry research above to try again.",
    ),
  ).not.toBeNull();
  expect(
    ((await screen.findByRole("button", { name: "Re-run research" })) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  await userEvent.click(screen.getByRole("tab", { name: "Article" }));
  expect(screen.getByText("The article is written once the research has finished.")).not.toBeNull();
  expect((screen.getByRole("button", { name: "Re-run" }) as HTMLButtonElement).disabled).toBe(true);
});
