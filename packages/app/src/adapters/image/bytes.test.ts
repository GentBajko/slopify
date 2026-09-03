import { describe, expect, it } from "vitest";
import { isProviderError } from "../../kernel/ports/model.js";
import { describeBytes, downloadImage, sniffImage } from "./bytes.js";

const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const webpBytes = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

function fetching(response: Response): typeof globalThis.fetch {
  return () => Promise.resolve(response);
}

function download(response: Response): Promise<unknown> {
  return downloadImage({
    fetch: fetching(response),
    provider: "fal",
    url: "https://v3.fal.media/files/koala/abc.png",
    signal: new AbortController().signal,
  });
}

function failed(response: Response): Promise<unknown> {
  return download(response).then(
    () => new Error("the download should have failed"),
    (thrown: unknown) => thrown,
  );
}

describe("sniffImage", () => {
  it("reads the magic bytes rather than believing a header", () => {
    expect(sniffImage(pngBytes)).toBe("image/png");
    expect(sniffImage(jpegBytes)).toBe("image/jpeg");
    expect(sniffImage(webpBytes)).toBeUndefined();
    expect(sniffImage(new Uint8Array())).toBeUndefined();
    // Shorter than the PNG signature but starting the same way: not enough to call it one.
    expect(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e]))).toBeUndefined();
  });
});

describe("describeBytes", () => {
  it("names what arrived without quoting it", () => {
    expect(describeBytes(new Uint8Array())).toBe("an empty body");
    expect(describeBytes(webpBytes)).toBe("a WebP image");
    expect(describeBytes(Uint8Array.from([0x3c, 0x21, 0x64, 0x6f, 0x63]))).toBe(
      "5 bytes beginning 3c 21 64 6f",
    );
  });
});

describe("downloadImage", () => {
  it("hands back the bytes and the mime the bytes say they are", async () => {
    const image = await download(new Response(pngBytes, { status: 200 }));

    expect(image).toEqual({ bytes: pngBytes, mime: "image/png" });
  });

  // The provider's Content-Type is not what decides: this one lies.
  it("believes the bytes over the content-type header", async () => {
    const image = await download(
      new Response(jpegBytes, { status: 200, headers: { "Content-Type": "image/png" } }),
    );

    expect(image).toMatchObject({ mime: "image/jpeg" });
  });

  it("fails the attempt when the link is gone rather than storing the page it served", async () => {
    const thrown = await failed(new Response("<!doctype html>Not found", { status: 404 }));

    expect(isProviderError(thrown) && thrown.fault.kind).toBe("other");
    expect(String(thrown)).toContain("fal answered 404 for the image it said it had made");
    // The signed link never reaches the message the stage shows.
    expect(String(thrown)).not.toContain("v3.fal.media");
  });

  it("fails the attempt when the link answers with something that is not an image", async () => {
    const thrown = await failed(
      new Response("<!doctype html><html>gateway error</html>", {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    expect(isProviderError(thrown) && thrown.fault.kind).toBe("other");
    expect(String(thrown)).toContain("rather than a PNG or a JPEG");
  });

  it("names WebP when that is what came back", async () => {
    const thrown = await failed(new Response(webpBytes, { status: 200 }));

    expect(String(thrown)).toContain("a WebP image rather than a PNG or a JPEG");
  });
});
