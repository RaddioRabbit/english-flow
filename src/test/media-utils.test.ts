import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeImageSourceToDataUrl } from "@/lib/media-utils";

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
});
