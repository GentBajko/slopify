import { expect, it } from "vitest";
import { videoIdOf } from "./videos.js";

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
