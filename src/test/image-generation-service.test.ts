import { describe, expect, it } from "vitest";

import {
  generateMultipleImages,
  type ImageGenerationRequest,
  type ImageGenerationResponse,
} from "../../server/image-generation-service";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

function buildRequest(moduleId: ImageGenerationRequest["moduleId"]): ImageGenerationRequest {
  return {
    taskId: "task-1",
    moduleId,
    textContent: {
      translation: "",
      prompt1: "",
      prompt2: "",
      prompt3: "",
      prompt4: "",
      grammar: {
        tense: "",
        voice: "",
        structure: "",
      },
      vocabulary: [],
      ielts: {
        listening: "",
        speaking: "",
        reading: "",
        writing: "",
      },
    },
    bookName: "Test Book",
    originSentence: "Test sentence",
  };
}

describe("generateMultipleImages", () => {
  it("starts all module requests concurrently and preserves input order", async () => {
    const requests = [buildRequest("translation"), buildRequest("grammar"), buildRequest("summary")];
    const started: string[] = [];
    const translation = createDeferred<ImageGenerationResponse>();
    const grammar = createDeferred<ImageGenerationResponse>();
    const summary = createDeferred<ImageGenerationResponse>();

    const promise = generateMultipleImages(requests, async (request) => {
      started.push(request.moduleId);

      if (request.moduleId === "translation") {
        return translation.promise;
      }

      if (request.moduleId === "grammar") {
        return grammar.promise;
      }

      return summary.promise;
    });

    await Promise.resolve();

    expect(started).toEqual(["translation", "grammar", "summary"]);

    grammar.resolve({
      success: true,
      moduleId: "grammar",
      imageDataUrl: "grammar-image",
      metadata: { promptLength: 1, generatedAt: "2026-03-17T00:00:00.000Z" },
    });
    summary.resolve({
      success: true,
      moduleId: "summary",
      imageDataUrl: "summary-image",
      metadata: { promptLength: 1, generatedAt: "2026-03-17T00:00:00.000Z" },
    });
    translation.resolve({
      success: true,
      moduleId: "translation",
      imageDataUrl: "translation-image",
      metadata: { promptLength: 1, generatedAt: "2026-03-17T00:00:00.000Z" },
    });

    await expect(promise).resolves.toEqual([
      expect.objectContaining({ moduleId: "translation", imageDataUrl: "translation-image" }),
      expect.objectContaining({ moduleId: "grammar", imageDataUrl: "grammar-image" }),
      expect.objectContaining({ moduleId: "summary", imageDataUrl: "summary-image" }),
    ]);
  });
});
