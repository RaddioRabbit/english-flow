import { describe, expect, it } from "vitest";

import { buildTranslationImageSvgDataUrl } from "@/lib/translation-image-svg";

describe("buildTranslationImageSvgDataUrl", () => {
  it("left-aligns panel text, uses 10% inner padding, and shrinks the font for longer paragraphs", () => {
    const shortTextSvg = decodeURIComponent(
      buildTranslationImageSvgDataUrl({
        bookName: "Robinson Crusoe",
        author: "Daniel Defoe",
        originSentence: "After all, Xury's advice was good, and we dropped our little anchor.",
        prompt1: "Advice was good.",
        prompt2: "建议很好。",
        prompt3: "We dropped anchor.",
        prompt4: "我们抛锚了。",
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
        ],
        sceneImageDataUrl: undefined,
      }).replace("data:image/svg+xml;charset=utf-8,", ""),
    );

    const longTextSvg = decodeURIComponent(
      buildTranslationImageSvgDataUrl({
        bookName: "Robinson Crusoe",
        author: "Daniel Defoe",
        originSentence: "After all, Xury's advice was good, and we dropped our little anchor.",
        prompt1: "After all, Xury's advice was good, and we dropped our little anchor beside the weathered rocks before dawn arrived.",
        prompt2: "毕竟，休里的建议很好，我们在黎明到来之前把小锚抛在风化岩石旁边。",
        prompt3: "The sea settled slowly while the boat stayed close to shore through the night.",
        prompt4: "海面慢慢平静下来，小船整夜都贴着岸边停着。",
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
        ],
        sceneImageDataUrl: undefined,
      }).replace("data:image/svg+xml;charset=utf-8,", ""),
    );

    const shortFontSize = Number(shortTextSvg.match(/font-size="([0-9.]+)"/)?.[1]);
    const longFontSize = Number(longTextSvg.match(/font-size="([0-9.]+)"/)?.[1]);

    expect(shortTextSvg).toContain('text-anchor="start"');
    expect(shortTextSvg).not.toContain('text-anchor="middle"');
    expect(shortTextSvg).toContain('x="62"');
    expect(shortTextSvg).toContain('x="532"');
    expect(shortFontSize).toBeGreaterThan(longFontSize);
    expect(longFontSize).toBeGreaterThan(0);
  });

  it("renders highlighted english and chinese text and embeds the scene image", () => {
    const dataUrl = buildTranslationImageSvgDataUrl({
      bookName: "Robinson Crusoe",
      author: "Daniel Defoe",
      originSentence: "After all, Xury's advice was good, and we dropped our little anchor.",
      prompt1: "After all, Xury's advice was good,",
      prompt2: "毕竟，休里的建议很好，",
      prompt3: "and we dropped our little anchor.",
      prompt4: "我们抛下了小锚。",
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
      ],
      sceneImageDataUrl: "data:image/png;base64,scene",
    });

    const svg = decodeURIComponent(dataUrl.replace("data:image/svg+xml;charset=utf-8,", ""));

    expect(svg).toContain("advice");
    expect(svg).toContain("建议");
    expect(svg).toContain("data:image/png;base64,scene");
  });

  it("uses the updated parchment background color for the full image", () => {
    const dataUrl = buildTranslationImageSvgDataUrl({
      bookName: "Robinson Crusoe",
      author: "Daniel Defoe",
      originSentence: "After all, Xury's advice was good, and we dropped our little anchor.",
      prompt1: "After all, Xury's advice was good,",
      prompt2: "毕竟，休里的建议很好，",
      prompt3: "and we dropped our little anchor.",
      prompt4: "我们抛下了小锚。",
      vocabulary: [],
      sceneImageDataUrl: undefined,
    });

    const svg = decodeURIComponent(dataUrl.replace("data:image/svg+xml;charset=utf-8,", ""));

    expect(svg).toContain('fill="#fbf2d5"');
  });

  it("uses SVG native text-decoration attribute (not CSS) for vocabulary underlines", () => {
    const dataUrl = buildTranslationImageSvgDataUrl({
      bookName: "Robinson Crusoe",
      author: "Daniel Defoe",
      originSentence: "After all, Xury's advice was good, and we dropped our little anchor.",
      prompt1: "After all, Xury's advice was good,",
      prompt2: "毕竟，休里的建议很好，",
      prompt3: "and we dropped our little anchor.",
      prompt4: "我们抛下了小锚。",
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
      ],
      sceneImageDataUrl: "data:image/png;base64,scene",
    });

    const svg = decodeURIComponent(dataUrl.replace("data:image/svg+xml;charset=utf-8,", ""));

    // New SVG approach: uses SVG attribute text-decoration="underline" + fill color on <tspan>
    expect(svg).toContain('text-decoration="underline"');
    // Should NOT use foreignObject or CSS class-based highlighting
    expect(svg).not.toContain("foreignObject");
    expect(svg).not.toContain("translation-highlight");
  });

  it("uses consistent colors for english words and their chinese translations", () => {
    const dataUrl = buildTranslationImageSvgDataUrl({
      bookName: "Robinson Crusoe",
      author: "Daniel Defoe",
      originSentence: "After all, Xury's advice was good, and we dropped our little anchor.",
      prompt1: "After all, Xury's advice was good,",
      prompt2: "毕竟，休里的建议很好，",
      prompt3: "and we dropped our little anchor.",
      prompt4: "我们抛下了小锚。",
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
          meaning: "小锚",
          example: "",
          translation: "",
        },
      ],
      sceneImageDataUrl: undefined,
    });

    const svg = decodeURIComponent(dataUrl.replace("data:image/svg+xml;charset=utf-8,", ""));

    // Extract tspans with both fill color and text-decoration="underline"
    const highlightMatches = Array.from(
      svg.matchAll(/text-decoration="underline"[^>]*fill="([^"]+)"|fill="([^"]+)"[^>]*text-decoration="underline"/g),
    );

    // Verify that vocabulary words are highlighted
    expect(highlightMatches.length).toBeGreaterThanOrEqual(2);

    // Get the colors used
    const colors = highlightMatches.map((m) => m[1] || m[2]);

    // English and Chinese for the same word should share the same color
    expect(colors[0]).toBe(colors[1]);

    // Different vocabulary words should have different colors
    if (colors.length >= 4) {
      expect(colors[0]).not.toBe(colors[2]);
    }
  });

  it("removes manual //index/text// markers from rendered panel text while keeping the manual highlight spans", () => {
    const dataUrl = buildTranslationImageSvgDataUrl({
      bookName: "Anne of Green Gables",
      author: "L. M. Montgomery",
      originSentence: "There was a tang in the air and a chew of gum.",
      prompt1: "There was a //1/tang// in the air.",
      prompt2: "空气中弥漫着一股//1/气息//。",
      prompt3: "She passed a \"//2/chew//\" of gum.",
      prompt4: "她递来一块“可//2/嚼//”的口香糖。",
      vocabulary: [
        {
          id: "vocab-tang",
          word: "tang",
          phonetic: "",
          partOfSpeech: "n.",
          meaning: "气味",
          example: "",
          translation: "",
        },
        {
          id: "vocab-chew",
          word: "chew",
          phonetic: "",
          partOfSpeech: "v.",
          meaning: "咀嚼",
          example: "",
          translation: "",
        },
      ],
      sceneImageDataUrl: undefined,
    });

    const svg = decodeURIComponent(dataUrl.replace("data:image/svg+xml;charset=utf-8,", ""));

    expect(svg).not.toContain("//1/");
    expect(svg).not.toContain("//2/");

    const underlinedTexts = Array.from(
      svg.matchAll(/<tspan fill="[^"]+" text-decoration="underline">([^<]+)<\/tspan>/g),
      (match) => match[1],
    );
    expect(underlinedTexts).toContain("tang");
    expect(underlinedTexts).toContain("气息");
    expect(underlinedTexts).toContain("chew");
    expect(underlinedTexts).toContain("嚼");
  });
});
