import { describe, expect, it } from "vitest";

import type { SentenceExplanationArticle } from "@/lib/sentence-explanation-contract";
import {
  calculateSentenceExplanationTotalWordCount,
  replaceSentenceExplanationConclusion,
  replaceSentenceExplanationIntroduction,
  replaceSentenceExplanationSection,
  updateSentenceExplanationArticleText,
  updateSentenceExplanationSectionContent,
} from "@/lib/sentence-explanation-article-edit";

function buildArticle(): SentenceExplanationArticle {
  return {
    title: "Sentence explanation",
    welcomeMessage: "Welcome",
    introduction: "Alpha beta",
    sections: [
      {
        moduleId: "translation",
        moduleName: "Translation",
        imageRef: "translation",
        content: "One two",
      },
      {
        moduleId: "grammar",
        moduleName: "Grammar",
        imageRef: "grammar",
        content: "Three four",
      },
    ],
    conclusion: "Five six",
    totalWordCount: 0,
  };
}

describe("sentence explanation article edit helpers", () => {
  it("counts only explanation body text and ignores whitespace", () => {
    const article = buildArticle();

    expect(calculateSentenceExplanationTotalWordCount(article)).toBe("AlphabetaOnetwoThreefourFivesix".length);
  });

  it("recalculates totalWordCount when updating introduction text", () => {
    const article = buildArticle();

    const updated = updateSentenceExplanationArticleText(article, "introduction", "Changed intro text");

    expect(updated.introduction).toBe("Changed intro text");
    expect(updated.totalWordCount).toBe("ChangedintrotextOnetwoThreefourFivesix".length);
  });

  it("recalculates totalWordCount when updating a section", () => {
    const article = buildArticle();

    const updated = updateSentenceExplanationSectionContent(article, "grammar", "Edited grammar block");

    expect(updated.sections[1]?.content).toBe("Edited grammar block");
    expect(updated.totalWordCount).toBe("AlphabetaOnetwoEditedgrammarblockFivesix".length);
  });

  it("returns the same reference when content is unchanged", () => {
    const article = buildArticle();

    expect(updateSentenceExplanationArticleText(article, "conclusion", article.conclusion)).toBe(article);
    expect(updateSentenceExplanationSectionContent(article, "translation", article.sections[0]!.content)).toBe(article);
  });

  it("replaces the introduction block with regenerated content", () => {
    const article = buildArticle();

    const updated = replaceSentenceExplanationIntroduction(article, {
      welcomeMessage: "Fresh welcome",
      introduction: "Fresh intro",
      introductionLines: ["Fresh intro"],
    });

    expect(updated.welcomeMessage).toBe("Fresh welcome");
    expect(updated.introduction).toBe("Fresh intro");
    expect(updated.introductionLines).toEqual(["Fresh intro"]);
    expect(updated.totalWordCount).toBe("FreshintroOnetwoThreefourFivesix".length);
  });

  it("replaces only the targeted section with regenerated content", () => {
    const article = buildArticle();

    const updated = replaceSentenceExplanationSection(article, "grammar", {
      moduleName: "Grammar refreshed",
      imageRef: "grammar",
      content: "Fresh grammar block",
      lines: ["Fresh grammar block"],
    });

    expect(updated.sections[1]).toEqual(
      expect.objectContaining({
        moduleName: "Grammar refreshed",
        content: "Fresh grammar block",
        lines: ["Fresh grammar block"],
      }),
    );
    expect(updated.sections[0]?.content).toBe("One two");
    expect(updated.totalWordCount).toBe("AlphabetaOnetwoFreshgrammarblockFivesix".length);
  });

  it("replaces the conclusion block with regenerated content", () => {
    const article = buildArticle();

    const updated = replaceSentenceExplanationConclusion(article, {
      conclusion: "Fresh ending",
      conclusionLines: ["Fresh ending"],
    });

    expect(updated.conclusion).toBe("Fresh ending");
    expect(updated.conclusionLines).toEqual(["Fresh ending"]);
    expect(updated.totalWordCount).toBe("AlphabetaOnetwoThreefourFreshending".length);
  });

  it("preserves raw textarea input while editing so trailing spaces do not get stripped immediately", () => {
    const article = buildArticle();

    const updatedIntroduction = updateSentenceExplanationArticleText(article, "introduction", "Changed intro text ");
    const updatedSection = updateSentenceExplanationSectionContent(article, "grammar", "Edited grammar block ");

    expect(updatedIntroduction.introduction).toBe("Changed intro text ");
    expect(updatedSection.sections[1]?.content).toBe("Edited grammar block ");
  });
});
