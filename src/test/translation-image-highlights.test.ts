import { describe, expect, it } from "vitest";

import { buildTranslationHighlights } from "@/lib/translation-image-highlights";

describe("buildTranslationHighlights", () => {
  it("pairs english words with matching chinese meanings in the corresponding panels", () => {
    const highlights = buildTranslationHighlights({
      prompt1: "After all, Xury's advice was good, and I took it;",
      prompt2: "毕竟，休里的建议很好，我采纳了；",
      prompt3: "we dropped our little anchor, and lay still all night.",
      prompt4: "我们抛下小锚，整夜静静停泊。",
      vocabulary: [
        {
          id: "vocab-advice",
          word: "advice",
          phonetic: "",
          partOfSpeech: "n.",
          meaning: "建议",
          example: "",
          translation: "",
        },
        {
          id: "vocab-anchor",
          word: "anchor",
          phonetic: "",
          partOfSpeech: "n.",
          meaning: "锚；小锚",
          example: "",
          translation: "",
        },
      ],
    });

    expect(highlights).toHaveLength(2);

    expect(highlights[0].english.panel).toBe("prompt1");
    expect(highlights[0].english.text.toLowerCase()).toBe("advice");
    expect(highlights[0].chinese?.panel).toBe("prompt2");
    expect(highlights[0].chinese?.text).toBe("建议");
    expect(highlights[0].color).toBe(highlights[0].english.color);
    expect(highlights[0].color).toBe(highlights[0].chinese?.color);

    expect(highlights[1].english.panel).toBe("prompt3");
    expect(highlights[1].english.text.toLowerCase()).toBe("anchor");
    expect(highlights[1].chinese?.panel).toBe("prompt4");
    expect(highlights[1].chinese?.text).toBe("小锚");
  });

  it("falls back to an approximate chinese phrase when the meaning is not an exact substring", () => {
    const highlights = buildTranslationHighlights({
      prompt1: "the waves were not so high as at first, being nearer land,",
      prompt2: "浪已经不像一开始那么高了，因为船离陆地更近。",
      prompt3: "I held my hold till the wave abated.",
      prompt4: "我死死抓住，直到浪头减弱。",
      vocabulary: [
        {
          id: "vocab-near",
          word: "nearer",
          phonetic: "",
          partOfSpeech: "adj.",
          meaning: "靠近陆地",
          example: "",
          translation: "",
        },
      ],
    });

    expect(highlights).toHaveLength(1);
    expect(highlights[0].english.panel).toBe("prompt1");
    expect(highlights[0].chinese?.panel).toBe("prompt2");
    expect(highlights[0].chinese?.text).toContain("陆地");
    expect(highlights[0].chinese?.text).toContain("近");
  });

  // 复现用户报告的问题：tempt 应该匹配 "诱惑"，而不是 "不住诱惑"
  it("should match precise chinese word instead of longer phrase containing the word", () => {
    const highlights = buildTranslationHighlights({
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

    expect(highlights).toHaveLength(1);
    expect(highlights[0].english.text.toLowerCase()).toBe("tempted");
    // 关键断言：应该匹配 "诱惑"，而不是 "不住诱惑"
    expect(highlights[0].chinese?.text).toBe("诱惑");
    expect(highlights[0].chinese?.text).not.toBe("不住诱惑");
  });

  // 更多边界情况：确保不同长度的目标词都能正确匹配
  it("should handle multiple vocabulary items with correct precise matching", () => {
    const highlights = buildTranslationHighlights({
      prompt1: "One was of snuffy colored gingham which Marilla had been tempted to buy",
      prompt2: "一件是带鼻烟色条纹的方格棉布，玛丽拉去年夏天曾受不住诱惑买来",
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
        {
          id: "vocab-buy",
          word: "buy",
          phonetic: "",
          partOfSpeech: "v.",
          meaning: "买",
          example: "",
          translation: "",
        },
      ],
    });

    expect(highlights).toHaveLength(2);
    // 验证 tempt 匹配 "诱惑" 而非 "不住诱惑"
    const temptHighlight = highlights.find(h => h.word.toLowerCase().includes("tempt"));
    expect(temptHighlight?.chinese?.text).toBe("诱惑");
  });

  // 测试：当 meaning 包含上下文包装时，优先匹配核心词
  it("should prefer core word over context-wrapped phrase when meaning contains both", () => {
    const highlights = buildTranslationHighlights({
      prompt1: "tempted",
      prompt2: "玛丽拉曾受不住诱惑",
      prompt3: "",
      prompt4: "",
      vocabulary: [
        {
          id: "vocab-tempt",
          word: "tempted",
          phonetic: "",
          partOfSpeech: "v.",
          // meaning 包含上下文包装和核心词
          meaning: "受不住诱惑；诱惑；引诱",
          example: "",
          translation: "",
        },
      ],
    });

    expect(highlights).toHaveLength(1);
    // 应该优先匹配核心词 "诱惑"，而非 "受不住诱惑"
    expect(highlights[0].chinese?.text).toBe("诱惑");
  });

  it("extracts the core word when meaning only contains a context-wrapped phrase", () => {
    const highlights = buildTranslationHighlights({
      prompt1: "tempted",
      prompt2: "玛丽拉曾受不住诱惑",
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

    expect(highlights).toHaveLength(1);
    expect(highlights[0].chinese?.text).toBe("诱惑");
    expect(highlights[0].chinese?.text).not.toBe("受不住诱惑");
  });

  // 复现 bug: meaning="不住诱惑" 时，isContextWrapper 未识别 "不住" 前缀导致选了长匹配
  it("should match core word when meaning is '不住诱惑' (not prefixed with 受)", () => {
    const highlights = buildTranslationHighlights({
      prompt1: "tempted",
      prompt2: "玛丽拉去年夏天曾受不住诱惑从一个货郎那儿买来",
      prompt3: "",
      prompt4: "",
      vocabulary: [
        {
          id: "vocab-tempt",
          word: "tempted",
          phonetic: "",
          partOfSpeech: "v.",
          meaning: "不住诱惑",
          example: "",
          translation: "",
        },
      ],
    });

    expect(highlights).toHaveLength(1);
    expect(highlights[0].chinese?.text).toBe("诱惑");
    expect(highlights[0].chinese?.text).not.toBe("不住诱惑");
  });

  // 测试：meaning 包含 "曾" 前缀时也能正确提取核心词
  it("should handle 曾 prefix in meaning", () => {
    const highlights = buildTranslationHighlights({
      prompt1: "tempted",
      prompt2: "玛丽拉曾诱惑",
      prompt3: "",
      prompt4: "",
      vocabulary: [
        {
          id: "vocab-tempt",
          word: "tempted",
          phonetic: "",
          partOfSpeech: "v.",
          meaning: "曾诱惑",
          example: "",
          translation: "",
        },
      ],
    });

    expect(highlights).toHaveLength(1);
    expect(highlights[0].chinese?.text).toBe("诱惑");
  });

  // 测试：优先选择更具体的修饰词（如 "小锚" 而非 "锚"）
  it("should prefer more specific modifier term when not context-wrapped", () => {
    const highlights = buildTranslationHighlights({
      prompt1: "anchor",
      prompt2: "我们抛下小锚",
      prompt3: "",
      prompt4: "",
      vocabulary: [
        {
          id: "vocab-anchor",
          word: "anchor",
          phonetic: "",
          partOfSpeech: "n.",
          meaning: "锚；小锚",
          example: "",
          translation: "",
        },
      ],
    });

    expect(highlights).toHaveLength(1);
    // "小锚" 不是上下文包装，而是修饰，所以优先选 "小锚"
    expect(highlights[0].chinese?.text).toBe("小锚");
  });

  it("matches the smallest semantic chinese span when the sentence translation uses a natural synonym", () => {
    const highlights = buildTranslationHighlights({
      prompt1: "",
      prompt2: "",
      prompt3: "she had picked up at a bargain counter in the winter",
      prompt4: "是冬天她在廉价柜台淘来的",
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

    expect(highlights).toHaveLength(1);
    expect(highlights[0].english.text.toLowerCase()).toBe("bargain");
    expect(highlights[0].chinese?.text).toBe("廉价");
    expect(highlights[0].chinese?.text).not.toBe("廉价柜台");
  });

  it("keeps the english underline even when the chinese match overlaps another highlight", () => {
    const highlights = buildTranslationHighlights({
      prompt1: "fragrant narcissi and thorny Scotch roses",
      prompt2: "这里有芬芳的花和带刺的玫瑰",
      prompt3: "",
      prompt4: "",
      vocabulary: [
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
          meaning: "芬芳",
          example: "",
          translation: "",
        },
      ],
    });

    expect(highlights).toHaveLength(2);
    expect(highlights[0].english.text.toLowerCase()).toBe("fragrant");
    expect(highlights[0].chinese?.text).toBe("芬芳");
    expect(highlights[1].english.text.toLowerCase()).toBe("thorny");
    expect(highlights[1].chinese).toBeUndefined();
  });

  it("can align beguiled and loitering to the actual chinese translation instead of word order", () => {
    const highlights = buildTranslationHighlights({
      prompt1: "",
      prompt2: "",
      prompt3: "it was where sunshine lingered and bees hummed, and winds, beguiled into loitering, purred and rustled.",
      prompt4: "这是一个阳光流连、蜜蜂嗡嗡、风儿被诱得徘徊不去、发出轻柔沙沙声的花园。",
      vocabulary: [
        {
          id: "vocab-linger",
          word: "lingered",
          phonetic: "",
          partOfSpeech: "v.",
          meaning: "流连；逗留",
          example: "",
          translation: "",
        },
        {
          id: "vocab-beguile",
          word: "beguiled",
          phonetic: "",
          partOfSpeech: "v.",
          meaning: "诱惑；使着迷",
          example: "",
          translation: "",
        },
        {
          id: "vocab-loiter",
          word: "loitering",
          phonetic: "",
          partOfSpeech: "v.",
          meaning: "闲逛",
          example: "",
          translation: "",
        },
      ],
    });

    expect(highlights).toHaveLength(3);
    const lingered = highlights.find((highlight) => highlight.word === "lingered");
    const beguiled = highlights.find((highlight) => highlight.word === "beguiled");
    const loitering = highlights.find((highlight) => highlight.word === "loitering");

    expect(lingered?.chinese?.text).toBe("流连");
    expect(beguiled?.english.text.toLowerCase()).toBe("beguiled");
    expect(beguiled?.chinese?.text).toBe("诱得");
    expect(loitering?.english.text.toLowerCase()).toBe("loitering");
    expect(loitering?.chinese?.text).toBe("徘徊");
  });

  it("can align thorny to the actual chinese translation used in the panel", () => {
    const highlights = buildTranslationHighlights({
      prompt1:
        "There were rosy bleeding-hearts and great splendid crimson peonies white, fragrant narcissi and thorny, sweet Scotch roses;",
      prompt2:
        "这里有娇艳欲滴的荷包牡丹和硕大艳丽的深红色牡丹；洁白芬芳的水仙花和带刺却芬香的粉色兰玫瑰；",
      prompt3: "",
      prompt4: "",
      vocabulary: [
        {
          id: "vocab-thorny",
          word: "thorny",
          phonetic: "",
          partOfSpeech: "adj.",
          meaning: "多刺的",
          example: "",
          translation: "",
        },
      ],
    });

    expect(highlights).toHaveLength(1);
    expect(highlights[0].english.text.toLowerCase()).toBe("thorny");
    expect(highlights[0].chinese?.text).toBe("带刺");
  });
});
