import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { legacyDiceMasterTheme } from "./legacy-dicemaster.js";
import { listDocumentThemes } from "./library.js";
import { documentThemeSchema } from "./theme-schema.js";

const migrations = new URL("../../kernel/db/migrations/", import.meta.url);
const file = "0017-legacy-dicemaster-theme.sql";
const clock = fixedClock("2026-09-26T10:00:00.000Z");

// A database at schema 16, the last one before DiceMaster left the built-ins.
function beforeUpgrade() {
  const db = openDb(":memory:");
  for (const name of readdirSync(migrations)
    .filter((one) => one.endsWith(".sql") && one < file)
    .sort()) {
    db.exec(readFileSync(new URL(name, migrations), "utf8"));
    db.prepare("INSERT INTO schema_migrations VALUES (?, '2026-09-01')").run(
      Number(name.slice(0, 4)),
    );
  }
  return db;
}

function project(db: ReturnType<typeof openDb>, id: string, document: "generate" | "off") {
  db.prepare("INSERT INTO projects VALUES (?, 'Saved', '16:9', '{}', 'old', 'old')").run(id);
  db.prepare(
    "INSERT INTO stages (id,project_id,kind,source,state) VALUES (?,?,'document',?,?)",
  ).run(`${id}-document`, id, document, document === "off" ? "skipped" : "done");
}

describe("migration 0017", () => {
  it("carries exactly the legacy DiceMaster values, so the two cannot drift", () => {
    const sql = readFileSync(new URL(file, migrations), "utf8");
    const literal = /'(\{.*\})'/su.exec(sql)?.[1];
    expect(literal).toBeDefined();
    expect(JSON.parse(literal ?? "")).toEqual(legacyDiceMasterTheme);
    expect(documentThemeSchema.parse(JSON.parse(literal ?? ""))).toEqual(legacyDiceMasterTheme);
  });

  it("saves DiceMaster to the Library on an install that has used the Document stage", () => {
    const db = beforeUpgrade();
    project(db, "p1", "off");
    project(db, "p2", "generate");
    migrate(db, clock);
    const themes = listDocumentThemes(db);
    expect(themes.map((one) => one.name)).toEqual(["DiceMaster"]);
    expect(themes[0]?.values).toEqual(legacyDiceMasterTheme);
    db.close();
  });

  it("saves nothing on a fresh install, or one whose projects never used the stage", () => {
    const fresh = openDb(":memory:");
    migrate(fresh, clock);
    expect(listDocumentThemes(fresh)).toEqual([]);
    fresh.close();

    const unused = beforeUpgrade();
    project(unused, "p1", "off");
    migrate(unused, clock);
    expect(listDocumentThemes(unused)).toEqual([]);
    unused.close();
  });

  it("leaves a Library theme already named DiceMaster alone", () => {
    const db = beforeUpgrade();
    project(db, "p1", "generate");
    const mine = { ...legacyDiceMasterTheme, page: { ...legacyDiceMasterTheme.page, margin: 30 } };
    db.prepare("INSERT INTO document_themes VALUES ('t1', 'dicemaster', ?, 'old', 'old')").run(
      JSON.stringify(mine),
    );
    migrate(db, clock);
    const themes = listDocumentThemes(db);
    expect(themes.map((one) => [one.id, one.name])).toEqual([["t1", "dicemaster"]]);
    expect(themes[0]?.values.page.margin).toBe(30);
    db.close();
  });
});
