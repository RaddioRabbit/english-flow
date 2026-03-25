import { describe, expect, it } from "vitest";

import { parseArticle, parseRegeneratedBlock } from "../../server/english-sentence-explanation-skill-shim";
import { sentenceExplanationModuleOrder } from "@/lib/sentence-explanation-contract";

describe("parseArticle", () => {
  it("parses a valid article payload without requiring fullScript", () => {
    const article = parseArticle(
      JSON.stringify({
        article: {
          title: "Test title",
          welcomeMessage: "Welcome",
          introduction: "Intro",
          sections: [
            {
              moduleId: "translation",
              moduleName: "Translation",
              imageRef: "translation",
              content: "Section content",
            },
          ],
          conclusion: "Done",
          totalWordCount: 42,
        },
      }),
    );

    expect(article).toEqual(
      expect.objectContaining({
        title: "Test title",
        welcomeMessage: "Welcome",
        introduction: "Intro",
        conclusion: "Done",
        totalWordCount: 42,
      }),
    );
  });

  it("keeps provided line arrays unchanged for downstream tts mapping", () => {
    const article = parseArticle(
      JSON.stringify({
        article: {
          title: "Test title",
          welcomeMessage: "Welcome",
          introductionLines: [
            "我曾以为，长大后就能看清这个世界",
            "其实，纯真才是生命的真谛",
          ],
          sections: [
            {
              moduleId: "translation",
              moduleName: "Translation",
              imageRef: "translation",
              lines: [
                "先看图里的主场景，再回到英文原句。",
                "这样更容易抓住作者真正想强调的情绪。",
              ],
            },
          ],
          conclusionLines: ["最后把画面、中文讲解和英语原句重新连起来。"],
        },
      }),
    );

    expect(article.introductionLines).toEqual([
      "我曾以为，长大后就能看清这个世界",
      "其实，纯真才是生命的真谛",
    ]);
    expect(article.sections[0]?.lines).toEqual([
      "先看图里的主场景，再回到英文原句。",
      "这样更容易抓住作者真正想强调的情绪。",
    ]);
  });

  it("throws a truncation-specific error for incomplete fenced JSON", () => {
    const raw = `\`\`\`json
{
  "article": {
    "title": "Test title",
    "welcomeMessage": "Welcome"
`;

    expect(() => parseArticle(raw)).toThrow("句子讲解 skill 返回的 JSON 可能被截断了");
  });

  it("parses a regenerated introduction block", () => {
    const block = parseRegeneratedBlock(
      JSON.stringify({
        article: {
          welcomeMessage: "Fresh welcome",
          introductionLines: ["Fresh intro line 1", "Fresh intro line 2"],
        },
      }),
      { type: "introduction" },
    );

    expect(block).toEqual({
      type: "introduction",
      welcomeMessage: "Fresh welcome",
      introduction: "Fresh intro line 1\nFresh intro line 2",
      introductionLines: ["Fresh intro line 1", "Fresh intro line 2"],
    });
  });

  it("parses a regenerated section block and locks it to the target module", () => {
    const block = parseRegeneratedBlock(
      JSON.stringify({
        article: {
          sections: [
            {
              moduleId: "grammar",
              moduleName: "Grammar refreshed",
              imageRef: "grammar",
              lines: ["Fresh grammar line"],
            },
          ],
        },
      }),
      { type: "section", moduleId: "grammar" },
    );

    expect(block).toEqual({
      type: "section",
      moduleId: "grammar",
      moduleName: "Grammar refreshed",
      imageRef: "grammar",
      content: "Fresh grammar line",
      lines: ["Fresh grammar line"],
    });
  });

  it("parses a regenerated conclusion block", () => {
    const block = parseRegeneratedBlock(
      JSON.stringify({
        article: {
          conclusionLines: ["Fresh ending line"],
        },
      }),
      { type: "conclusion" },
    );

    expect(block).toEqual({
      type: "conclusion",
      conclusion: "Fresh ending line",
      conclusionLines: ["Fresh ending line"],
    });
  });

  it("accepts legacy module fields when sections are not returned as an array", () => {
    const article = parseArticle(
      JSON.stringify({
        article: {
          title: "Legacy title",
          welcome: "Legacy welcome",
          intro: "Legacy intro",
          translation: "Translation content",
          grammar: { content: "Grammar content" },
          summary: { text: "Summary content" },
          vocabulary: "Vocabulary content",
          ielts: { explanation: "IELTS content" },
          ending: "Legacy ending",
        },
      }),
    );

    expect(article.welcomeMessage).toBe("Legacy welcome");
    expect(article.introduction).toBe("Legacy intro");
    expect(article.conclusion).toBe("Legacy ending");
    expect(article.sections.map((section) => section.moduleId)).toEqual(sentenceExplanationModuleOrder);
    expect(article.sections.map((section) => section.content)).toEqual([
      "Translation content",
      "Grammar content",
      "Summary content",
      "Vocabulary content",
      "IELTS content",
    ]);
  });
});
