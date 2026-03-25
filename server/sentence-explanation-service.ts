import type {
  SentenceExplanationArticle,
  SentenceExplanationRequest,
  SentenceExplanationResponse,
  SentenceExplanationSection,
} from "../src/lib/sentence-explanation-contract";
import {
  calculateSentenceExplanationTotalWordCountFromBlocks,
  joinSentenceExplanationLines,
  normalizeSentenceExplanationLines,
  sentenceExplanationModuleLabels,
  sentenceExplanationModuleOrder,
} from "../src/lib/sentence-explanation-contract";
import type { ModuleId } from "../src/lib/task-store";

interface SentenceExplanationRuntimeResult {
  article: SentenceExplanationArticle;
  source: SentenceExplanationResponse["source"];
  model: string;
}

export function orderSentenceExplanationModules(images?: SentenceExplanationRequest["images"] | null) {
  return sentenceExplanationModuleOrder.filter((moduleId) => Boolean(images?.[moduleId]));
}

function normalizeSections(sections: SentenceExplanationSection[], orderedModules: ModuleId[]) {
  return orderedModules.map((moduleId, index) => {
    const matched =
      sections.find((section) => section.moduleId === moduleId || section.imageRef === moduleId) ??
      sections[index];

    return {
      moduleId,
      moduleName: matched?.moduleName || sentenceExplanationModuleLabels[moduleId],
      imageRef: moduleId,
      content: joinSentenceExplanationLines(matched?.lines, matched?.content?.trim() || ""),
      lines: normalizeSentenceExplanationLines(matched?.lines, matched?.content?.trim() || ""),
    } satisfies SentenceExplanationSection;
  });
}

function normalizeArticle(article: SentenceExplanationArticle, orderedModules: ModuleId[]) {
  const sections = normalizeSections(article.sections, orderedModules);
  const introductionLines = normalizeSentenceExplanationLines(article.introductionLines, article.introduction);
  const conclusionLines = normalizeSentenceExplanationLines(article.conclusionLines, article.conclusion);
  const totalWordCount =
    article.totalWordCount ||
    calculateSentenceExplanationTotalWordCountFromBlocks([
      introductionLines,
      ...sections.map((section) => section.lines),
      conclusionLines,
    ]);

  return {
    ...article,
    introduction: joinSentenceExplanationLines(introductionLines),
    introductionLines,
    sections,
    conclusion: joinSentenceExplanationLines(conclusionLines),
    conclusionLines,
    totalWordCount,
    totalLineCount:
      article.totalLineCount ||
      introductionLines.length +
        sections.reduce((total, section) => total + (section.lines?.length || 0), 0) +
        conclusionLines.length,
  } satisfies SentenceExplanationArticle;
}

function validateArticleContent(article: SentenceExplanationArticle, orderedModules: ModuleId[]) {
  const missingParts: string[] = [];

  if (!article.welcomeMessage.trim()) {
    missingParts.push("welcomeMessage");
  }
  if (!article.introductionLines?.length) {
    missingParts.push("introduction");
  }
  if (!article.conclusionLines?.length) {
    missingParts.push("conclusion");
  }

  const missingModules = orderedModules.filter((moduleId) => {
    const section = article.sections.find((item) => item.moduleId === moduleId || item.imageRef === moduleId);
    return !section?.lines?.length;
  });

  if (missingModules.length) {
    missingParts.push(`sections:${missingModules.join(",")}`);
  }

  if (missingParts.length) {
    throw new Error(
      `句子讲解 skill 返回了不完整的文章内容，缺少：${missingParts.join("、")}。这通常说明 skill 输出格式与当前解析器不一致。`,
    );
  }
}

function validateInput(input: SentenceExplanationRequest, orderedModules: ModuleId[]) {
  if (!input.originalSentence?.trim()) {
    throw new Error("缺少英语原句，无法生成句子讲解。");
  }
  if (!input.bookName?.trim()) {
    throw new Error("缺少书名，无法生成句子讲解。");
  }
  if (!input.author?.trim()) {
    throw new Error("缺少作者，无法生成句子讲解。");
  }
  if (orderedModules.length !== sentenceExplanationModuleOrder.length) {
    throw new Error("句子讲解需要五张解析图全部生成完成后再使用。");
  }
  if (input.regenerationTarget && !input.currentArticle) {
    throw new Error("缺少当前讲解文章，无法只重新生成局部讲解。");
  }
  if (
    input.regenerationTarget?.type === "section" &&
    !orderedModules.includes(input.regenerationTarget.moduleId)
  ) {
    throw new Error("当前局部重生成目标无效，无法匹配对应的讲解图片。");
  }
}

export async function generateSentenceExplanation(
  input: SentenceExplanationRequest,
): Promise<SentenceExplanationResponse> {
  const orderedModules = orderSentenceExplanationModules(input.images);
  validateInput(input, orderedModules);

  const runtime = globalThis as typeof globalThis & {
    skill?: (name: string, params: unknown) => Promise<unknown>;
  };
  if (!runtime.skill) {
    throw new Error("句子讲解 skill 尚未安装。");
  }

  const result = (await runtime.skill("english-sentence-explanation", {
    ...input,
    orderedModules,
  })) as SentenceExplanationRuntimeResult;

  const normalizedArticle = normalizeArticle(result.article, orderedModules);
  validateArticleContent(normalizedArticle, orderedModules);

  return {
    article: normalizedArticle,
    orderedModules,
    source: result.source,
    model: result.model,
  };
}
