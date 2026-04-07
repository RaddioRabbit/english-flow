/**
 * Translation Image Highlights Skill Shim
 * 调用 Claude Code skill 生成句译对照图的中英文词汇标注数据
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TextAnalysisVocabularyCard } from "../src/lib/text-analysis-contract";
import {
  buildTranslationHighlights,
  type BuildTranslationHighlightsInput,
  type TranslationChinesePanelId,
  type TranslationEnglishPanelId,
  type TranslationHighlightSpan,
  type TranslationPanelId,
} from "../src/lib/translation-image-highlights";
import { prepareTranslationImagePanels } from "../src/lib/translation-image-prompt";
import { registerRuntimeSkill } from "./runtime-skill-registry";

export const TRANSLATION_HIGHLIGHTS_SKILL_NAME = "translation-image-highlights";

interface TranslationHighlightsSkillEnv {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_HTTP_TIMEOUT_MS?: string;
  ANTHROPIC_HTTP_MAX_RETRIES?: string;
}

export interface TranslationHighlightsInput {
  prompt1: string;
  prompt2: string;
  prompt3: string;
  prompt4: string;
  vocabulary: TextAnalysisVocabularyCard[];
  [key: string]: unknown;
}

export interface TranslationHighlightsOutput {
  highlights: TranslationHighlightSpan[];
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_OUTPUT_MAX_TOKENS = 1500;
const DEFAULT_ANTHROPIC_MODEL = "claude-3-7-sonnet-latest";

const ENGLISH_PANELS = new Set<TranslationEnglishPanelId>(["prompt1", "prompt3"]);
const CHINESE_PANELS = new Set<TranslationChinesePanelId>(["prompt2", "prompt4"]);

let shimInstalled = false;
let cachedSkillPrompt: string | null = null;

function loadSkillPrompt() {
  if (cachedSkillPrompt) {
    return cachedSkillPrompt;
  }

  const possiblePaths = [
    join(process.cwd(), ".claude", "skills", "translation-image-highlights", "SKILL.md"),
    join(__dirname, "..", ".claude", "skills", "translation-image-highlights", "SKILL.md"),
    join(__dirname, ".claude", "skills", "translation-image-highlights", "SKILL.md"),
  ];

  for (const skillPath of possiblePaths) {
    try {
      const content = readFileSync(skillPath, "utf-8");
      const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
      cachedSkillPrompt = match ? match[1].trim() : content.trim();
      return cachedSkillPrompt;
    } catch {
      continue;
    }
  }

  return getFallbackSkillPrompt();
}

function getFallbackSkillPrompt() {
  return `# Translation Image Highlights Skill

## 任务目标
根据 prompt1-4 和 vocabulary，为句译对照图返回中英文同步高亮的 JSON 数据。

## 输出要求
1. 只输出合法 JSON
2. 顶层必须是 {"highlights":[...]}
3. 每个 highlight 需要包含 word、english、chinese、color
4. 中文优先选择当前句译里最小且准确的语义对应，不要求与 meaning 字面完全相同
5. panel 只能是 prompt1/prompt2/prompt3/prompt4`;
}

function resolveModel(env: TranslationHighlightsSkillEnv) {
  return env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

function resolveApiKey(env: TranslationHighlightsSkillEnv) {
  return env.ANTHROPIC_API_KEY?.trim() || "";
}

function resolveBaseUrl(env: TranslationHighlightsSkillEnv) {
  return env.ANTHROPIC_BASE_URL?.trim() || "";
}

function resolvePositiveInteger(raw: string | undefined, fallback: number) {
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveAnthropicMessagesEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  return /\/v1$/i.test(normalized) ? `${normalized}/messages` : `${normalized}/v1/messages`;
}

function buildSimulatedClaudeCodeSystemPrompt(skillPrompt: string) {
  return [
    "You are Claude Code, a coding assistant with access to various skills.",
    "",
    "You have been asked to use the following skill:",
    "",
    "=== SKILL START ===",
    skillPrompt,
    "=== SKILL END ===",
    "",
    "## Execution Rules",
    "1. Follow the skill instructions exactly as written.",
    "2. Return ONLY the JSON output specified in the skill.",
    "3. Do not include markdown code fences.",
    "4. Do not add explanations or commentary.",
    "5. The output must be valid JSON parseable by JSON.parse().",
  ].join("\n");
}

function buildUserPrompt(input: BuildTranslationHighlightsInput) {
  return [
    "请根据以下输入数据输出句译对照图的高亮对齐 JSON：",
    "",
    JSON.stringify(
      {
        prompt1: input.prompt1,
        prompt2: input.prompt2,
        prompt3: input.prompt3,
        prompt4: input.prompt4,
        vocabulary: input.vocabulary.map((item) => ({
          word: item.word,
          meaning: item.meaning,
        })),
      },
      null,
      2,
    ),
  ].join("\n");
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractJsonCandidate(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function extractTextFromAnthropicResponse(payload: unknown) {
  const record = asRecord(payload);
  const content = Array.isArray(record.content) ? record.content : [];
  const text = content
    .map((item) => asRecord(item))
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => String(item.text).trim())
    .filter(Boolean)
    .join("\n");

  if (!text) {
    throw new Error("translation-image-highlights 接口返回内容为空。");
  }

  return text;
}

function extractProviderError(payload: unknown, rawText: string, status: number) {
  const record = asRecord(payload);
  const error = asRecord(record.error);
  return asTrimmedString(error.message) || rawText || `HTTP ${status}`;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function getDetailedErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause =
    error.cause instanceof Error
      ? error.cause.message
      : typeof error.cause === "string"
        ? error.cause
        : "";

  return [error.message, cause].filter(Boolean).join(": ");
}

function humanizeSkillError(message: string) {
  if (/only available for coding agents/i.test(message)) {
    return "当前仍在用错误协议访问 Kimi Code。请使用 ANTHROPIC_BASE_URL=https://api.kimi.com/coding/ 和 ANTHROPIC_API_KEY。";
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    return "无法连接到高亮 skill 对应的模型端点，请检查网络、DNS 或代理设置。";
  }
  if (/aborted|timeout/i.test(message)) {
    return "高亮 skill 请求超时，请稍后重试。";
  }

  return message;
}

async function requestWithRetry(
  endpoint: string,
  init: RequestInit,
  timeoutMs: number,
  maxRetries: number,
) {
  let lastError = "translation-image-highlights 请求失败。";

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        ...init,
        signal: controller.signal,
      });
      const rawText = await response.text();
      const payload = safeJsonParse(rawText);

      if (!response.ok) {
        const reason = extractProviderError(payload, rawText, response.status);
        throw new Error(`Anthropic translation-image-highlights 接口调用失败：${reason}`);
      }

      return extractTextFromAnthropicResponse(payload);
    } catch (error) {
      lastError = isAbortError(error)
        ? "高亮 skill 请求超时，请稍后重试。"
        : humanizeSkillError(getDetailedErrorMessage(error) || "translation-image-highlights 请求失败。");
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(lastError);
}

function buildSanitizedInput(input: TranslationHighlightsInput): BuildTranslationHighlightsInput {
  const panels = prepareTranslationImagePanels({
    originSentence: "",
    prompt1: input.prompt1,
    prompt2: input.prompt2,
    prompt3: input.prompt3,
    prompt4: input.prompt4,
  });

  return {
    ...panels,
    vocabulary: input.vocabulary,
  };
}

function normalizeMatch(
  rawMatch: unknown,
  panelTexts: Record<TranslationPanelId, string>,
  fallbackColor: string,
  panelSet: Set<TranslationPanelId>,
) {
  const match = asRecord(rawMatch);
  const panel = asTrimmedString(match.panel) as TranslationPanelId;
  const text = asTrimmedString(match.text);
  const color = asTrimmedString(match.color) || fallbackColor;
  const start = typeof match.start === "number" ? match.start : Number.NaN;
  const end = typeof match.end === "number" ? match.end : Number.NaN;

  if (!panelSet.has(panel) || !text || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
    return null;
  }

  const panelText = panelTexts[panel];
  if (!panelText || end > panelText.length || panelText.slice(start, end) !== text) {
    return null;
  }

  return {
    panel,
    text,
    start,
    end,
    color,
  };
}

function overlapsRange(
  occupied: Array<{ start: number; end: number }>,
  next: { start: number; end: number },
) {
  return occupied.some((range) => next.start < range.end && next.end > range.start);
}

function normalizeSkillHighlights(
  rawHighlights: unknown,
  input: BuildTranslationHighlightsInput,
): TranslationHighlightSpan[] {
  if (!Array.isArray(rawHighlights)) {
    return [];
  }

  const panelTexts: Record<TranslationPanelId, string> = {
    prompt1: input.prompt1,
    prompt2: input.prompt2,
    prompt3: input.prompt3,
    prompt4: input.prompt4,
  };
  const occupied: Record<TranslationPanelId, Array<{ start: number; end: number }>> = {
    prompt1: [],
    prompt2: [],
    prompt3: [],
    prompt4: [],
  };

  const normalized: TranslationHighlightSpan[] = [];

  for (const [index, rawHighlight] of rawHighlights.entries()) {
    const highlight = asRecord(rawHighlight);
    const word = asTrimmedString(highlight.word);
    const color = asTrimmedString(highlight.color) || "#2563eb";
    const english = normalizeMatch(highlight.english, panelTexts, color, ENGLISH_PANELS as Set<TranslationPanelId>);
    if (!word || !english || overlapsRange(occupied[english.panel], english)) {
      continue;
    }

    const expectedChinesePanel = english.panel === "prompt1" ? "prompt2" : "prompt4";
    const chinese = normalizeMatch(highlight.chinese, panelTexts, color, CHINESE_PANELS as Set<TranslationPanelId>);

    if (chinese && (chinese.panel !== expectedChinesePanel || overlapsRange(occupied[chinese.panel], chinese))) {
      continue;
    }

    occupied[english.panel].push({ start: english.start, end: english.end });
    if (chinese) {
      occupied[chinese.panel].push({ start: chinese.start, end: chinese.end });
    }

    normalized.push({
      id: asTrimmedString(highlight.id) || `translation-highlight-${index + 1}`,
      color,
      word,
      english,
      chinese: chinese ?? undefined,
    });
  }

  return normalized;
}

function buildHighlightKey(highlight: TranslationHighlightSpan) {
  return `${highlight.word.toLowerCase()}::${highlight.english.panel}::${highlight.english.start}:${highlight.english.end}`;
}

function rangesOverlap(
  left: { panel: TranslationPanelId; start: number; end: number },
  right: { panel: TranslationPanelId; start: number; end: number },
) {
  return left.panel === right.panel && left.start < right.end && left.end > right.start;
}

function highlightsOverlap(left: TranslationHighlightSpan, right: TranslationHighlightSpan) {
  if (rangesOverlap(left.english, right.english)) {
    return true;
  }

  if (left.chinese && right.chinese && rangesOverlap(left.chinese, right.chinese)) {
    return true;
  }

  return false;
}

function mergeSkillHighlights(
  skillHighlights: TranslationHighlightSpan[],
  localHighlights: TranslationHighlightSpan[],
) {
  if (!skillHighlights.length) {
    return localHighlights;
  }

  const skillByKey = new Map(skillHighlights.map((highlight) => [buildHighlightKey(highlight), highlight]));
  const localByKey = new Map(localHighlights.map((highlight) => [buildHighlightKey(highlight), highlight]));
  const merged = skillHighlights.map((highlight) => {
    const localHighlight = localByKey.get(buildHighlightKey(highlight));
    if (!localHighlight) {
      return highlight;
    }

    return {
      ...localHighlight,
      ...highlight,
      english: highlight.english,
      // Keep the local Chinese match when the skill did not return a valid one.
      chinese: highlight.chinese ?? localHighlight.chinese,
    };
  });

  for (const localHighlight of localHighlights) {
    if (skillByKey.has(buildHighlightKey(localHighlight))) {
      continue;
    }

    const overlapIndex = merged.findIndex((highlight) => highlightsOverlap(highlight, localHighlight));
    if (overlapIndex >= 0) {
      const overlappingHighlight = merged[overlapIndex];
      if (!overlappingHighlight.chinese && localHighlight.chinese) {
        merged[overlapIndex] = {
          ...overlappingHighlight,
          chinese: localHighlight.chinese,
        };
      }
      continue;
    }

    merged.push(localHighlight);
  }

  return merged;
}

async function callSkillViaLLM(
  input: BuildTranslationHighlightsInput,
  env: TranslationHighlightsSkillEnv,
) {
  const endpoint = resolveAnthropicMessagesEndpoint(resolveBaseUrl(env));
  const apiKey = resolveApiKey(env);
  const model = resolveModel(env);
  const timeoutMs = resolvePositiveInteger(env.ANTHROPIC_HTTP_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxRetries = resolvePositiveInteger(env.ANTHROPIC_HTTP_MAX_RETRIES, DEFAULT_MAX_RETRIES);

  const body = {
    model,
    max_tokens: DEFAULT_OUTPUT_MAX_TOKENS,
    temperature: 0.2,
    system: buildSimulatedClaudeCodeSystemPrompt(loadSkillPrompt()),
    messages: [
      {
        role: "user",
        content: buildUserPrompt(input),
      },
    ],
  };

  return requestWithRetry(
    endpoint,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
    maxRetries,
  );
}

async function runTranslationHighlightsSkill(
  rawInput: TranslationHighlightsInput,
  env: TranslationHighlightsSkillEnv,
): Promise<TranslationHighlightsOutput> {
  if (!resolveApiKey(env)) {
    throw new Error("缺少 translation-image-highlights 所需的 API Key。");
  }
  if (!resolveBaseUrl(env)) {
    throw new Error("缺少 translation-image-highlights 所需的 API Base URL。");
  }

  const sanitizedInput = buildSanitizedInput(rawInput);
  const raw = await callSkillViaLLM(sanitizedInput, env);
  const parsed = safeJsonParse(extractJsonCandidate(raw));
  const normalizedHighlights = normalizeSkillHighlights(asRecord(parsed).highlights, sanitizedInput);

  if (!normalizedHighlights.length) {
    throw new Error("translation-image-highlights 返回的高亮数据为空或结构不合法。");
  }

  return {
    highlights: normalizedHighlights,
  };
}

/**
 * 调用 translation-image-highlights skill
 */
export async function callTranslationHighlightsSkill(
  input: TranslationHighlightsInput,
): Promise<TranslationHighlightsOutput> {
  const sanitizedInput = buildSanitizedInput(input);
  const localHighlights = buildTranslationHighlights(sanitizedInput);
  const skillInput = {
    ...sanitizedInput,
    vocabulary: convertVocabularyToSkillInput(input.vocabulary),
  };

  try {
    const result = await (globalThis as unknown as {
      skill: (name: string, params: Record<string, unknown>) => Promise<unknown>;
    }).skill(TRANSLATION_HIGHLIGHTS_SKILL_NAME, skillInput);

    const normalizedSkillHighlights = normalizeSkillHighlights(
      asRecord(result).highlights,
      {
        ...sanitizedInput,
        vocabulary: input.vocabulary,
      },
    );

    if (normalizedSkillHighlights.length > 0) {
      return {
        highlights: mergeSkillHighlights(normalizedSkillHighlights, localHighlights),
      };
    }
  } catch (error) {
    console.error("Translation highlights skill failed:", error);
  }

  return { highlights: localHighlights };
}

export function installTranslationImageHighlightsSkillShim(env: TranslationHighlightsSkillEnv) {
  if (shimInstalled) {
    return;
  }

  registerRuntimeSkill(TRANSLATION_HIGHLIGHTS_SKILL_NAME, async (rawParams) =>
    runTranslationHighlightsSkill(rawParams as TranslationHighlightsInput, env),
  );

  shimInstalled = true;
}

/**
 * 将 TextAnalysisVocabularyCard 转换为 skill 输入格式
 */
export function convertVocabularyToSkillInput(
  vocabulary: TextAnalysisVocabularyCard[],
): Array<{ word: string; meaning: string }> {
  return vocabulary.map((v) => ({
    word: v.word,
    meaning: v.meaning,
  }));
}
