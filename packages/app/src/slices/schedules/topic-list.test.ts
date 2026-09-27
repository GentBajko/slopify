import { describe, expect, it } from "vitest";
import {
  formatTopicList,
  linesFromRows,
  parseTopicList,
  renderedTitle,
  rowsFromLines,
  type TopicRow,
  templateKeywords,
  topicRowProblems,
} from "./topic-list.js";

const form = {
  title: "History: {{Topic}}",
  values: { Topic: "", "Min. Word Count": "1000", Tone: "" },
};
const keywords = templateKeywords(form);
const options = { keywords, topicKeyword: "Topic" };

describe("the topic list", () => {
  it("reads the template's keywords from its title and stored values", () => {
    expect(keywords).toEqual(["Topic", "Min. Word Count", "Tone"]);
  });

  it("reads a YAML list of maps and plain topics, every value as the text written", () => {
    const parsed = parseTopicList(
      "- Topic: Cleopatra\n  Min. Word Count: 12000\n- Hypatia\n- Topic: Obelisks\n  Tone: yes\n",
      options,
    );
    expect(parsed).toEqual({
      ok: true,
      rows: [
        { title: "Cleopatra", values: { "Min. Word Count": "12000" } },
        { title: "Hypatia", values: {} },
        { title: "Obelisks", values: { Tone: "yes" } },
      ],
    });
  });

  it("reads a JSON array the same way", () => {
    expect(
      parseTopicList('[{"Topic": "Cleopatra", "Min. Word Count": "12000"}, "Hypatia"]', options),
    ).toEqual({
      ok: true,
      rows: [
        { title: "Cleopatra", values: { "Min. Word Count": "12000" } },
        { title: "Hypatia", values: {} },
      ],
    });
  });

  it("names the row and the key of an unknown keyword or a missing topic", () => {
    const parsed = parseTopicList("- Topic: Cleopatra\n  Colour: red\n- Tone: calm\n", options);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems[0]).toContain("Topic 1: “Colour” is not a keyword of this template");
    expect(parsed.problems[0]).toContain("“Topic”, “Min. Word Count”, “Tone”");
    expect(parsed.problems[1]).toContain("Topic 2 has no “Topic”");
  });

  it("asks for a keyword with no every-run value on every row", () => {
    const parsed = parseTopicList("- Topic: Cleopatra\n- Topic: Hypatia\n  Tone: calm\n", {
      ...options,
      required: ["Tone"],
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems).toEqual([
      "Topic 1 (Cleopatra) has no “Tone”, and there is no every-run value to fall back on. Give this topic one, or fill “Tone” for every run.",
    ]);
  });

  it("refuses text that is not a list, nested values and broken YAML in plain words", () => {
    const notList = parseTopicList("Topic: Cleopatra", options);
    expect(!notList.ok && notList.problems[0]).toContain("must be a list of topics");
    const nested = parseTopicList("- Topic: Cleopatra\n  Tone: [a, b]\n", options);
    expect(!nested.ok && nested.problems[0]).toContain("Topic 1: “Tone” holds a list or a map");
    const broken = parseTopicList("- Topic: [Cleopatra\n", options);
    expect(!broken.ok && broken.problems[0]).toContain("couldn't be read as YAML or JSON");
    expect(parseTopicList("   ", options)).toEqual({ ok: true, rows: [] });
  });

  it("round-trips the queue through YAML and through lines", () => {
    const rows: readonly TopicRow[] = [
      { title: "Cleopatra", values: { "Min. Word Count": "12000", Tone: "a: b # not a comment" } },
      { title: "12000", values: {} },
      { title: "Hypatia", values: {} },
    ];
    const yaml = formatTopicList(rows, "Topic");
    expect(yaml.startsWith("- Topic: Cleopatra\n")).toBe(true);
    expect(parseTopicList(yaml, options)).toEqual({ ok: true, rows });
    // Lines carry only the topics; the values come back from the rows they match.
    expect(rowsFromLines(linesFromRows(rows), rows)).toEqual(rows);
    expect(rowsFromLines("Hypatia\n\n  New one  ", rows)).toEqual([
      { title: "Hypatia", values: {} },
      { title: "New one", values: {} },
    ]);
  });

  it("builds a run's project title the way the scheduler does", () => {
    const schedule = { topicKeyword: "Topic", values: { "Min. Word Count": "15000" } };
    expect(renderedTitle(form, schedule, { title: "Cleopatra", values: {} })).toBe(
      "History: Cleopatra",
    );
    expect(
      renderedTitle({ ...form, title: "{{Topic}} in {{Min. Word Count}} words" }, schedule, {
        title: "Hypatia",
        values: { "Min. Word Count": "9000" },
      }),
    ).toBe("Hypatia in 9000 words");
    // Without a topic keyword the topic is the whole title.
    expect(
      renderedTitle(form, { topicKeyword: null, values: {} }, { title: "Plain", values: {} }),
    ).toBe("Plain");
  });

  it("leaves topics saved before the check alone", () => {
    const old: TopicRow = { title: "Arda", values: { "topic,name": "Arda" } };
    expect(topicRowProblems([old], options)).toHaveLength(1);
    expect(topicRowProblems([old], { ...options, kept: [old] })).toEqual([]);
  });
});
