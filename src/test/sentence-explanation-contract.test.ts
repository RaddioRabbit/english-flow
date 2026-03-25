import { describe, expect, it } from "vitest";

import {
  normalizeSentenceExplanationLines,
  stripSentenceExplanationLineEndingPunctuation,
} from "@/lib/sentence-explanation-contract";

describe("sentence explanation line normalization", () => {
  it("preserves explicit sentence arrays for one-to-one article and audio mapping", () => {
    expect(
      normalizeSentenceExplanationLines([
        "我曾以为，长大后就能看清这个世界",
        "其实，纯真才是生命的真谛",
      ]),
    ).toEqual([
      "我曾以为，长大后就能看清这个世界",
      "其实，纯真才是生命的真谛",
    ]);
  });

  it("keeps sentence-ending punctuation for article display lines", () => {
    expect(
      normalizeSentenceExplanationLines(
        undefined,
        "先看句译对照图，理解句子的基本意思，再观察作者如何铺垫语气。",
      ),
    ).toEqual([
      "先看句译对照图，理解句子的基本意思，再观察作者如何铺垫语气。",
    ]);
  });

  it("prefers natural pause positions instead of hard-cutting long lines when using a narrow width", () => {
    expect(
      normalizeSentenceExplanationLines(
        undefined,
        "今天我们要学习的是丹尼尔笛福的名著《鲁滨逊漂流记》中的一个句子。",
        20,
      ),
    ).toEqual([
      "今天我们要学习的是",
      "丹尼尔笛福的名著《鲁滨逊漂流记》中的一个",
      "句子。",
    ]);
  });

  it("allows longer generated explanation lines up to the new default width", () => {
    expect(
      normalizeSentenceExplanationLines(
        undefined,
        "先看图片里的空间关系，再回到英语原句，理解作者为什么这样安排视角。",
      ),
    ).toEqual([
      "先看图片里的空间关系，再回到英语原句，理解作者为什么这样安排视角。",
    ]);
  });

  it("removes sentence-ending punctuation for subtitles", () => {
    expect(stripSentenceExplanationLineEndingPunctuation("再观察作者如何铺垫语气。")).toBe("再观察作者如何铺垫语气");
    expect(stripSentenceExplanationLineEndingPunctuation("理解句子的基本意思，")).toBe("理解句子的基本意思");
  });
});
