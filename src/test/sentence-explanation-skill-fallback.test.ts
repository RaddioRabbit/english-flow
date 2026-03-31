import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ModuleId } from "@/lib/task-store";
import { sentenceExplanationModuleOrder } from "@/lib/sentence-explanation-contract";

const ONE_PIXEL_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0e0AAAAASUVORK5CYII=";

function resetRuntimeSkillRegistry() {
  delete (globalThis as typeof globalThis & Record<string, unknown>).skill;
  delete (globalThis as typeof globalThis & Record<string, unknown>).__englishFlowRuntimeSkillRegistry;
  delete (globalThis as typeof globalThis & Record<string, unknown>).__englishFlowRuntimeSkillHandler;
}

function buildCompleteArticle() {
  return {
    article: {
      title: "Sentence explanation",
      welcomeMessage: "Welcome",
      introductionLines: ["Intro line"],
      sections: sentenceExplanationModuleOrder.map((moduleId) => ({
        moduleId,
        moduleName: moduleId,
        imageRef: moduleId,
        lines: [`${moduleId} line`],
      })),
      conclusionLines: ["Conclusion line"],
      totalWordCount: 42,
      totalLineCount: 7,
    },
  };
}

function buildSkillParams() {
  return {
    taskId: "task-fallback",
    originalSentence: "It was the best of times, it was the worst of times.",
    bookName: "A Tale of Two Cities",
    author: "Charles Dickens",
    textContent: {
      translation: "这是最好的时代，也是最坏的时代。",
      prompt1: "Prompt 1",
      prompt2: "Prompt 2",
      prompt3: "Prompt 3",
      prompt4: "Prompt 4",
      grammar: {
        tense: "一般过去时",
        voice: "主动语态",
        structure: "并列句",
      },
      vocabulary: [],
      ielts: {
        listening: "Listening",
        speaking: "Speaking",
        reading: "Reading",
        writing: "Writing",
      },
    },
    orderedModules: [...sentenceExplanationModuleOrder] as ModuleId[],
    images: Object.fromEntries(
      sentenceExplanationModuleOrder.map((moduleId) => [moduleId, ONE_PIXEL_PNG_DATA_URL]),
    ) as Record<ModuleId, string>,
  };
}

/* function buildSkillParamsWithVocabulary() {
  return {
    ...buildSkillParams(),
    textContent: {
      ...buildSkillParams().textContent,
      vocabulary: [
        {
          id: "vocab-1",
          word: "however",
          phonetic: "/haʊˈevə(r)/",
          partOfSpeech: "adv.",
          meaning: "然而",
          example: "However, the plan still worked.",
          translation: "然而，这个计划最终还是奏效了。",
        },
        {
          id: "vocab-2",
          word: "mean",
          phonetic: "/miːn/",
          partOfSpeech: "v.",
          meaning: "打算",
          example: "I mean to finish the work tonight.",
          translation: "我打算今晚完成这项工作。",
        },
      ],
    },
  };
} */

function buildStrictVocabularySkillParams() {
  const base = buildSkillParams();

  return {
    ...base,
    textContent: {
      ...base.textContent,
      vocabulary: [
        {
          id: "vocab-1",
          word: "however",
          phonetic: "/hauever/",
          partOfSpeech: "adv.",
          meaning: "\u7136\u800c",
          example: "However, the plan still worked.",
          translation: "\u7136\u800c\uff0c\u8fd9\u4e2a\u8ba1\u5212\u6700\u7ec8\u8fd8\u662f\u594f\u6548\u4e86\u3002",
        },
        {
          id: "vocab-2",
          word: "mean",
          phonetic: "/mi:n/",
          partOfSpeech: "v.",
          meaning: "\u6253\u7b97",
          example: "I mean to finish the work tonight.",
          translation: "\u6211\u6253\u7b97\u4eca\u665a\u5b8c\u6210\u8fd9\u9879\u5de5\u4f5c\u3002",
        },
      ],
    },
  };
}

describe("english sentence explanation skill provider fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    resetRuntimeSkillRegistry();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetRuntimeSkillRegistry();
  });

  it("does not fall back to the openai-compatible provider when anthropic returns incomplete sections", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/messages")) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    article: {
                      title: "Incomplete article",
                      welcomeMessage: "Welcome",
                      introductionLines: ["Intro line"],
                      sections: [],
                      conclusionLines: ["Conclusion line"],
                    },
                  }),
                },
              ],
            }),
        } satisfies Partial<Response> as Response;
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { installEnglishSentenceExplanationSkillShim } = await import(
      "../../server/english-sentence-explanation-skill-shim"
    );

    installEnglishSentenceExplanationSkillShim({
      ANTHROPIC_API_KEY: "anthropic-key",
      ANTHROPIC_BASE_URL: "https://api.kimi.com/coding/",
      ANTHROPIC_MODEL: "kimi-for-coding",
    });

    const result = (await (globalThis as typeof globalThis & {
      skill: (name: string, params: unknown) => Promise<unknown>;
    }).skill("english-sentence-explanation", buildSkillParams())) as {
      article: { sections: Array<{ moduleId: ModuleId; lines?: string[] }> };
      source: string;
      model: string;
    };

    expect(result.source).toBe("anthropic-compatible-api");
    expect(result.model).toBe("kimi-for-coding");
    expect(result.article.sections.map((section) => section.moduleId)).toEqual(sentenceExplanationModuleOrder);
    expect(result.article.sections.every((section) => section.lines?.length)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a best-effort complete article when the anthropic response is structurally incomplete", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/messages")) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    article: {
                      title: "Anthropic draft",
                      welcomeMessage: "Welcome",
                      introductionLines: ["Intro line"],
                      sections: [],
                      conclusionLines: ["Conclusion line"],
                    },
                  }),
                },
              ],
            }),
        } satisfies Partial<Response> as Response;
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { installEnglishSentenceExplanationSkillShim } = await import(
      "../../server/english-sentence-explanation-skill-shim"
    );

    installEnglishSentenceExplanationSkillShim({
      ANTHROPIC_API_KEY: "anthropic-key",
      ANTHROPIC_BASE_URL: "https://api.kimi.com/coding/",
      ANTHROPIC_MODEL: "kimi-for-coding",
    });

    const result = (await (globalThis as typeof globalThis & {
      skill: (name: string, params: unknown) => Promise<unknown>;
    }).skill("english-sentence-explanation", buildSkillParams())) as {
      article: {
        welcomeMessage: string;
        introductionLines: string[];
        conclusionLines: string[];
        sections: Array<{ moduleId: ModuleId; lines?: string[] }>;
      };
      source: string;
      model: string;
    };

    expect(result.source).toBe("anthropic-compatible-api");
    expect(result.model).toBe("kimi-for-coding");
    expect(result.article.welcomeMessage).toBeTruthy();
    expect(result.article.introductionLines.length).toBeGreaterThan(0);
    expect(result.article.conclusionLines.length).toBeGreaterThan(0);
    expect(result.article.sections.map((section) => section.moduleId)).toEqual(sentenceExplanationModuleOrder);
    expect(result.article.sections.every((section) => section.lines?.length)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("repairs the vocabulary section so every word keeps meaning, example, and translation without pronunciation notes", async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  article: {
                    title: "Sentence explanation",
                    welcomeMessage: "Welcome",
                    introductionLines: ["Intro line"],
                    sections: sentenceExplanationModuleOrder.map((moduleId) =>
                      moduleId === "vocabulary"
                        ? {
                            moduleId,
                            moduleName: "vocabulary",
                            imageRef: "vocabulary",
                            lines: [
                              "\u7136\u540e\u770b\u8bcd\u6c47\u89e3\u6790\u56fe\u3002",
                              "however \u7684\u53d1\u97f3\u662f something.",
                            ],
                          }
                        : {
                            moduleId,
                            moduleName: moduleId,
                            imageRef: moduleId,
                            lines: [`${moduleId} line`],
                          },
                    ),
                    conclusionLines: ["Conclusion line"],
                  },
                }),
              },
            ],
          }),
      } satisfies Partial<Response> as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const { installEnglishSentenceExplanationSkillShim } = await import(
      "../../server/english-sentence-explanation-skill-shim"
    );

    installEnglishSentenceExplanationSkillShim({
      ANTHROPIC_API_KEY: "anthropic-key",
      ANTHROPIC_BASE_URL: "https://api.kimi.com/coding/",
      ANTHROPIC_MODEL: "kimi-for-coding",
    });

    const result = (await (globalThis as typeof globalThis & {
      skill: (name: string, params: unknown) => Promise<unknown>;
    }).skill("english-sentence-explanation", buildStrictVocabularySkillParams())) as {
      article: { sections: Array<{ moduleId: ModuleId; content: string }> };
    };

    const vocabularySection = result.article.sections.find((section) => section.moduleId === "vocabulary");

    expect(vocabularySection?.content).toContain("however");
    expect(vocabularySection?.content).toContain("\u7136\u800c");
    expect(vocabularySection?.content).toContain("However, the plan still worked.");
    expect(vocabularySection?.content).toContain("\u7136\u800c\uff0c\u8fd9\u4e2a\u8ba1\u5212\u6700\u7ec8\u8fd8\u662f\u594f\u6548\u4e86\u3002");
    expect(vocabularySection?.content).toContain("mean");
    expect(vocabularySection?.content).toContain("\u6253\u7b97");
    expect(vocabularySection?.content).toContain("I mean to finish the work tonight.");
    expect(vocabularySection?.content).toContain("\u6211\u6253\u7b97\u4eca\u665a\u5b8c\u6210\u8fd9\u9879\u5de5\u4f5c\u3002");
    expect(vocabularySection?.content).not.toMatch(
      /\u97f3\u6807|\u53d1\u97f3|\u8bfb\u97f3|\u8bfb\u4f5c|\u5ff5\u4f5c/u,
    );
  });

  it("keeps the existing vocabulary explanation when the model already covered every numbered word once", async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  article: {
                    title: "Sentence explanation",
                    welcomeMessage: "Welcome",
                    introductionLines: ["Intro line"],
                    sections: sentenceExplanationModuleOrder.map((moduleId) =>
                      moduleId === "vocabulary"
                        ? {
                            moduleId,
                            moduleName: "vocabulary",
                            imageRef: "vocabulary",
                            lines: [
                              "\u7136\u540e\u770b\u8bcd\u6c47\u89e3\u6790\u56fe\u3002",
                              "\u7b2c1\u4e2a\u8bcd\u662f however\uff0c\u5b83\u662f\u526f\u8bcd\uff0c\u610f\u601d\u662f \u7136\u800c\u3002",
                              "\u4f8b\u53e5\u662f However, the plan still worked.",
                              "\u610f\u601d\u662f \u8fd9\u4e2a\u8ba1\u5212\u6700\u540e\u8fd8\u662f\u6210\u4e86\u3002",
                              "\u7b2c2\u4e2a\u8bcd\u662f mean\uff0c\u5b83\u662f\u52a8\u8bcd\uff0c\u610f\u601d\u662f \u6253\u7b97\u3002",
                              "\u4f8b\u53e5\u662f I mean to finish the work tonight.",
                              "\u610f\u601d\u662f \u6211\u4eca\u665a\u6253\u7b97\u628a\u8fd9\u9879\u5de5\u4f5c\u505a\u5b8c\u3002",
                            ],
                          }
                        : {
                            moduleId,
                            moduleName: moduleId,
                            imageRef: moduleId,
                            lines: [`${moduleId} line`],
                          },
                    ),
                    conclusionLines: ["Conclusion line"],
                  },
                }),
              },
            ],
          }),
      } satisfies Partial<Response> as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const { installEnglishSentenceExplanationSkillShim } = await import(
      "../../server/english-sentence-explanation-skill-shim"
    );

    installEnglishSentenceExplanationSkillShim({
      ANTHROPIC_API_KEY: "anthropic-key",
      ANTHROPIC_BASE_URL: "https://api.kimi.com/coding/",
      ANTHROPIC_MODEL: "kimi-for-coding",
    });

    const result = (await (globalThis as typeof globalThis & {
      skill: (name: string, params: unknown) => Promise<unknown>;
    }).skill("english-sentence-explanation", buildStrictVocabularySkillParams())) as {
      article: { sections: Array<{ moduleId: ModuleId; content: string }> };
    };

    const vocabularySection = result.article.sections.find((section) => section.moduleId === "vocabulary");

    expect(vocabularySection?.content).toContain("\u7b2c1\u4e2a\u8bcd\u662f however");
    expect(vocabularySection?.content).toContain("\u7b2c2\u4e2a\u8bcd\u662f mean");
    expect(vocabularySection?.content).not.toContain("\u8fd9\u53e5\u4f8b\u53e5\u7684\u4e2d\u6587\u7ffb\u8bd1\u662f");
  });
});
