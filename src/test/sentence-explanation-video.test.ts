import { describe, expect, it } from "vitest";

import type { SentenceExplanationArticle } from "@/lib/sentence-explanation-contract";
import type { SentenceExplanationTtsResponse } from "@/lib/sentence-explanation-tts-contract";
import { createSentenceExplanationVideoPlan } from "@/lib/sentence-explanation-video";
import { defaultReferenceImages, type Task } from "@/lib/task-store";

function buildTask(): Task {
  const now = "2026-03-18T00:00:00.000Z";

  return {
    id: "task-video-1",
    sentence: "It is a truth universally acknowledged.",
    bookName: "Pride and Prejudice",
    author: "Jane Austen",
    modules: ["translation", "grammar", "summary", "vocabulary", "ielts"],
    referenceImages: defaultReferenceImages(),
    textContent: {
      translation: "人们普遍承认，这是一个真理。",
      prompt1: "prompt1",
      prompt2: "prompt2",
      prompt3: "prompt3",
      prompt4: "prompt4",
      grammar: {
        tense: "present",
        voice: "active",
        structure: "complex sentence",
      },
      vocabulary: [
        {
          id: "word-1",
          word: "acknowledged",
          phonetic: "/əkˈnɒlɪdʒd/",
          partOfSpeech: "adj.",
          meaning: "公认的",
          example: "It is acknowledged by everyone.",
          translation: "被公认的",
        },
      ],
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
        title: "句译对照图",
        subtitle: "",
        sourceText: "",
        fileName: "translation.png",
        dataUrl: "data:image/png;base64,translation",
        createdAt: now,
      },
      grammar: {
        id: "img-grammar",
        imageType: "grammar",
        title: "句式分析图",
        subtitle: "",
        sourceText: "",
        fileName: "grammar.png",
        dataUrl: "data:image/png;base64,grammar",
        createdAt: now,
      },
      summary: {
        id: "img-summary",
        imageType: "summary",
        title: "句式总结图",
        subtitle: "",
        sourceText: "",
        fileName: "summary.png",
        dataUrl: "data:image/png;base64,summary",
        createdAt: now,
      },
      vocabulary: {
        id: "img-vocabulary",
        imageType: "vocabulary",
        title: "词汇解析图",
        subtitle: "",
        sourceText: "",
        fileName: "vocabulary.png",
        dataUrl: "data:image/png;base64,vocabulary",
        createdAt: now,
      },
      ielts: {
        id: "img-ielts",
        imageType: "ielts",
        title: "雅思备考图",
        subtitle: "",
        sourceText: "",
        fileName: "ielts.png",
        dataUrl: "data:image/png;base64,ielts",
        createdAt: now,
      },
    },
    steps: [],
    logs: [],
    status: "completed",
    progress: 100,
    currentStage: "done",
    flowMode: "all",
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  };
}

function buildArticle(): SentenceExplanationArticle {
  return {
    title: "句子讲解视频",
    welcomeMessage: "欢迎来到今天的句子讲解。",
    introduction: "先看句译对照图。",
    sections: [
      { moduleId: "translation", moduleName: "句译对照图", imageRef: "translation", content: "translation content" },
      { moduleId: "grammar", moduleName: "句式分析图", imageRef: "grammar", content: "grammar content" },
      { moduleId: "summary", moduleName: "句式总结图", imageRef: "summary", content: "summary content" },
      { moduleId: "vocabulary", moduleName: "词汇解析图", imageRef: "vocabulary", content: "vocabulary content" },
      { moduleId: "ielts", moduleName: "雅思备考图", imageRef: "ielts", content: "ielts content" },
    ],
    conclusion: "这就是今天的收尾总结。",
    totalWordCount: 120,
  };
}

function buildTts(): SentenceExplanationTtsResponse {
  return {
    title: "句子讲解视频",
    welcomeMessage: "欢迎来到今天的句子讲解。",
    introduction: {
      text: "先看句译对照图。",
      audioDataUrl: "data:audio/mpeg;base64,introduction",
    },
    sections: [
      {
        moduleId: "translation",
        moduleName: "句译对照图",
        imageRef: "translation",
        content: {
          text: "translation content",
          audioDataUrl: "data:audio/mpeg;base64,translation",
        },
      },
      {
        moduleId: "grammar",
        moduleName: "句式分析图",
        imageRef: "grammar",
        content: {
          text: "grammar content",
          audioDataUrl: "data:audio/mpeg;base64,grammar",
        },
      },
      {
        moduleId: "summary",
        moduleName: "句式总结图",
        imageRef: "summary",
        content: {
          text: "summary content",
          audioDataUrl: "data:audio/mpeg;base64,summary",
        },
      },
      {
        moduleId: "vocabulary",
        moduleName: "词汇解析图",
        imageRef: "vocabulary",
        content: {
          text: "vocabulary content",
          audioDataUrl: "data:audio/mpeg;base64,vocabulary",
        },
      },
      {
        moduleId: "ielts",
        moduleName: "雅思备考图",
        imageRef: "ielts",
        content: {
          text: "ielts content",
          audioDataUrl: "data:audio/mpeg;base64,ielts",
        },
      },
    ],
    conclusion: {
      text: "这就是今天的收尾总结。",
      audioDataUrl: "data:audio/mpeg;base64,conclusion",
    },
    metadata: {
      language: "zh",
      voice: "Chinese (Mandarin)_News_Anchor",
      speed: 1,
      generatedAt: "2026-03-18T00:00:00.000Z",
      totalSegments: 7,
      successfulSegments: 7,
    },
    source: "minimax-api",
    model: "speech-2.8-hd",
  };
}

describe("createSentenceExplanationVideoPlan", () => {
  it("merges introduction into the first image and conclusion into the last image", () => {
    const plan = createSentenceExplanationVideoPlan(buildTask(), buildArticle(), buildTts());

    expect(plan.clips.map((clip) => clip.moduleId)).toEqual([
      "translation",
      "grammar",
      "summary",
      "vocabulary",
      "ielts",
    ]);
    expect(plan.clips[0].audioSegments.map((segment) => segment.role)).toEqual(["introduction", "section"]);
    expect(plan.clips[1].audioSegments.map((segment) => segment.role)).toEqual(["section"]);
    expect(plan.clips[4].audioSegments.map((segment) => segment.role)).toEqual(["section", "conclusion"]);
    expect(plan.totalAudioSegments).toBe(7);
  });

  it("throws when any required section audio is missing", () => {
    const brokenTts = buildTts();
    brokenTts.sections[2] = {
      ...brokenTts.sections[2],
      content: {
        ...brokenTts.sections[2].content,
        audioDataUrl: null,
      },
    };

    expect(() => createSentenceExplanationVideoPlan(buildTask(), buildArticle(), brokenTts)).toThrow(
      "缺少句式总结语音，无法生成视频。",
    );
  });
});
