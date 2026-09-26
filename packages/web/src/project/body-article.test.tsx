import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
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
