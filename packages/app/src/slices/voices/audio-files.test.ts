import { describe, expect, it } from "vitest";
import { audioChapters, audioFileArgs, ffmetadata } from "./audio-files.js";
import { turnJoinArgs } from "./join.js";

describe("audioChapters", () => {
  it("starts a chapter where each section's first turn is heard, the first at zero", () => {
    expect(
      audioChapters({
        title: "Episode",
        sections: [
          { title: "Opening", firstTurn: 1 },
          { title: "Unheard", firstTurn: 9 },
          { title: "Main", firstTurn: 4 },
        ],
        turnStarts: new Map([
          [1, 2.5],
          [4, 61.25],
        ]),
        totalSeconds: 120,
      }),
    ).toEqual([
      { title: "Opening", startMs: 0, endMs: 61250 },
      { title: "Main", startMs: 61250, endMs: 120000 },
    ]);
  });

  it("is one chapter named for the project when the script has no sections", () => {
    expect(
      audioChapters({ title: "Episode", sections: [], turnStarts: new Map(), totalSeconds: 3 }),
    ).toEqual([{ title: "Episode", startMs: 0, endMs: 3000 }]);
  });
});

it("writes FFMETADATA with escaped titles", () => {
  expect(ffmetadata("A=B; #1", [{ title: "Part\\one", startMs: 0, endMs: 1000 }])).toBe(
    ";FFMETADATA1\ntitle=A\\=B\\; \\#1\n\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=1000\ntitle=Part\\\\one\n",
  );
});

it("tags a book's chapter with the book as album and the chapter as track", () => {
  expect(
    ffmetadata("The Storm", [{ title: "One", startMs: 0, endMs: 1000 }], {
      title: " Sea; Tales ",
      chapter: 3,
    }),
  ).toBe(
    ";FFMETADATA1\ntitle=The Storm\nalbum=Sea\\; Tales\ntrack=3\n\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=1000\ntitle=One\n",
  );
});

describe("audioFileArgs", () => {
  const audio = [
    { path: null, seconds: 2 },
    { path: "/p/body.mp3", seconds: 60 },
  ];

  it("maps the chapters from the metadata input into an M4B", () => {
    const args = audioFileArgs(audio, "/tmp/chapters.txt", "/out/book.m4b", "m4b");
    expect(args).toEqual(
      expect.arrayContaining(["-map_chapters", "2", "-map_metadata", "2", "aac", "mp4"]),
    );
    const metadata = args.indexOf("ffmetadata");
    expect(args.slice(metadata - 1, metadata + 3)).toEqual([
      "-f",
      "ffmetadata",
      "-i",
      "/tmp/chapters.txt",
    ]);
    expect(args.at(-1)).toBe("/out/book.m4b");
    expect(args[args.indexOf("-filter_complex") + 1]).toBe(
      "[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,asetpts=PTS-STARTPTS[a0];[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,asetpts=PTS-STARTPTS[a1];[a0][a1]concat=n=2:v=0:a=1[a]",
    );
  });

  it("writes ID3 chapters into an MP3", () => {
    const args = audioFileArgs(audio, "/tmp/chapters.txt", "/out/book.mp3", "mp3");
    expect(args).toEqual(
      expect.arrayContaining(["libmp3lame", "-id3v2_version", "3", "-map_chapters", "2"]),
    );
  });
});

it("joins turns at each speaker's pace with the gap between turns", () => {
  const args = turnJoinArgs(
    [
      { path: "/a.mp3", pace: 1, gapAfter: 0 },
      { path: "/b.mp3", pace: 1, gapAfter: 0.35 },
      { path: "/c.mp3", pace: 1.1, gapAfter: 0 },
    ],
    "/out.mp3",
  );
  expect(args[args.indexOf("-filter_complex") + 1]).toBe(
    [
      "[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono,asetpts=PTS-STARTPTS[p0]",
      "[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono,apad=pad_dur=0.350,asetpts=PTS-STARTPTS[p1]",
      "[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono,atempo=1.1,asetpts=PTS-STARTPTS[p2]",
      "[p0][p1][p2]concat=n=3:v=0:a=1[a]",
    ].join(";"),
  );
});
