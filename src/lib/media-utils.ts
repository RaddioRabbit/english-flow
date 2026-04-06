import { getGeneratedImageSource, type GeneratedImage } from "@/lib/task-store";

const BITMAP_DATA_URL_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,/i;

function createAbortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

function downloadUrl(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function readBlobAsDataUrl(blob: Blob, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const reader = new FileReader();

    const cleanup = () => {
      reader.onload = null;
      reader.onerror = null;
      signal?.removeEventListener("abort", handleAbort);
    };

    const handleAbort = () => {
      cleanup();
      reader.abort();
      reject(createAbortError());
    };

    reader.onload = () => {
      cleanup();
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      cleanup();
      reject(new Error("Failed to read image blob."));
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
    reader.readAsDataURL(blob);
  });
}

function loadImageFromObjectUrl(objectUrl: string, signal?: AbortSignal) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const image = new Image();

    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", handleAbort);
    };

    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("Failed to load image for rasterization."));
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
    image.src = objectUrl;
  });
}

function rasterizeImageBlobToPngDataUrl(blob: Blob, signal?: AbortSignal) {
  const objectUrl = URL.createObjectURL(blob);

  return loadImageFromObjectUrl(objectUrl, signal)
    .then((image) => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width || 960;
      canvas.height = image.naturalHeight || image.height || 1280;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Failed to create canvas context.");
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    })
    .finally(() => {
      URL.revokeObjectURL(objectUrl);
    });
}

function svgToPngDataUrl(svgUrl: string, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const image = new Image();

    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", handleAbort);
    };

    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    image.onload = () => {
      cleanup();

      const canvas = document.createElement("canvas");
      canvas.width = 960;
      canvas.height = 1280;
      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Failed to create canvas context."));
        return;
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("Failed to convert image."));
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
    image.src = svgUrl;
  });
}

export async function normalizeImageSourceToDataUrl(imageSource: string, signal?: AbortSignal) {
  const trimmedSource = imageSource.trim();
  if (!trimmedSource) {
    throw new Error("Image source is empty.");
  }

  if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(trimmedSource)) {
    return trimmedSource;
  }

  if (trimmedSource.startsWith("data:image/svg+xml")) {
    return svgToPngDataUrl(trimmedSource, signal);
  }

  const response = await fetch(trimmedSource, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch image source: HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const mimeType = (blob.type || response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();

  if (mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp") {
    return readBlobAsDataUrl(blob, signal);
  }

  if (mimeType.startsWith("image/")) {
    return rasterizeImageBlobToPngDataUrl(blob, signal);
  }

  throw new Error(`Unsupported image source type: ${mimeType || "unknown"}`);
}

export async function downloadGeneratedImage(image: GeneratedImage) {
  const source = getGeneratedImageSource(image);
  if (!source) {
    return;
  }

  if (BITMAP_DATA_URL_PATTERN.test(source)) {
    downloadUrl(source, image.fileName);
    return;
  }

  const pngUrl = await normalizeImageSourceToDataUrl(source);
  downloadUrl(pngUrl, image.fileName);
}

export async function downloadAllImages(images: GeneratedImage[]) {
  await Promise.all(images.map((image) => downloadGeneratedImage(image)));
}

export function downloadXiaohongshuText(
  result: { titles: string[]; content: string },
  fileName = "xiaohongshu-analysis.txt",
) {
  const lines = [
    "小红书文案生成",
    "",
    "=== 推荐标题 ===",
    "",
    ...result.titles,
    "",
    "=== 正文分析 ===",
    "",
    result.content,
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, fileName);
  URL.revokeObjectURL(url);
}

export async function sharePage(title: string, url: string) {
  if (navigator.share) {
    await navigator.share({ title, url });
    return true;
  }

  await navigator.clipboard.writeText(url);
  return false;
}
