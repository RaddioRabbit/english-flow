import { describe, expect, it } from "vitest";

import { buildTranslationImageSvgDataUrl } from "@/lib/translation-image-svg";

describe("buildTranslationImageSvgDataUrl", () => {
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

    expect(dataUrl.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);

    const svg = decodeURIComponent(dataUrl.replace("data:image/svg+xml;charset=utf-8,", ""));

    expect(svg).toContain("advice");
    expect(svg).toContain("建议");
    expect(svg).toContain("data:image/png;base64,scene");
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
});
