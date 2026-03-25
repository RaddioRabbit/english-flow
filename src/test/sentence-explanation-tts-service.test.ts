import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateSentenceExplanationTts,
  previewSentenceExplanationTts,
} from "../../server/sentence-explanation-tts-service";
import type {
  SentenceExplanationTtsPreviewRequest,
  SentenceExplanationTtsPreviewResponse,
  SentenceExplanationTtsRequest,
  SentenceExplanationTtsResponse,
} from "@/lib/sentence-explanation-tts-contract";

describe("sentence explanation tts service", () => {
  afterEach(() => {
    delete (globalThis as typeof globalThis & { skill?: unknown }).skill;
    vi.restoreAllMocks();
  });

  it("keeps article section order while matching audio by module id", async () => {
    const input: SentenceExplanationTtsRequest = {
      taskId: "task-1",
      language: "zh",
      voice: "Chinese (Mandarin)_News_Anchor",
      article: {
        title: "标题",
        welcomeMessage: "欢迎",
        introduction: "开场",
        sections: [
          {
            moduleId: "translation",
            moduleName: "句译对照",
            imageRef: "translation",
            content: "先讲翻译",
          },
          {
            moduleId: "grammar",
            moduleName: "句式分析",
            imageRef: "grammar",
            content: "再讲语法",
          },
        ],
        conclusion: "总结",
        totalWordCount: 20,
      },
    };

    const runtimeResult: SentenceExplanationTtsResponse = {
      title: "标题",
      welcomeMessage: "欢迎",
      introduction: {
        text: "开场",
        audioDataUrl: "data:audio/mpeg;base64,intro",
      },
      sections: [
        {
          moduleId: "grammar",
          moduleName: "句式分析",
          imageRef: "grammar",
          content: {
            text: "再讲语法",
            audioDataUrl: "data:audio/mpeg;base64,grammar",
          },
        },
        {
          moduleId: "translation",
          moduleName: "句译对照",
          imageRef: "translation",
          content: {
            text: "先讲翻译",
            audioDataUrl: "data:audio/mpeg;base64,translation",
          },
        },
      ],
      conclusion: {
        text: "总结",
        audioDataUrl: "data:audio/mpeg;base64,conclusion",
      },
      metadata: {
        language: "zh",
        voice: "Chinese (Mandarin)_News_Anchor",
        speed: 1,
        generatedAt: "2026-03-18T00:00:00.000Z",
        totalSegments: 4,
        successfulSegments: 4,
      },
      source: "minimax-api",
      model: "speech-2.8-hd",
    };

    (globalThis as typeof globalThis & { skill?: (name: string, params: unknown) => Promise<unknown> }).skill = vi
      .fn()
      .mockResolvedValue(runtimeResult);

    const result = await generateSentenceExplanationTts(input);

    expect(result.metadata.language).toBe("zh");
    expect(result.sections.map((section) => section.moduleId)).toEqual(["translation", "grammar"]);
    expect(result.sections[0].content.audioDataUrl).toBe("data:audio/mpeg;base64,translation");
    expect(result.sections[1].content.audioDataUrl).toBe("data:audio/mpeg;base64,grammar");
    expect(result.introduction.audioDataUrl).toBe("data:audio/mpeg;base64,intro");
    expect(result.conclusion.audioDataUrl).toBe("data:audio/mpeg;base64,conclusion");
  });

  it("returns preview audio using the preview skill contract", async () => {
    const input: SentenceExplanationTtsPreviewRequest = {
      language: "en",
      voice: "English_Graceful_Lady",
    };
    const runtimeSkill = vi.fn().mockResolvedValue({
      language: "en",
      voice: "English_Graceful_Lady",
      speed: 1,
      generatedAt: "2026-03-18T00:00:00.000Z",
      text: "Hello, welcome to our English classics sentence lesson.",
      audioDataUrl: "data:audio/mpeg;base64,preview",
      source: "minimax-api",
      model: "speech-2.8-hd",
    } satisfies SentenceExplanationTtsPreviewResponse);

    (globalThis as typeof globalThis & { skill?: (name: string, params: unknown) => Promise<unknown> }).skill = runtimeSkill;

    const result = await previewSentenceExplanationTts(input);

    expect(runtimeSkill).toHaveBeenCalledWith("sentence-explanation-tts-preview", input);
    expect(result.language).toBe("en");
    expect(result.voice).toBe("English_Graceful_Lady");
    expect(result.audioDataUrl).toBe("data:audio/mpeg;base64,preview");
  });

  it("rejects incomplete audio results so text and audio stay one-to-one", async () => {
    const input: SentenceExplanationTtsRequest = {
      taskId: "task-2",
      language: "zh",
      voice: "Chinese (Mandarin)_News_Anchor",
      article: {
        title: "标题",
        welcomeMessage: "欢迎",
        introductionLines: ["开场第一句", "开场第二句"],
        introduction: "开场第一句\n开场第二句",
        sections: [
          {
            moduleId: "translation",
            moduleName: "句译对照",
            imageRef: "translation",
            lines: ["图片讲解第一句", "图片讲解第二句"],
            content: "图片讲解第一句\n图片讲解第二句",
          },
        ],
        conclusionLines: ["结尾"],
        conclusion: "结尾",
        totalWordCount: 20,
      },
    };

    (globalThis as typeof globalThis & { skill?: (name: string, params: unknown) => Promise<unknown> }).skill = vi
      .fn()
      .mockResolvedValue({
        title: "标题",
        welcomeMessage: "欢迎",
        introduction: {
          text: "开场第一句\n开场第二句",
          audioDataUrl: null,
          lineAudios: [
            { lineIndex: 0, text: "开场第一句", audioDataUrl: "data:audio/mpeg;base64,intro-1" },
            { lineIndex: 1, text: "开场第二句", audioDataUrl: null },
          ],
        },
        sections: [
          {
            moduleId: "translation",
            moduleName: "句译对照",
            imageRef: "translation",
            content: {
              text: "图片讲解第一句\n图片讲解第二句",
              audioDataUrl: null,
              lineAudios: [
                { lineIndex: 0, text: "图片讲解第一句", audioDataUrl: "data:audio/mpeg;base64,section-1" },
                { lineIndex: 1, text: "图片讲解第二句", audioDataUrl: "data:audio/mpeg;base64,section-2" },
              ],
            },
          },
        ],
        conclusion: {
          text: "结尾",
          audioDataUrl: "data:audio/mpeg;base64,conclusion",
        },
        metadata: {
          language: "zh",
          voice: "Chinese (Mandarin)_News_Anchor",
          speed: 1,
          generatedAt: "2026-03-18T00:00:00.000Z",
          totalSegments: 5,
          successfulSegments: 4,
        },
        source: "minimax-api",
        model: "speech-2.8-hd",
      } satisfies Partial<SentenceExplanationTtsResponse>);

    await expect(generateSentenceExplanationTts(input)).rejects.toThrow("文本转语音未完整生成，成功 4/5 句");
  });
});
