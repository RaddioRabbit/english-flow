import { describe, expect, it } from "vitest";

import {
  buildTranslationImagePrompt,
  prepareTranslationImagePanels,
  sanitizeSceneReference,
  sanitizeSegmentationTranslationText,
  sanitizeTranslationPanelText,
} from "@/lib/translation-image-prompt";

describe("sanitizeTranslationPanelText", () => {
  it("strips leading panel labels from english and chinese text", () => {
    expect(sanitizeTranslationPanelText("Part 1: After all, Xury's advice was good.")).toBe(
      "After all, Xury's advice was good.",
    );
    expect(sanitizeTranslationPanelText("第一部分：毕竟，Xury 的建议很好。")).toBe("毕竟，Xury 的建议很好。");
    expect(sanitizeTranslationPanelText('"Prompt 4: 中文翻译第四格"')).toBe("中文翻译第四格");
  });
});

describe("sanitizeSegmentationTranslationText", () => {
  it("removes scene-analysis prefixes from segmentation translations", () => {
    expect(sanitizeSegmentationTranslationText("前半部分描述航行初期的天气状况和沿海岸线的行程，直到抵达圣奥古斯丁角。")).toBe(
      "航行初期的天气状况和沿海岸线的行程，直到抵达圣奥古斯丁角。",
    );
    expect(sanitizeSegmentationTranslationText("后半部分描述离开海岸后的航行：从圣奥古斯丁角起远离海岸，驶离陆地视线。")).toBe(
      "从圣奥古斯丁角起远离海岸，驶离陆地视线。",
    );
  });
});

describe("sanitizeSceneReference", () => {
  it("removes wrapping quotes and flattens whitespace", () => {
    expect(sanitizeSceneReference("  \"After all, Xury's advice\nwas good.\"  ")).toBe(
      "After all, Xury's advice was good.",
    );
  });
});

describe("prepareTranslationImagePanels", () => {
  it("keeps only the expected half when a field contains both halves", () => {
    const panels = prepareTranslationImagePanels({
      originSentence: "ignored",
      prompt1: "First half: I thought he was pursued by some savage.",
      prompt2: "前半部分：叙述者以为舒利被野人追赶。后半部分：走近后发现他肩上挂着猎物。",
      prompt3: "Second half: however, we were very glad of it.",
      prompt4: "后半部分：尽管如此，他们仍很高兴，肉也很美味；",
    });

    expect(panels.prompt1).toBe("I thought he was pursued by some savage.");
    expect(panels.prompt2).toBe("叙述者以为舒利被野人追赶。");
    expect(panels.prompt3).toBe("however, we were very glad of it.");
    expect(panels.prompt4).toBe("尽管如此，他们仍很高兴，肉也很美味；");
  });
});

describe("buildTranslationImagePrompt", () => {
  it("keeps only cleaned panel text and forbids extra scene text", () => {
    const prompt = buildTranslationImagePrompt({
      originSentence:
        "After all, Xury's advice was good, and I took it; we dropped our little anchor, and lay still all night.",
      prompt1: "Part 1: After all, Xury's advice was good, and I took it;",
      prompt2: "第一部分：毕竟，Xury 的建议很好，我采纳了；",
      prompt3: "Prompt3: we dropped our little anchor, and lay still all night.",
      prompt4: "第二部分：我们抛下小锚，整夜静静地躺着。",
    });

    expect(prompt).toContain("After all, Xury's advice was good, and I took it;");
    expect(prompt).toContain("毕竟，Xury 的建议很好，我采纳了；");
    expect(prompt).not.toContain("Part 1:");
    expect(prompt).not.toContain("Prompt3:");
    expect(prompt).not.toContain("第一部分：");
    expect(prompt).not.toContain("第二部分：");
    expect(prompt).not.toContain("前半部分：");
    expect(prompt).not.toContain("后半部分：");
    expect(prompt).toContain("下方合并大图里不要出现任何文字元素");
    expect(prompt).not.toContain("A peaceful scene from");
  });
});
