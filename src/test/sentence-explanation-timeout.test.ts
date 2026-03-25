import { afterEach, describe, expect, it, vi } from "vitest";

import { generateSentenceExplanation, SENTENCE_EXPLANATION_REQUEST_TIMEOUT_MS } from "@/lib/sentence-explanation-client";
import type { Task } from "@/lib/task-store";
import { loadRemoteImageSource } from "../../server/english-sentence-explanation-skill-shim";

function createAbortError() {
  const error = new Error("Request aborted");
  error.name = "AbortError";
  return error;
}

function buildTask(): Task {
  return {
    id: "task-timeout",
    sentence: "It is a truth universally acknowledged.",
    bookName: "Pride and Prejudice",
    author: "Jane Austen",
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
    generatedImages: {
      translation: {
        id: "img-translation",
        imageType: "translation",
        title: "",
        subtitle: "",
        sourceText: "",
        fileName: "translation.png",
        dataUrl: "data:image/png;base64,AAA",
        createdAt: "2026-03-17T00:00:00.000Z",
      },
      grammar: {
        id: "img-grammar",
        imageType: "grammar",
        title: "",
        subtitle: "",
        sourceText: "",
        fileName: "grammar.png",
        dataUrl: "data:image/png;base64,AAA",
        createdAt: "2026-03-17T00:00:00.000Z",
      },
      summary: {
        id: "img-summary",
        imageType: "summary",
        title: "",
        subtitle: "",
        sourceText: "",
        fileName: "summary.png",
        dataUrl: "data:image/png;base64,AAA",
        createdAt: "2026-03-17T00:00:00.000Z",
      },
      vocabulary: {
        id: "img-vocabulary",
        imageType: "vocabulary",
        title: "",
        subtitle: "",
        sourceText: "",
        fileName: "vocabulary.png",
        dataUrl: "data:image/png;base64,AAA",
        createdAt: "2026-03-17T00:00:00.000Z",
      },
      ielts: {
        id: "img-ielts",
        imageType: "ielts",
        title: "",
        subtitle: "",
        sourceText: "",
        fileName: "ielts.png",
        dataUrl: "data:image/png;base64,AAA",
        createdAt: "2026-03-17T00:00:00.000Z",
      },
    },
  } as Task;
}

function createHangingFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<never>((_, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(createAbortError());
        return;
      }

      signal?.addEventListener(
        "abort",
        () => {
          reject(createAbortError());
        },
        { once: true },
      );
    });
  });
}

function createFetchWithHangingJson() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;

    return Promise.resolve({
      ok: true,
      json: () =>
        new Promise<never>((_, reject) => {
          if (signal?.aborted) {
            reject(createAbortError());
            return;
          }

          signal?.addEventListener(
            "abort",
            () => {
              reject(createAbortError());
            },
            { once: true },
          );
        }),
    } satisfies Partial<Response> as Response);
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sentence explanation timeouts", () => {
  it("aborts remote image downloads instead of hanging forever", async () => {
    vi.useFakeTimers();
    const fetchMock = createHangingFetch();
    vi.stubGlobal("fetch", fetchMock);

    const promise = loadRemoteImageSource("https://example.com/image.png", 25);
    const expectation = expect(promise).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(25);

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts the page request when article generation exceeds the timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = createHangingFetch();
    vi.stubGlobal("fetch", fetchMock);

    const promise = generateSentenceExplanation(buildTask());
    const expectation = expect(promise).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(SENTENCE_EXPLANATION_REQUEST_TIMEOUT_MS);

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts the page request when the JSON body hangs after headers arrive", async () => {
    vi.useFakeTimers();
    const fetchMock = createFetchWithHangingJson();
    vi.stubGlobal("fetch", fetchMock);

    const promise = generateSentenceExplanation(buildTask());
    const expectation = expect(promise).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(SENTENCE_EXPLANATION_REQUEST_TIMEOUT_MS);

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
