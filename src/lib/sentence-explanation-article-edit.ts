import type { SentenceExplanationArticle } from "./sentence-explanation-contract";
import {
  calculateSentenceExplanationTotalWordCountFromBlocks,
  joinSentenceExplanationLines,
  normalizeSentenceExplanationLines,
} from "./sentence-explanation-contract";
import type { ModuleId } from "./task-store";

export type SentenceExplanationEditableTextField = "introduction" | "conclusion";

function withUpdatedTotals(article: SentenceExplanationArticle): SentenceExplanationArticle {
  const introductionLines = normalizeSentenceExplanationLines(article.introductionLines, article.introduction);
  const sections = article.sections.map((section) => {
    const lines = normalizeSentenceExplanationLines(section.lines, section.content);
    return {
      ...section,
      lines,
    };
  });
  const conclusionLines = normalizeSentenceExplanationLines(article.conclusionLines, article.conclusion);

  return {
    ...article,
    introductionLines,
    sections,
    conclusionLines,
    totalWordCount: calculateSentenceExplanationTotalWordCountFromBlocks([
      introductionLines,
      ...sections.map((section) => section.lines),
      conclusionLines,
    ]),
    totalLineCount:
      introductionLines.length + sections.reduce((total, section) => total + (section.lines?.length || 0), 0) + conclusionLines.length,
  };
}

export function calculateSentenceExplanationTotalWordCount(
  article: Pick<
    SentenceExplanationArticle,
    "introduction" | "introductionLines" | "sections" | "conclusion" | "conclusionLines"
  >,
) {
  return calculateSentenceExplanationTotalWordCountFromBlocks([
    normalizeSentenceExplanationLines(article.introductionLines, article.introduction),
    ...article.sections.map((section) => normalizeSentenceExplanationLines(section.lines, section.content)),
    normalizeSentenceExplanationLines(article.conclusionLines, article.conclusion),
  ]);
}

export function updateSentenceExplanationArticleText(
  article: SentenceExplanationArticle,
  field: SentenceExplanationEditableTextField,
  value: string,
) {
  if (article[field] === value) {
    return article;
  }

  if (field === "introduction") {
    return withUpdatedTotals({
      ...article,
      introduction: value,
      introductionLines: normalizeSentenceExplanationLines(undefined, value),
    });
  }

  return withUpdatedTotals({
    ...article,
    conclusion: value,
    conclusionLines: normalizeSentenceExplanationLines(undefined, value),
  });
}

export function updateSentenceExplanationSectionContent(
  article: SentenceExplanationArticle,
  moduleId: ModuleId,
  value: string,
) {
  const sectionIndex = article.sections.findIndex((section) => section.moduleId === moduleId);
  if (sectionIndex === -1 || article.sections[sectionIndex]?.content === value) {
    return article;
  }

  const sections = article.sections.map((section, index) =>
    index === sectionIndex
      ? {
          ...section,
          content: value,
          lines: normalizeSentenceExplanationLines(undefined, value),
        }
      : section,
  );

  return withUpdatedTotals({
    ...article,
    sections,
  });
}

export function replaceSentenceExplanationIntroduction(
  article: SentenceExplanationArticle,
  payload: Pick<SentenceExplanationArticle, "welcomeMessage" | "introduction" | "introductionLines">,
) {
  return withUpdatedTotals({
    ...article,
    welcomeMessage: payload.welcomeMessage,
    introduction: joinSentenceExplanationLines(payload.introductionLines, payload.introduction),
    introductionLines: normalizeSentenceExplanationLines(payload.introductionLines, payload.introduction),
  });
}

export function replaceSentenceExplanationConclusion(
  article: SentenceExplanationArticle,
  payload: Pick<SentenceExplanationArticle, "conclusion" | "conclusionLines">,
) {
  return withUpdatedTotals({
    ...article,
    conclusion: joinSentenceExplanationLines(payload.conclusionLines, payload.conclusion),
    conclusionLines: normalizeSentenceExplanationLines(payload.conclusionLines, payload.conclusion),
  });
}

export function replaceSentenceExplanationSection(
  article: SentenceExplanationArticle,
  moduleId: ModuleId,
  payload: Pick<SentenceExplanationArticle["sections"][number], "moduleName" | "imageRef" | "content" | "lines">,
) {
  const sectionIndex = article.sections.findIndex((section) => section.moduleId === moduleId);
  if (sectionIndex === -1) {
    return article;
  }

  const currentSection = article.sections[sectionIndex];
  const nextSection = {
    ...currentSection,
    moduleName: payload.moduleName || currentSection.moduleName,
    imageRef: payload.imageRef || currentSection.imageRef,
    content: joinSentenceExplanationLines(payload.lines, payload.content),
    lines: normalizeSentenceExplanationLines(payload.lines, payload.content),
  };

  return withUpdatedTotals({
    ...article,
    sections: article.sections.map((section, index) => (index === sectionIndex ? nextSection : section)),
  });
}
