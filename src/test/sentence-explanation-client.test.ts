import { afterEach, describe, expect, it, vi } from "vitest";

import { generateSentenceExplanation } from "@/lib/sentence-explanation-client";
import type { SentenceExplanationArticle } from "@/lib/sentence-explanation-contract";
import type { Task } from "@/lib/task-store";

function buildTask(): Task {
  return {
    id: "task-client",
    sentence: "It is a truth universally acknowledged.",
    bookName: "Pride and Prejudice",
    author: "Jane Austen",
    textContent: {
      translation: "人们普遍承认这是一条真理。",
      prompt1: "prompt1",
      prompt2: "prompt2",
      prompt3: "prompt3",
      prompt4: "prompt4",
      grammar: {
        tense: "present",
        voice: "active",
        structure: "simple sentence",
      },
      vocabulary: [],
      ielts: {
        listening: "listen",
        speaking: "speak",
        reading: "read",
        writing: "write",
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
        createdAt: "2026-03-24T00:00:00.000Z",
      },
      grammar: {
        id: "img-grammar",
        imageType: "grammar",
        title: "",
        subtitle: "",
        sourceText: "",
        fileName: "grammar.png",
        dataUrl: "data:image/png;base64,BBB",
        createdAt: "2026-03-24T00:00:00.000Z",
      },
      summary: {
        id: "img-summary",
        imageType: "summary",
        title: "",
        subtitle: "",
        sourceText: "",
        fileName: "summary.png",
        dataUrl: "data:image/png;base64,CCC",
        createdAt: "2026-03-24T00:00:00.000Z",
      },
      vocabulary: {
        id: "img-vocabulary",
        imageType: "vocabulary",
        title: "",
        subtitle: "",
        sourceText: "",
        fileName: "vocabulary.png",
        dataUrl: "data:image/png;base64,DDD",
        createdAt: "2026-03-24T00:00:00.000Z",
      },
      ielts: {
        id: "img-ielts",
        imageType: "ielts",
        title: "",
        subtitle: "",
        sourceText: "",
        fileName: "ielts.png",
        dataUrl: "data:image/png;base64,EEE",
        createdAt: "2026-03-24T00:00:00.000Z",
      },
    },
  } as Task;
}

function buildCurrentArticle(): SentenceExplanationArticle {
  return {
    title: "Sentence explanation",
    welcomeMessage: "Welcome",
    introduction: "Intro",
    introductionLines: ["Intro"],
    sections: [
      {
        moduleId: "translation",
        moduleName: "Translation",
        imageRef: "translation",
        content: "Translation content",
        lines: ["Translation content"],
      },
      {
        moduleId: "grammar",
        moduleName: "Grammar",
        imageRef: "grammar",
        content: "Grammar content",
        lines: ["Grammar content"],
      },
      {
        moduleId: "summary",
        moduleName: "Summary",
        imageRef: "summary",
        content: "Summary content",
        lines: ["Summary content"],
      },
      {
        moduleId: "vocabulary",
        moduleName: "Vocabulary",
        imageRef: "vocabulary",
        content: "Vocabulary content",
        lines: ["Vocabulary content"],
      },
      {
        moduleId: "ielts",
        moduleName: "IELTS",
        imageRef: "ielts",
        content: "IELTS content",
        lines: ["IELTS content"],
      },
    ],
    conclusion: "Conclusion",
    conclusionLines: ["Conclusion"],
    totalWordCount: 42,
    totalLineCount: 7,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generateSentenceExplanation", () => {
  it("sends currentArticle and regenerationTarget when regenerating a single block", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      return {
        ok: true,
        json: async () => ({
          article: buildCurrentArticle(),
          orderedModules: ["translation", "grammar", "summary", "vocabulary", "ielts"],
          source: "openai-compatible-api",
          model: "test-model",
        }),
      } satisfies Partial<Response> as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const currentArticle = buildCurrentArticle();
    await generateSentenceExplanation(buildTask(), {
      currentArticle,
      regenerationTarget: {
        type: "section",
        moduleId: "grammar",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const body = JSON.parse(String(init.body));

    expect(body.currentArticle).toEqual(currentArticle);
    expect(body.regenerationTarget).toEqual({
      type: "section",
      moduleId: "grammar",
    });
  });
});
