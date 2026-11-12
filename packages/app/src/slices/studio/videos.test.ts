import { afterEach, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { uploadedProjects } from "../uploads/repo.js";
import { confirmUpload, forgetVideo, recordVideo, videoIdOf } from "./videos.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

// A finished project with a long video and `shorts` rendered shorts, as the pack lists them.
function harness(shorts = 3) {
  const db = openDb(":memory:");
  cleanups.push(() => db.close());
  migrate(db, fixedClock("2026-11-12T10:00:00.000Z"));
  db.exec(`INSERT INTO projects VALUES ('p1','Run','16:9','{}','2026-11-01','2026-11-01')`);
  db.exec(
    `INSERT INTO outputs (id, project_id, stage_kind, role, path, bytes, meta, created_at) VALUES
     ('o0','p1','video','video','v.mp4',1,'{}','2026-11-01')`,
  );
  for (let number = 1; number <= shorts; number++)
    db.exec(
      `INSERT INTO outputs (id, project_id, stage_kind, role, path, bytes, meta, created_at) VALUES
       ('s${String(number)}','p1','video','short_video','s${String(number)}.mp4',1,
        '{"short":${String(number)}}','2026-11-01')`,
    );
  return db;
}

const at = "2026-11-12T10:00:00.000Z";

it("reads a video id from every link Studio and YouTube show", () => {
  for (const link of [
    "https://youtu.be/lKS3FAjekpI",
    "https://www.youtube.com/watch?v=lKS3FAjekpI&t=4s",
    "https://www.youtube.com/shorts/lKS3FAjekpI",
    "https://studio.youtube.com/video/lKS3FAjekpI/edit",
    "lKS3FAjekpI",
  ])
    expect(videoIdOf(link)).toBe("lKS3FAjekpI");
  expect(videoIdOf("https://www.youtube.com/@channel")).toBeUndefined();
});

it("keeps a project in Ready to upload while its shorts are still waiting", () => {
  const db = harness();
  recordVideo(db, "p1", null, "X4iQ_ccDHp0", at);
  expect(uploadedProjects(db).has("p1")).toBe(false);
  recordVideo(db, "p1", 1, "Q8sdCpqgkp4", at);
  // Studio re-reads the long video after each upload: that must not mark the project and take
  // the shorts still waiting out of the extension's list.
  recordVideo(db, "p1", null, "X4iQ_ccDHp0", at);
  expect(uploadedProjects(db).has("p1")).toBe(false);
  recordVideo(db, "p1", 2, "aaaaaaaaaaa", at);
  expect(uploadedProjects(db).has("p1")).toBe(false);
  recordVideo(db, "p1", 3, "bbbbbbbbbbb", at);
  expect(uploadedProjects(db).get("p1")).toBe(at);
});

it("marks a project with no shorts on its long video alone", () => {
  const db = harness(0);
  recordVideo(db, "p1", null, "X4iQ_ccDHp0", at);
  expect(uploadedProjects(db).get("p1")).toBe(at);
});

it("marks the project when the last short is confirmed, not only when recorded", () => {
  const db = harness(2);
  recordVideo(db, "p1", null, "X4iQ_ccDHp0", at);
  recordVideo(db, "p1", 1, "Q8sdCpqgkp4", at);
  recordVideo(db, "p1", 2, "aaaaaaaaaaa", at, "filled");
  expect(uploadedProjects(db).has("p1")).toBe(false);
  expect(confirmUpload(db, "p1", 2, "aaaaaaaaaaa", at)).toBe(true);
  expect(uploadedProjects(db).get("p1")).toBe(at);
});

it("takes the mark off when a short that was on YouTube is forgotten", () => {
  const db = harness(1);
  recordVideo(db, "p1", null, "X4iQ_ccDHp0", at);
  recordVideo(db, "p1", 1, "Q8sdCpqgkp4", at);
  expect(uploadedProjects(db).get("p1")).toBe(at);
  forgetVideo(db, "p1", 1, at);
  expect(uploadedProjects(db).has("p1")).toBe(false);
});
