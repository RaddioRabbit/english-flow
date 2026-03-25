import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SENTENCE_EXPLANATION_TTS_REQUEST_TIMEOUT_MS,
  generateSentenceExplanationTts,
  previewSentenceExplanationTtsVoice,
} from "@/lib/sentence-explanation-tts-client";
import type { SentenceExplanationArticle } from "@/lib/sentence-explanation-contract";
import type { Task } from "@/lib/task-store";

function createAbortError() {
  const error = new Error("Request aborted");
  error.name = "AbortError";
  return error;
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

function buildTask(): Task {
  return {
    id: "task-tts-timeout",
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
    generatedImages: {},
  } as Task;
}

function buildArticle(): SentenceExplanationArticle {
  return {
    title: "Title",
    welcomeMessage: "Welcome",
    introduction: "Intro",
    sections: [
      {
        moduleId: "translation",
        moduleName: "Translation",
        imageRef: "translation",
        content: "Section",
      },
    ],
    conclusion: "Outro",
    totalWordCount: 10,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sentence explanation tts client timeouts", () => {
  it("aborts TTS generation when the JSON body hangs after headers arrive", async () => {
    vi.useFakeTimers();
    const fetchMock = createFetchWithHangingJson();
    vi.stubGlobal("fetch", fetchMock);

    const promise = generateSentenceExplanationTts(buildTask(), buildArticle());
    const expectation = expect(promise).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(SENTENCE_EXPLANATION_TTS_REQUEST_TIMEOUT_MS);

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts TTS voice preview when the JSON body hangs after headers arrive", async () => {
    vi.useFakeTimers();
    const fetchMock = createFetchWithHangingJson();
    vi.stubGlobal("fetch", fetchMock);

    const promise = previewSentenceExplanationTtsVoice({
      language: "en",
      voice: "nova",
    });
    const expectation = expect(promise).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(SENTENCE_EXPLANATION_TTS_REQUEST_TIMEOUT_MS);

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
