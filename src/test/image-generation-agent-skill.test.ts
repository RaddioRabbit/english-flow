import { afterEach, describe, expect, it, vi } from "vitest";

import { generatePage11Image } from "../../server/agents/page11-image-agent";
import { generatePage221Image } from "../../server/agents/page221-image-agent";
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
