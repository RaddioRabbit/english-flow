import { afterEach, describe, expect, it, vi } from "vitest";

import { generatePage11Image } from "../../server/agents/page11-image-agent";
import { generatePage221Image } from "../../server/agents/page221-image-agent";
import { generatePage41Image } from "../../server/agents/page41-image-agent";
import { IMAGE_GENERATION_SKILL_NAME } from "../../server/image-generation-skill";

type RuntimeWithSkill = typeof globalThis & {
  skill?: (name: string, params: Record<string, unknown>) => Promise<unknown>;
};

const runtime = globalThis as RuntimeWithSkill;

describe("image generation agents runtime skill integration", () => {
  afterEach(() => {
    delete runtime.skill;
    vi.restoreAllMocks();
  });

  it("uses aifast-image-generation for translation image generation", async () => {
    const skill = vi.fn().mockResolvedValue({
      image_data_url: "data:image/png;base64,translation-image",
    });
    runtime.skill = skill;

    const result = await generatePage11Image({
      bookName: "Test Book",
      originSentence: "The boy opened the window.",
      prompt1: "The boy",
      prompt2: "opened",
      prompt3: "the window",
      prompt4: "carefully",
      referenceImage: "data:image/png;base64,reference-image",
    });

    expect(result.success).toBe(true);
    // Now returns SVG data URL (scene image composited with text panels)
    expect(result.imageDataUrl).toMatch(/^data:image\/svg\+xml/);
    expect(skill).toHaveBeenCalledTimes(2);
    expect(skill).toHaveBeenCalledWith(
      IMAGE_GENERATION_SKILL_NAME,
      expect.objectContaining({
        reference_image: "data:image/png;base64,reference-image",
      }),
    );
  });

  it("restricts IELTS prompt content to IELTS tips and tells the model to ignore reference-image text", async () => {
    const skill = vi.fn().mockResolvedValue({
      image_data_url: "data:image/png;base64,ielts-image",
    });
    runtime.skill = skill;

    const result = await generatePage41Image({
      ieltsTips: {
        listening: "在听力考试中，这类长句的难点是先抓主干，再根据连接词定位细节信息。",
        speaking: "口语里可以借用这种并列描写方式，把场景描述得更具体，但不要复述原句。",
        reading: "阅读时应先识别主干，再拆分修饰成分，避免被冗长描述带偏。",
        writing: "写作中可以借鉴这种层层展开的组织方式，但要改写成自己的论证句。",
      },
      referenceImage: "data:image/png;base64,reference-image",
    });

    expect(result.success).toBe(true);
    expect(skill).toHaveBeenCalledTimes(1);
    expect(skill).toHaveBeenCalledWith(
      IMAGE_GENERATION_SKILL_NAME,
      expect.objectContaining({
        reference_image: "data:image/png;base64,reference-image",
      }),
    );

    const prompt = String(skill.mock.calls[0]?.[1]?.prompt ?? "");

    expect(prompt).toContain("只能使用下面提供的雅思备考解析作为文字内容来源");
    expect(prompt).toContain("禁止出现英文原句");
    expect(prompt).toContain("禁止出现整句中文翻译");
    expect(prompt).toContain("参考图只用于借鉴版式、配色、边框、图标风格");
    expect(prompt).toContain("参考图里任何可见文字都必须忽略");
    expect(prompt).not.toContain("例句要用每个单词下方的例句");
    expect(prompt).not.toContain("还要把例句的翻译也写上");
  });

  it("falls back to local translation highlights when runtime skill output is incompatible", async () => {
    const skill = vi.fn().mockImplementation(async (name: string) => {
      if (name === IMAGE_GENERATION_SKILL_NAME) {
        return { image_data_url: "data:image/png;base64,translation-image" };
      }

      if (name === "translation-image-highlights") {
        return {
          highlights: [
            {
              id: "vocab-tempt",
              word: "tempted",
              color: "#2563eb",
              english: {
                panel: "prompt1",
                text: "tempted",
                start: 17,
                end: 24,
                color: "#2563eb",
              },
              chinese: {
                panel: "prompt2",
                text: "不住诱惑",
                start: 11,
                end: 15,
                color: "#2563eb",
              },
            },
          ],
        };
      }

      throw new Error(`Unexpected skill: ${name}`);
    });
    runtime.skill = skill;

    const result = await generatePage11Image({
      bookName: "Anne of Green Gables",
      originSentence: "Marilla had been tempted to buy from a peddler.",
      prompt1: "Marilla had been tempted to buy from a peddler",
      prompt2: "玛丽拉去年夏天曾受不住诱惑从一个货郎那儿买来",
      prompt3: "",
      prompt4: "",
      vocabulary: [
        {
          id: "vocab-tempt",
          word: "tempted",
          phonetic: "",
          partOfSpeech: "v.",
          meaning: "诱惑",
          example: "",
          translation: "",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.imageDataUrl).toMatch(/^data:image\/svg\+xml/);

    const svg = decodeURIComponent(result.imageDataUrl!.replace("data:image/svg+xml;charset=utf-8,", ""));
    const underlinedTexts = Array.from(
      svg.matchAll(/<tspan fill="([^"]+)" text-decoration="underline">([^<]+)<\/tspan>/g),
      (match) => match[2],
    );

    expect(underlinedTexts.join("")).toContain("诱惑");
    expect(underlinedTexts.join("")).not.toContain("不住诱惑");
    expect(skill).toHaveBeenCalledWith(
      "translation-image-highlights",
      expect.objectContaining({
        vocabulary: [expect.objectContaining({ word: "tempted", meaning: "诱惑" })],
      }),
    );
  });

  it("uses structurally valid translation skill output when it improves the local fallback", async () => {
    const skill = vi.fn().mockImplementation(async (name: string) => {
      if (name === IMAGE_GENERATION_SKILL_NAME) {
        return { image_data_url: "data:image/png;base64,translation-image" };
      }

      if (name === "translation-image-highlights") {
        return {
          highlights: [
            {
              id: "vocab-bargain",
              word: "bargain",
              color: "#2563eb",
              english: {
                panel: "prompt3",
                text: "bargain",
                start: 73,
                end: 80,
                color: "#2563eb",
              },
              chinese: {
                panel: "prompt4",
                text: "廉价",
                start: 17,
                end: 19,
                color: "#2563eb",
              },
            },
          ],
        };
      }

      throw new Error(`Unexpected skill: ${name}`);
    });
    runtime.skill = skill;

    const result = await generatePage11Image({
      bookName: "Anne of Green Gables",
      originSentence:
        "one was of black-and-white checkered sateen which she had picked up at a bargain counter in the winter; and one was a stiff print of an ugly blue shade which she had purchased that week at a Carmody store.",
      prompt1: "",
      prompt2: "",
      prompt3:
        "one was of black-and-white checkered sateen which she had picked up at a bargain counter in the winter; and one was a stiff print of an ugly blue shade which she had purchased that week at a Carmody store.",
      prompt4:
        "一条是黑白格子的缎子布，是冬天她在廉价柜台淘来的；还有一件是质地硬挺的印花布，颜色是难看的蓝色，那是她这周在卡莫迪的商店里买的。",
      vocabulary: [
        {
          id: "vocab-bargain",
          word: "bargain",
          phonetic: "",
          partOfSpeech: "n.",
          meaning: "便宜",
          example: "",
          translation: "",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.imageDataUrl).toMatch(/^data:image\/svg\+xml/);

    const svg = decodeURIComponent(result.imageDataUrl!.replace("data:image/svg+xml;charset=utf-8,", ""));
    const underlinedTexts = Array.from(
      svg.matchAll(/<tspan fill="([^"]+)" text-decoration="underline">([^<]+)<\/tspan>/g),
      (match) => match[2],
    );

    expect(underlinedTexts.join("")).toContain("廉价");
    expect(underlinedTexts.join("")).not.toContain("廉价柜台");
    expect(skill).toHaveBeenCalledWith(
      "translation-image-highlights",
      expect.objectContaining({
        vocabulary: [expect.objectContaining({ word: "bargain", meaning: "便宜" })],
      }),
    );
  });

  it("uses the local highlight helper when the translation highlight runtime skill is unavailable", async () => {
    const skill = vi.fn().mockImplementation(async (name: string) => {
      if (name === IMAGE_GENERATION_SKILL_NAME) {
        return { image_data_url: "data:image/png;base64,translation-image" };
      }

      if (name === "translation-image-highlights") {
        throw new Error("Unsupported runtime skill: translation-image-highlights");
      }

      throw new Error(`Unexpected skill: ${name}`);
    });
    runtime.skill = skill;

    const result = await generatePage11Image({
      bookName: "Anne of Green Gables",
      originSentence: "Marilla had been tempted to buy from a peddler.",
      prompt1: "Marilla had been tempted to buy from a peddler",
      prompt2: "玛丽拉去年夏天曾受不住诱惑从一个货郎那儿买来",
      prompt3: "",
      prompt4: "",
      vocabulary: [
        {
          id: "vocab-tempt",
          word: "tempted",
          phonetic: "",
          partOfSpeech: "v.",
          meaning: "受不住诱惑",
          example: "",
          translation: "",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.imageDataUrl).toMatch(/^data:image\/svg\+xml/);

    const svg = decodeURIComponent(result.imageDataUrl!.replace("data:image/svg+xml;charset=utf-8,", ""));
    const underlinedTexts = Array.from(
      svg.matchAll(/<tspan fill="([^"]+)" text-decoration="underline">([^<]+)<\/tspan>/g),
      (match) => match[2],
    );

    expect(underlinedTexts).toContain("诱惑");
    expect(underlinedTexts).not.toContain("受不住诱惑");
  });

  it("keeps all six selected vocabulary highlights visible in the translation SVG even when chinese phrasing is contextual", async () => {
    const skill = vi.fn().mockImplementation(async (name: string) => {
      if (name === IMAGE_GENERATION_SKILL_NAME) {
        return { image_data_url: "data:image/png;base64,translation-image" };
      }

      if (name === "translation-image-highlights") {
        throw new Error("Unsupported runtime skill: translation-image-highlights");
      }

      throw new Error(`Unexpected skill: ${name}`);
    });
    runtime.skill = skill;

    const result = await generatePage11Image({
      bookName: "Anne of Green Gables",
      originSentence:
        "There were rosy bleeding-hearts and great splendid crimson peonies white, fragrant narcissi and thorny, sweet Scotch roses; a garden it was where sunshine lingered and bees hummed, and winds, beguiled into loitering, purred and rustled.",
      prompt1:
        "There were rosy bleeding-hearts and great splendid crimson peonies white, fragrant narcissi and thorny, sweet Scotch roses;",
      prompt2:
        "这里有娇艳欲滴的荷包牡丹和硕大艳丽的深红色牡丹；洁白芬芳的水仙花和带刺却芬香的粉色兰玫瑰；",
      prompt3:
        "a garden it was where sunshine lingered and bees hummed, and winds, beguiled into loitering, purred and rustled.",
      prompt4:
        "这是一个阳光流连、蜜蜂嗡嗡、风儿被诱得徘徊不去、发出轻柔沙沙声的花园。",
      vocabulary: [
        {
          id: "vocab-crimson",
          word: "crimson",
          phonetic: "",
          partOfSpeech: "adj.",
          meaning: "深红色",
          example: "",
          translation: "",
        },
        {
          id: "vocab-fragrant",
          word: "fragrant",
          phonetic: "",
          partOfSpeech: "adj.",
          meaning: "芬芳",
          example: "",
          translation: "",
        },
        {
          id: "vocab-thorny",
          word: "thorny",
          phonetic: "",
          partOfSpeech: "adj.",
          meaning: "多刺的",
          example: "",
          translation: "",
        },
        {
          id: "vocab-lingered",
          word: "lingered",
          phonetic: "",
          partOfSpeech: "v.",
          meaning: "流连",
          example: "",
          translation: "",
        },
        {
          id: "vocab-beguiled",
          word: "beguiled",
          phonetic: "",
          partOfSpeech: "v.",
          meaning: "使着迷",
          example: "",
          translation: "",
        },
        {
          id: "vocab-loitering",
          word: "loitering",
          phonetic: "",
          partOfSpeech: "v.",
          meaning: "闲逛",
          example: "",
          translation: "",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.imageDataUrl).toMatch(/^data:image\/svg\+xml/);

    const svg = decodeURIComponent(result.imageDataUrl!.replace("data:image/svg+xml;charset=utf-8,", ""));
    const underlinedTexts = Array.from(
      svg.matchAll(/<tspan fill="([^"]+)" text-decoration="underline">([^<]+)<\/tspan>/g),
      (match) => match[2],
    );
    const highlightedText = underlinedTexts.join("");

    expect(highlightedText).toContain("crimson");
    expect(highlightedText).toContain("fragrant");
    expect(highlightedText).toContain("thorny");
    expect(highlightedText).toContain("lingered");
    expect(highlightedText).toContain("beguiled");
    expect(highlightedText).toContain("loitering");
    expect(highlightedText).toContain("深红色");
    expect(highlightedText).toContain("芬芳");
    expect(highlightedText).toContain("带刺");
    expect(highlightedText).toContain("流连");
    expect(highlightedText).toContain("诱得");
    expect(highlightedText).toContain("徘徊");
  });

  it("deduplicates overlapping tempt and tempted highlights from local fallback and runtime skill", async () => {
    const skill = vi.fn().mockImplementation(async (name: string) => {
      if (name === IMAGE_GENERATION_SKILL_NAME) {
        return { image_data_url: "data:image/png;base64,translation-image" };
      }

      if (name === "translation-image-highlights") {
        return {
          highlights: [
            {
              id: "vocab-tempt",
              word: "tempted",
              color: "#2563eb",
              english: {
                panel: "prompt1",
                text: "tempted",
                start: 17,
                end: 24,
                color: "#2563eb",
              },
              chinese: {
                panel: "prompt2",
                text: "诱惑",
                start: 13,
                end: 15,
                color: "#2563eb",
              },
            },
          ],
        };
      }

      throw new Error(`Unexpected skill: ${name}`);
    });
    runtime.skill = skill;

    const result = await generatePage11Image({
      bookName: "Anne of Green Gables",
      originSentence: "Marilla had been tempted to buy from a peddler.",
      prompt1: "Marilla had been tempted to buy from a peddler",
      prompt2: "玛丽拉去年夏天曾受不住诱惑从一个货郎那儿买来",
      prompt3: "",
      prompt4: "",
      vocabulary: [
        {
          id: "vocab-tempt",
          word: "tempt",
          phonetic: "",
          partOfSpeech: "v.",
          meaning: "诱惑",
          example: "",
          translation: "",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.imageDataUrl).toMatch(/^data:image\/svg\+xml/);

    const svg = decodeURIComponent(result.imageDataUrl!.replace("data:image/svg+xml;charset=utf-8,", ""));
    const underlinedTexts = Array.from(
      svg.matchAll(/<tspan fill="([^"]+)" text-decoration="underline">([^<]+)<\/tspan>/g),
      (match) => match[2],
    );

    expect(underlinedTexts.filter((text) => text === "tempted")).toHaveLength(1);
    expect(underlinedTexts).not.toContain("tempt");
    expect(underlinedTexts.filter((text) => text === "诱惑")).toHaveLength(1);
  });

  it("surfaces runtime skill failures from grammar image generation", async () => {
    const skill = vi.fn().mockRejectedValue(new Error("AIFAST unavailable"));
    runtime.skill = skill;

    const result = await generatePage221Image({
      originSentence: "He agreed to help when the storm arrived.",
      grammarAnalysis: {
        tense: "一般过去时",
        voice: "主动语态",
        structure: "- 主句\n- 时间状语从句\n**完整结构总结**",
      },
      referenceImage: "data:image/png;base64,reference-image",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("AIFAST unavailable");
    expect(skill).toHaveBeenCalledTimes(1);
    expect(skill).toHaveBeenCalledWith(
      IMAGE_GENERATION_SKILL_NAME,
      expect.objectContaining({
        reference_image: "data:image/png;base64,reference-image",
      }),
    );
  });
});
