import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadAllImages, downloadGeneratedImage, normalizeImageSourceToDataUrl } from "@/lib/media-utils";

describe("normalizeImageSourceToDataUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns supported bitmap data URLs unchanged", async () => {
    const source = "data:image/png;base64,Zm9v";

    await expect(normalizeImageSourceToDataUrl(source)).resolves.toBe(source);
  });

  it("converts remote bitmap images into base64 data URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "image/png" }),
          blob: async () => new Blob([Uint8Array.from([1, 2, 3, 4])], { type: "image/png" }),
        } satisfies Pick<Response, "ok" | "status" | "headers" | "blob">,
      ),
    );

    const result = await normalizeImageSourceToDataUrl("https://example.com/frame.png");

    expect(fetch).toHaveBeenCalledWith("https://example.com/frame.png", { signal: undefined });
    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it("rasterizes svg data URLs into png data URLs", async () => {
    class MockImage {
      naturalWidth = 960;
      naturalHeight = 1280;
      width = 960;
      height = 1280;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;

      set src(_value: string) {
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }

    vi.stubGlobal("Image", MockImage as unknown as typeof Image);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillStyle: "",
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,rasterized");

    const result = await normalizeImageSourceToDataUrl("data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E");

    expect(result).toBe("data:image/png;base64,rasterized");
  });

  it("downloads remote public images through a local data URL instead of the raw cross-origin link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "image/png" }),
          blob: async () => new Blob([Uint8Array.from([1, 2, 3, 4])], { type: "image/png" }),
        } satisfies Pick<Response, "ok" | "status" | "headers" | "blob">,
      ),
    );

    const appendSpy = vi.spyOn(document.body, "appendChild");
    const removeSpy = vi.spyOn(document.body, "removeChild");
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await downloadGeneratedImage({
      id: "image-remote",
      imageType: "translation",
      title: "translation image",
      subtitle: "translation subtitle",
      sourceText: "translation source",
      fileName: "translation.png",
      dataUrl: "",
      publicUrl: "https://example.com/translation.png",
      createdAt: "2026-03-29T00:00:00.000Z",
    });

    expect(fetch).toHaveBeenCalledWith("https://example.com/translation.png", { signal: undefined });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);

    const link = appendSpy.mock.calls[0]?.[0] as HTMLAnchorElement;
    expect(link.download).toBe("translation.png");
    expect(link.href).toMatch(/^data:image\/png;base64,/);
  });

  it("downloads every local bitmap image in download-all mode without timers", async () => {
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const timeoutSpy = vi.spyOn(window, "setTimeout");

    await downloadAllImages([
      {
        id: "image-1",
        imageType: "translation",
        title: "translation image",
        subtitle: "translation subtitle",
        sourceText: "translation source",
        fileName: "translation.png",
        dataUrl: "data:image/png;base64,AAAA",
        createdAt: "2026-03-29T00:00:00.000Z",
      },
      {
        id: "image-2",
        imageType: "grammar",
        title: "grammar image",
        subtitle: "grammar subtitle",
        sourceText: "grammar source",
        fileName: "grammar.png",
        dataUrl: "data:image/png;base64,BBBB",
        createdAt: "2026-03-29T00:00:00.000Z",
      },
    ]);

    expect(clickSpy).toHaveBeenCalledTimes(2);
    expect(appendSpy).toHaveBeenCalledTimes(2);
    expect(timeoutSpy).not.toHaveBeenCalled();
  });

  it("still allows a later single-image download after download-all has run", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const translationImage = {
      id: "image-1",
      imageType: "translation" as const,
      title: "translation image",
      subtitle: "translation subtitle",
      sourceText: "translation source",
      fileName: "translation.png",
      dataUrl: "data:image/png;base64,AAAA",
      createdAt: "2026-03-29T00:00:00.000Z",
    };

    await downloadAllImages([translationImage]);
    await downloadGeneratedImage({
      ...translationImage,
      id: "image-2",
      fileName: "translation-copy.png",
    });

    expect(clickSpy).toHaveBeenCalledTimes(2);
  });
});
