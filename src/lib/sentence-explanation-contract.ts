import type { ModuleId, TextContent } from "./task-store";

export const sentenceExplanationModuleOrder: ModuleId[] = [
  "translation",
  "grammar",
  "summary",
  "vocabulary",
  "ielts",
];

export const sentenceExplanationModuleLabels: Record<ModuleId, string> = {
  translation: "句译对照",
  grammar: "句式分析",
  summary: "句式总结",
  vocabulary: "词汇解析",
  ielts: "雅思备考",
};

export const SENTENCE_EXPLANATION_MAX_LINE_LENGTH = 50;

const SENTENCE_EXPLANATION_LINE_END_PUNCTUATION = /[。！？!?；;：:，,、.．…~～'"`’”)\]】）》〉]+$/u;
const SENTENCE_EXPLANATION_STRONG_BREAK_PUNCTUATION = new Set(["。", "！", "？", "!", "?", "；", ";"]);
const SENTENCE_EXPLANATION_SOFT_BREAK_PUNCTUATION = new Set(["，", ",", "、", "：", ":", " ", "\t"]);
const SENTENCE_EXPLANATION_CLOSING_PUNCTUATION = new Set(["”", "’", ")", "]", "】", "》", "〉", "」", "』"]);
const SENTENCE_EXPLANATION_OPENING_PUNCTUATION = new Set(["“", "‘", "(", "[", "【", "《", "〈", "「", "『"]);
const SENTENCE_EXPLANATION_BREAK_AFTER_CHARS = new Set([
  "是",
  "在",
  "对",
  "把",
  "将",
  "向",
  "让",
  "使",
  "给",
  "与",
  "和",
  "并",
  "而",
  "但",
  "或",
  "又",
  "也",
  "都",
  "就",
  "的",
  "了",
]);
const SENTENCE_EXPLANATION_BREAK_AFTER_TOKENS = [
  "的是",
  "的话",
  "之前",
  "之后",
  "之中",
  "其中",
  "为了",
  "因为",
  "所以",
  "如果",
  "但是",
  "然后",
  "并且",
  "以及",
  "对于",
  "通过",
  "可以",
  "需要",
  "能够",
  "一个",
  "一种",
];

interface NormalizeSentenceExplanationLineOptions {
  stripLineEndPunctuation?: boolean;
}

function extractSentenceExplanationLineEndingPunctuation(value: string) {
  return trimSentenceExplanationLine(value).match(SENTENCE_EXPLANATION_LINE_END_PUNCTUATION)?.[0] || "";
}

function countSentenceExplanationLineCharacters(value: string) {
  return Array.from(stripSentenceExplanationLineEndingPunctuation(value).replace(/\s+/g, "")).length;
}

function trimSentenceExplanationLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function stripSentenceExplanationLineEndingPunctuation(value: string) {
  return trimSentenceExplanationLine(value).replace(SENTENCE_EXPLANATION_LINE_END_PUNCTUATION, "").trim();
}

function scoreSentenceExplanationBreakIndex(
  characters: string[],
  breakIndex: number,
  maxLineLength: number,
) {
  const previous = characters[breakIndex - 1] || "";
  const next = characters[breakIndex] || "";
  const recentText = characters.slice(Math.max(0, breakIndex - 4), breakIndex).join("");
  const minimumPreferredIndex = Math.max(4, Math.floor(maxLineLength * 0.4));
  let score = breakIndex / maxLineLength;

  if (breakIndex < minimumPreferredIndex) {
    score -= (minimumPreferredIndex - breakIndex) * 4;
  }

  if (SENTENCE_EXPLANATION_STRONG_BREAK_PUNCTUATION.has(previous)) {
    score += 120;
  } else if (SENTENCE_EXPLANATION_SOFT_BREAK_PUNCTUATION.has(previous)) {
    score += 90;
  } else if (SENTENCE_EXPLANATION_CLOSING_PUNCTUATION.has(previous)) {
    score += 65;
  } else if (SENTENCE_EXPLANATION_BREAK_AFTER_TOKENS.some((token) => recentText.endsWith(token))) {
    score += 75;
  } else if (SENTENCE_EXPLANATION_BREAK_AFTER_CHARS.has(previous)) {
    score += 45;
  }

  if (SENTENCE_EXPLANATION_OPENING_PUNCTUATION.has(previous)) {
    score -= 30;
  }

  if (SENTENCE_EXPLANATION_CLOSING_PUNCTUATION.has(next)) {
    score -= 20;
  }

  if (next === "·" || previous === "·") {
    score -= 10;
  }

  return score;
}

function findSentenceExplanationBreakIndex(
  characters: string[],
  maxLineLength: number,
) {
  const maxIndex = Math.min(maxLineLength, characters.length - 1);
  let bestBreakIndex = Math.min(maxLineLength, characters.length);
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let breakIndex = 1; breakIndex <= maxIndex; breakIndex += 1) {
    const score = scoreSentenceExplanationBreakIndex(characters, breakIndex, maxLineLength);
    if (score > bestScore) {
      bestScore = score;
      bestBreakIndex = breakIndex;
    }
  }

  return bestBreakIndex;
}

function splitSentenceExplanationChunk(
  value: string,
  maxLineLength = SENTENCE_EXPLANATION_MAX_LINE_LENGTH,
  options?: NormalizeSentenceExplanationLineOptions,
) {
  const normalized = trimSentenceExplanationLine(value);
  if (!normalized) {
    return [];
  }

  if (countSentenceExplanationLineCharacters(normalized) <= maxLineLength) {
    return [options?.stripLineEndPunctuation ? stripSentenceExplanationLineEndingPunctuation(normalized) : normalized].filter(Boolean);
  }

  const trailingPunctuation = extractSentenceExplanationLineEndingPunctuation(normalized);
  const coreText = trailingPunctuation
    ? trimSentenceExplanationLine(normalized.slice(0, normalized.length - trailingPunctuation.length))
    : normalized;
  const lines: string[] = [];
  let remaining = coreText;

  while (remaining) {
    if (countSentenceExplanationLineCharacters(remaining) <= maxLineLength) {
      lines.push(remaining);
      break;
    }

    const characters = Array.from(remaining);
    const breakIndex = findSentenceExplanationBreakIndex(characters, maxLineLength);
    const nextLine = trimSentenceExplanationLine(characters.slice(0, breakIndex).join(""));
    const rest = trimSentenceExplanationLine(characters.slice(breakIndex).join(""));

    if (!nextLine || !rest) {
      lines.push(trimSentenceExplanationLine(characters.slice(0, maxLineLength).join("")));
      remaining = trimSentenceExplanationLine(characters.slice(maxLineLength).join(""));
      continue;
    }

    lines.push(nextLine);
    remaining = rest;
  }

  if (trailingPunctuation && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1]}${trailingPunctuation}`;
  }

  return lines
    .map((line) => (options?.stripLineEndPunctuation ? stripSentenceExplanationLineEndingPunctuation(line) : line))
    .filter(Boolean);
}

function splitSentenceExplanationTextIntoSentences(value: string) {
  return value
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .flatMap((segment) => {
      const normalized = trimSentenceExplanationLine(segment);
      if (!normalized) {
        return [];
      }

      const characters = Array.from(normalized);
      const segments: string[] = [];
      let buffer = "";

      for (let index = 0; index < characters.length; index += 1) {
        buffer += characters[index];

        if (!SENTENCE_EXPLANATION_STRONG_BREAK_PUNCTUATION.has(characters[index])) {
          continue;
        }

        while (
          index + 1 < characters.length &&
          SENTENCE_EXPLANATION_CLOSING_PUNCTUATION.has(characters[index + 1])
        ) {
          buffer += characters[index + 1];
          index += 1;
        }

        segments.push(buffer);
        buffer = "";
      }

      if (trimSentenceExplanationLine(buffer)) {
        segments.push(buffer);
      }

      return segments;
    });
}

function normalizeExplicitSentenceExplanationLines(
  lines: string[],
  options?: NormalizeSentenceExplanationLineOptions,
) {
  return lines
    .map((line) => trimSentenceExplanationLine(line))
    .filter(Boolean)
    .map((line) => (options?.stripLineEndPunctuation ? stripSentenceExplanationLineEndingPunctuation(line) : line))
    .filter(Boolean);
}

export function normalizeSentenceExplanationLines(
  lines?: string[] | null,
  fallbackText = "",
  maxLineLength = SENTENCE_EXPLANATION_MAX_LINE_LENGTH,
  options?: NormalizeSentenceExplanationLineOptions,
) {
  if (Array.isArray(lines) && lines.length) {
    return normalizeExplicitSentenceExplanationLines(lines, options);
  }

  return splitSentenceExplanationTextIntoSentences(fallbackText)
    .map((line) => trimSentenceExplanationLine(line))
    .filter(Boolean)
    .flatMap((line) => splitSentenceExplanationChunk(line, maxLineLength, options))
    .filter(Boolean);
}

export function normalizeSentenceExplanationSubtitleLines(
  lines?: string[] | null,
  fallbackText = "",
  maxLineLength = SENTENCE_EXPLANATION_MAX_LINE_LENGTH,
) {
  return normalizeSentenceExplanationLines(lines, fallbackText, maxLineLength, {
    stripLineEndPunctuation: true,
  });
}

export function joinSentenceExplanationLines(
  lines?: string[] | null,
  fallbackText = "",
  maxLineLength = SENTENCE_EXPLANATION_MAX_LINE_LENGTH,
  options?: NormalizeSentenceExplanationLineOptions,
) {
  return normalizeSentenceExplanationLines(lines, fallbackText, maxLineLength, options).join("\n");
}

export function calculateSentenceExplanationTotalWordCountFromBlocks(blocks: Array<string[] | string | null | undefined>) {
  return blocks
    .flatMap((block) =>
      Array.isArray(block)
        ? block.map((line) => stripSentenceExplanationLineEndingPunctuation(line))
        : normalizeSentenceExplanationSubtitleLines(undefined, typeof block === "string" ? block : ""),
    )
    .join("")
    .replace(/\s+/g, "")
    .length;
}

export interface SentenceExplanationSection {
  moduleId: ModuleId;
  moduleName: string;
  imageRef: ModuleId;
  content: string;
  lines?: string[];
}

export interface SentenceExplanationArticle {
  title: string;
  welcomeMessage: string;
  introduction: string;
  introductionLines?: string[];
  sections: SentenceExplanationSection[];
  conclusion: string;
  conclusionLines?: string[];
  totalWordCount: number;
  totalLineCount?: number;
}

export type SentenceExplanationRegenerationTarget =
  | {
      type: "introduction";
    }
  | {
      type: "section";
      moduleId: ModuleId;
    }
  | {
      type: "conclusion";
    };

export function getSentenceExplanationRegenerationTargetKey(target: SentenceExplanationRegenerationTarget) {
  return target.type === "section" ? `section:${target.moduleId}` : target.type;
}

export interface SentenceExplanationRequest {
  taskId: string;
  originalSentence: string;
  bookName: string;
  author: string;
  textContent: TextContent;
  images: Partial<Record<ModuleId, string>>;
  currentArticle?: SentenceExplanationArticle;
  regenerationTarget?: SentenceExplanationRegenerationTarget;
}

export interface SentenceExplanationResponse {
  article: SentenceExplanationArticle;
  orderedModules: ModuleId[];
  source: "anthropic-compatible-api" | "openai-compatible-api";
  model: string;
}
