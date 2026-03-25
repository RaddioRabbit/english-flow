import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  replaceSentenceExplanationConclusion,
  replaceSentenceExplanationIntroduction,
  replaceSentenceExplanationSection,
} from "../src/lib/sentence-explanation-article-edit";
import type {
  SentenceExplanationArticle,
  SentenceExplanationRegenerationTarget,
  SentenceExplanationRequest,
  SentenceExplanationResponse,
} from "../src/lib/sentence-explanation-contract";
import {
  SENTENCE_EXPLANATION_MAX_LINE_LENGTH,
  calculateSentenceExplanationTotalWordCountFromBlocks,
  joinSentenceExplanationLines,
  normalizeSentenceExplanationLines,
  sentenceExplanationModuleLabels,
  sentenceExplanationModuleOrder,
} from "../src/lib/sentence-explanation-contract";
import type { ModuleId } from "../src/lib/task-store";
import { registerRuntimeSkill } from "./runtime-skill-registry";

interface SentenceExplanationEnv {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  OPENAI_HTTP_TIMEOUT_MS?: string;
  OPENAI_HTTP_MAX_RETRIES?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_HTTP_TIMEOUT_MS?: string;
  ANTHROPIC_HTTP_MAX_RETRIES?: string;
}

type Provider = "anthropic" | "openai";

type ExplanationSkillParams = SentenceExplanationRequest & {
  orderedModules: ModuleId[];
};

type ExplanationSkillResult = Pick<SentenceExplanationResponse, "article" | "source" | "model">;

type ParsedImageSource = {
  mediaType: string;
  data: string;
};

type ParsedRegeneratedBlock =
  | {
      type: "introduction";
      welcomeMessage: string;
      introduction: string;
      introductionLines: string[];
    }
  | {
      type: "section";
      moduleId: ModuleId;
      moduleName: string;
      imageRef: ModuleId;
      content: string;
      lines: string[];
    }
  | {
      type: "conclusion";
      conclusion: string;
      conclusionLines: string[];
    };

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_REMOTE_IMAGE_TIMEOUT_MS = 30_000;
const DEFAULT_OUTPUT_MAX_TOKENS = 5000;
const DEFAULT_ANTHROPIC_MODEL = "claude-3-7-sonnet-latest";
const DEFAULT_OPENAI_MODEL = "gpt-4.1";
const DEFAULT_WELCOME_MESSAGE = "欢迎来到英语名著句子讲解小课堂";
const SKILL_DOCUMENT_PATH = resolve(process.cwd(), ".claude/skills/english-sentence-explanation/SKILL.md");

let shimInstalled = false;
let cachedSkillPrompt: Promise<string> | null = null;

function loadSkillPrompt() {
  if (!cachedSkillPrompt) {
    cachedSkillPrompt = readFile(SKILL_DOCUMENT_PATH, "utf8").then(stripFrontMatter);
  }

  return cachedSkillPrompt;
}

function stripFrontMatter(markdown: string) {
  if (!markdown.startsWith("---")) {
    return markdown.trim();
  }

  const closingIndex = markdown.indexOf("\n---", 3);
  if (closingIndex < 0) {
    return markdown.trim();
  }

  return markdown.slice(closingIndex + 4).trim();
}

function resolveProvider(env: SentenceExplanationEnv): Provider {
  return env.ANTHROPIC_BASE_URL?.trim() || env.ANTHROPIC_API_KEY?.trim() ? "anthropic" : "openai";
}

function resolveModel(env: SentenceExplanationEnv, provider: Provider) {
  if (provider === "anthropic") {
    return env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
  }

  return env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

function resolveApiKey(env: SentenceExplanationEnv, provider: Provider) {
  return provider === "anthropic"
    ? env.ANTHROPIC_API_KEY?.trim() || ""
    : env.OPENAI_API_KEY?.trim() || "";
}

function resolveBaseUrl(env: SentenceExplanationEnv, provider: Provider) {
  return provider === "anthropic"
    ? env.ANTHROPIC_BASE_URL?.trim() || ""
    : env.OPENAI_BASE_URL?.trim() || "";
}

function resolvePositiveInteger(raw: string | undefined, fallback: number) {
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hasRegenerationTarget(
  params: ExplanationSkillParams,
): params is ExplanationSkillParams & {
  currentArticle: SentenceExplanationArticle;
  regenerationTarget: SentenceExplanationRegenerationTarget;
} {
  return Boolean(params.currentArticle && params.regenerationTarget);
}

function getTargetLabel(target: SentenceExplanationRegenerationTarget) {
  if (target.type === "section") {
    return `${sentenceExplanationModuleLabels[target.moduleId]} (${target.moduleId})`;
  }

  return target.type === "introduction" ? "opening block" : "conclusion block";
}

function getPromptImageModules(params: ExplanationSkillParams) {
  if (params.regenerationTarget?.type === "section") {
    return [params.regenerationTarget.moduleId];
  }

  return params.orderedModules;
}

function buildJsonOutputContract(target?: SentenceExplanationRegenerationTarget) {
  if (!target) {
    return [
      "Return exactly one top-level JSON object with an article field.",
      "Inside article, include only: title, welcomeMessage, introduction, introductionLines, sections, conclusion, conclusionLines, totalWordCount, totalLineCount.",
    ];
  }

  if (target.type === "introduction") {
    return [
      "Return exactly one top-level JSON object with an article field.",
      "Inside article, include only: welcomeMessage, introduction, introductionLines.",
      "Do not include title, sections, conclusion, totalWordCount, or totalLineCount.",
    ];
  }

  if (target.type === "conclusion") {
    return [
      "Return exactly one top-level JSON object with an article field.",
      "Inside article, include only: conclusion, conclusionLines.",
      "Do not include title, welcomeMessage, introduction, sections, totalWordCount, or totalLineCount.",
    ];
  }

  return [
    "Return exactly one top-level JSON object with an article field.",
    "Inside article, include only: sections.",
    `article.sections must be an array with exactly one section for moduleId ${target.moduleId}.`,
    "That section must include: moduleId, moduleName, imageRef, content, lines.",
    "Do not include title, welcomeMessage, introduction, conclusion, totalWordCount, or totalLineCount.",
  ];
}

function buildUserPrompt(params: ExplanationSkillParams) {
  const outputContract = buildJsonOutputContract(params.regenerationTarget);
  const imageModules = getPromptImageModules(params);

  const lines = [
    "Important clarification: the skill rule about avoiding special symbols applies only to the natural-language article text fields, not to the JSON wrapper itself.",
    "The final response must be valid JSON, so all required JSON punctuation must be preserved.",
    "If the no-symbol writing rule conflicts with valid JSON output, valid JSON takes priority.",
    ...outputContract,
    "Do not include markdown code fences, comments, or extra keys.",
    `Every display line must stay within ${SENTENCE_EXPLANATION_MAX_LINE_LENGTH} characters after whitespace is removed and sentence-ending punctuation is ignored.`,
    "All explanation text must be arrayized.",
    "Each array item represents exactly one displayed explanation line, one TTS segment, and one subtitle segment.",
    "Do not merge multiple explanation lines into one string item, and do not return paragraph-only content without line arrays.",
    "Place line breaks at punctuation marks, pause positions, or other natural phrasing boundaries whenever possible.",
    "Keep sentence-ending punctuation in the article display lines when it belongs to the end of the sentence.",
    "Vocabulary section rule: cover every item from textContent.vocabulary.",
    "For each vocabulary item, explicitly include the word, partOfSpeech, meaning, example sentence, and the Chinese translation of that example sentence.",
    "Do not explain phonetic symbols and do not write phrases such as 音标是, 发音是, 读作, or 念作. TTS will read the word itself.",
  ];

  if (!params.regenerationTarget) {
    lines.push(
      "Generate the complete sentence explanation article.",
      "Each section explanation must be anchored to its corresponding image and use that image to explain the user's original English sentence.",
      "The introduction and conclusion must also include line arrays for TTS and subtitles.",
      "Follow the ordered module sequence exactly.",
      ...params.orderedModules.map(
        (moduleId, index) => `${index + 1}. ${sentenceExplanationModuleLabels[moduleId]} (${moduleId})`,
      ),
    );
  } else {
    lines.push(
      `Task mode: partial regeneration for ${getTargetLabel(params.regenerationTarget)}.`,
      "Regenerate only the requested block.",
      "Keep the style, tone, and continuity aligned with the current full article.",
      "The server will merge your regenerated block back into the current article, so untouched blocks must not be rewritten.",
    );

    if (params.regenerationTarget.type === "section") {
      lines.push(
        `Only regenerate the section for moduleId ${params.regenerationTarget.moduleId}.`,
        "Use the attached target image to explain that specific module.",
      );
    } else if (params.regenerationTarget.type === "introduction") {
      lines.push(
        "Regenerate the opening block, including welcomeMessage and introduction.",
        "The opening should frame the lesson naturally and connect to the original sentence and upcoming image sequence.",
      );
    } else {
      lines.push(
        "Regenerate only the closing block.",
        "The conclusion should wrap up the lesson naturally without rewriting earlier sections.",
      );
    }
  }

  lines.push(
    "",
    "Structured input:",
    JSON.stringify(
      {
        originalSentence: params.originalSentence,
        bookName: params.bookName,
        author: params.author,
        textContent: params.textContent,
        orderedModules: params.orderedModules,
        regenerationTarget: params.regenerationTarget ?? null,
        currentArticle: params.currentArticle ?? null,
        imageModules,
      },
      null,
      2,
    ),
  );

  return lines.join("\n");
}

function validateSkillParams(params: ExplanationSkillParams, env: SentenceExplanationEnv) {
  if (!params.originalSentence?.trim()) {
    throw new Error("缺少英语原句，无法生成句子讲解。");
  }
  if (!params.bookName?.trim()) {
    throw new Error("缺少书名，无法生成句子讲解。");
  }
  if (!params.author?.trim()) {
    throw new Error("缺少作者，无法生成句子讲解。");
  }
  if (!params.orderedModules.length) {
    throw new Error("缺少排序后的解析图片，无法生成句子讲解。");
  }
  if (params.regenerationTarget && !params.currentArticle) {
    throw new Error("缺少当前讲解文章，无法局部重新生成。");
  }
  if (
    params.regenerationTarget?.type === "section" &&
    !params.orderedModules.includes(params.regenerationTarget.moduleId)
  ) {
    throw new Error("当前局部重生成目标无效，无法匹配对应图片。");
  }

  const provider = resolveProvider(env);
  if (!resolveApiKey(env, provider)) {
    throw new Error("缺少句子讲解模型的 API Key。");
  }
  if (!resolveBaseUrl(env, provider)) {
    throw new Error("缺少句子讲解模型的 API Base URL。");
  }
}

function parseDataUrl(source: string): ParsedImageSource {
  const match = source.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL.");
  }

  return {
    mediaType: match[1],
    data: match[2],
  };
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (isAbortError(error)) {
    return fallback;
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

export async function loadRemoteImageSource(
  source: string,
  timeoutMs = DEFAULT_REMOTE_IMAGE_TIMEOUT_MS,
): Promise<ParsedImageSource> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(source, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to download image for sentence explanation. HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      mediaType: response.headers.get("content-type") || "image/png",
      data: buffer.toString("base64"),
    };
  } catch (error) {
    throw new Error(getErrorMessage(error, "下载句子讲解图片超时，请稍后重试。"));
  } finally {
    clearTimeout(timer);
  }
}

async function normalizeImageSource(source: string, remoteImageTimeoutMs = DEFAULT_REMOTE_IMAGE_TIMEOUT_MS) {
  if (source.startsWith("data:")) {
    return parseDataUrl(source);
  }

  if (source.startsWith("http://") || source.startsWith("https://")) {
    return loadRemoteImageSource(source, remoteImageTimeoutMs);
  }

  throw new Error("Unsupported image source for sentence explanation.");
}

async function buildAnthropicContent(params: ExplanationSkillParams) {
  const content: Array<Record<string, unknown>> = [{ type: "text", text: buildUserPrompt(params) }];
  const moduleIds = getPromptImageModules(params);
  const resolvedImages = await Promise.all(
    moduleIds.map(async (moduleId) => {
      const source = params.images[moduleId];
      if (!source) {
        return null;
      }

      try {
        const image = await normalizeImageSource(source);
        return { moduleId, image };
      } catch (error) {
        throw new Error(
          `${sentenceExplanationModuleLabels[moduleId]} 图片加载失败：${getErrorMessage(
            error,
            "句子讲解图片预处理失败，请稍后重试。",
          )}`,
        );
      }
    }),
  );

  for (const resolvedImage of resolvedImages) {
    if (!resolvedImage) {
      continue;
    }

    const { moduleId, image } = resolvedImage;
    content.push({ type: "text", text: `下面这张图对应模块：${sentenceExplanationModuleLabels[moduleId]} (${moduleId})` });
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType,
        data: image.data,
      },
    });
  }

  return content;
}

function buildOpenAiContent(params: ExplanationSkillParams) {
  const content: Array<Record<string, unknown>> = [{ type: "text", text: buildUserPrompt(params) }];

  for (const moduleId of getPromptImageModules(params)) {
    const source = params.images[moduleId];
    if (!source) {
      continue;
    }

    content.push({ type: "text", text: `下面这张图对应模块：${sentenceExplanationModuleLabels[moduleId]} (${moduleId})` });
    content.push({
      type: "image_url",
      image_url: {
        url: source,
      },
    });
  }

  return content;
}

function resolveAnthropicMessagesEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  return /\/v1$/i.test(normalized) ? `${normalized}/messages` : `${normalized}/v1/messages`;
}

function buildSystemInstruction(target?: SentenceExplanationRegenerationTarget) {
  return [
    "Return JSON only, with no markdown code fence and no extra explanation.",
    "The no-symbol writing rule applies only to natural-language article text fields, not to JSON punctuation.",
    ...buildJsonOutputContract(target),
    `Every display line must stay within ${SENTENCE_EXPLANATION_MAX_LINE_LENGTH} characters after whitespace is removed and sentence-ending punctuation is ignored.`,
    "All explanation text must be arrayized. Each array item must map to one display line and one TTS segment.",
    "Keep natural sentence-ending punctuation in display lines.",
  ].join(" ");
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
    throw new Error("Anthropic 句子讲解接口返回内容为空。");
  }

  return text;
}

function extractTextFromOpenAiResponse(payload: unknown) {
  const record = asRecord(payload);
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const message = asRecord(asRecord(choices[0]).message);
  const content = message.content;

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((item) => asRecord(item))
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => String(item.text).trim())
      .filter(Boolean)
      .join("\n");

    if (text) {
      return text;
    }
  }

  throw new Error("OpenAI 句子讲解接口返回内容为空。");
}

function extractProviderError(payload: unknown, rawText: string, status: number) {
  const record = asRecord(payload);
  const error = asRecord(record.error);
  return asTrimmedString(error.message) || rawText || `HTTP ${status}`;
}

async function requestWithRetry(
  endpoint: string,
  init: RequestInit,
  timeoutMs: number,
  maxRetries: number,
  extractText: (payload: unknown) => string,
  errorPrefix: string,
) {
  let lastError = "句子讲解请求失败。";

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
        throw new Error(`${errorPrefix}：${reason}`);
      }

      return extractText(payload);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "句子讲解请求失败。";
      lastError = getErrorMessage(error, "句子讲解模型请求超时，请稍后重试。");
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

async function callAnthropicSkill(
  params: ExplanationSkillParams,
  env: SentenceExplanationEnv,
  model: string,
  timeoutMs: number,
  maxRetries: number,
) {
  const endpoint = resolveAnthropicMessagesEndpoint(resolveBaseUrl(env, "anthropic"));
  const apiKey = resolveApiKey(env, "anthropic");
  const systemPrompt = await loadSkillPrompt();
  const body = {
    model,
    max_tokens: DEFAULT_OUTPUT_MAX_TOKENS,
    temperature: 0.4,
    system: `${systemPrompt}\n\n${buildSystemInstruction(params.regenerationTarget)}`,
    messages: [
      {
        role: "user",
        content: await buildAnthropicContent(params),
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
    extractTextFromAnthropicResponse,
    "Anthropic 句子讲解接口调用失败",
  );
}

async function callOpenAiSkill(
  params: ExplanationSkillParams,
  env: SentenceExplanationEnv,
  model: string,
  timeoutMs: number,
  maxRetries: number,
) {
  const endpoint = `${resolveBaseUrl(env, "openai").replace(/\/$/, "")}/chat/completions`;
  const apiKey = resolveApiKey(env, "openai");
  const systemPrompt = await loadSkillPrompt();
  const body = {
    model,
    max_tokens: DEFAULT_OUTPUT_MAX_TOKENS,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: `${systemPrompt}\n\n${buildSystemInstruction(params.regenerationTarget)}`,
      },
      {
        role: "user",
        content: buildOpenAiContent(params),
      },
    ],
  };

  return requestWithRetry(
    endpoint,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
    maxRetries,
    extractTextFromOpenAiResponse,
    "OpenAI 句子讲解接口调用失败",
  );
}

function hasProviderCredentials(env: SentenceExplanationEnv, provider: Provider) {
  return Boolean(resolveApiKey(env, provider) && resolveBaseUrl(env, provider));
}

function resolveProviderAttempts(env: SentenceExplanationEnv): Provider[] {
  const preferred = resolveProvider(env);
  const alternate: Provider = preferred === "anthropic" ? "openai" : "anthropic";
  const attempts: Provider[] = [];

  if (hasProviderCredentials(env, preferred)) {
    attempts.push(preferred);
  }
  if (hasProviderCredentials(env, alternate)) {
    attempts.push(alternate);
  }

  return attempts;
}

async function callProviderSkill(
  provider: Provider,
  params: ExplanationSkillParams,
  env: SentenceExplanationEnv,
  model: string,
  timeoutMs: number,
  maxRetries: number,
) {
  return provider === "anthropic"
    ? callAnthropicSkill(params, env, model, timeoutMs, maxRetries)
    : callOpenAiSkill(params, env, model, timeoutMs, maxRetries);
}

function previewRawOutput(raw: string) {
  return raw.replace(/\s+/g, " ").slice(0, 400);
}

function looksLikeTruncatedJson(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }

  const fenceMatches = trimmed.match(/```/g) || [];
  if (fenceMatches.length === 1) {
    return true;
  }

  const openBraces = (trimmed.match(/\{/g) || []).length;
  const closeBraces = (trimmed.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    return true;
  }

  const openBrackets = (trimmed.match(/\[/g) || []).length;
  const closeBrackets = (trimmed.match(/\]/g) || []).length;
  return openBrackets > closeBrackets;
}

function collectMissingArticleParts(article: SentenceExplanationArticle, orderedModules: ModuleId[]) {
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

  return missingParts;
}

function ensureCompleteArticle(article: SentenceExplanationArticle, orderedModules: ModuleId[]) {
  const missingParts = collectMissingArticleParts(article, orderedModules);
  if (missingParts.length) {
    throw new Error(
      `句子讲解 skill 返回了不完整的文章内容，缺少：${missingParts.join("、")}。这通常说明 skill 输出格式与当前解析器不一致。`,
    );
  }

  return article;
}

function readLineArray(record: Record<string, unknown>, key: string, fallbackText = "") {
  return normalizeSentenceExplanationLines(
    Array.isArray(record[key]) ? (record[key] as unknown[]).filter((value): value is string => typeof value === "string") : [],
    fallbackText,
  );
}

function parseArticleRecord(raw: string) {
  const candidate = extractJsonCandidate(raw);
  if (!candidate) {
    throw new Error("句子讲解 skill 没有返回任何可解析内容。");
  }

  const payload = safeJsonParse(candidate);
  if (!payload) {
    if (looksLikeTruncatedJson(raw)) {
      throw new Error(`句子讲解 skill 返回的 JSON 可能被截断了，通常是模型输出过长。输出片段：${previewRawOutput(raw)}`);
    }

    throw new Error(`句子讲解 skill 没有返回合法 JSON。输出片段：${previewRawOutput(raw)}`);
  }

  const article = asRecord(asRecord(payload).article);
  if (!Object.keys(article).length) {
    throw new Error("句子讲解 skill 返回的 JSON 缺少 article 对象。");
  }

  return article;
}

function asModuleId(value: string): ModuleId | "" {
  return sentenceExplanationModuleOrder.includes(value as ModuleId) ? (value as ModuleId) : "";
}

function extractSectionText(record: Record<string, unknown>) {
  return (
    asTrimmedString(record.content) ||
    asTrimmedString(record.text) ||
    asTrimmedString(record.explanation) ||
    asTrimmedString(record.description) ||
    asTrimmedString(record.summary)
  );
}

function extractArticleText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = asTrimmedString(record[key]);
    if (value) {
      return value;
    }
  }

  return "";
}

function extractSectionEntries(article: Record<string, unknown>) {
  if (Array.isArray(article.sections)) {
    return article.sections;
  }

  const sectionMap = asRecord(article.sections);
  const fromSectionMap = sentenceExplanationModuleOrder.flatMap((moduleId) => {
    const value = sectionMap[moduleId];
    if (!value) {
      return [];
    }

    return typeof value === "string"
      ? [{ moduleId, moduleName: sentenceExplanationModuleLabels[moduleId], imageRef: moduleId, content: value }]
      : [value];
  });
  if (fromSectionMap.length) {
    return fromSectionMap;
  }

  return sentenceExplanationModuleOrder.flatMap((moduleId) => {
    const value = article[moduleId];
    if (!value) {
      return [];
    }

    return typeof value === "string"
      ? [{ moduleId, moduleName: sentenceExplanationModuleLabels[moduleId], imageRef: moduleId, content: value }]
      : [value];
  });
}

function stripMarkdownDecorations(value: string) {
  return value
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^[\-\*\u2022]\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractStructureSummaryText(structure: string) {
  const lines = structure
    .split(/\r?\n/)
    .map((line) => stripMarkdownDecorations(line))
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.includes("结构总结")) {
      return line;
    }
  }

  return lines[lines.length - 1] || stripMarkdownDecorations(structure);
}

function buildFallbackIntroductionLines(params: ExplanationSkillParams) {
  return normalizeSentenceExplanationLines([
    `今天我们结合 ${params.bookName} 里的这个英语原句来讲。`,
    "接下来会按图片顺序，依次看句译对照、句式分析、句式总结、词汇解析和雅思备考。",
  ]);
}

function buildFallbackConclusionLines() {
  return normalizeSentenceExplanationLines([
    "这五张图连起来看，就能把这个句子的意思、结构和用法一起记住。",
    "你可以再对照原句复述一遍，把翻译、句式和词汇要点都串起来练习。",
  ]);
}

function normalizeComparableText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function containsComparableText(haystack: string, needle: string) {
  if (!needle.trim()) {
    return true;
  }

  return normalizeComparableText(haystack).includes(normalizeComparableText(needle));
}

function containsVocabularyPronunciationCue(value: string) {
  return /音标|发音|读音|读作|念作|国际音标/i.test(value);
}

function buildVocabularyItemLines(
  item: ExplanationSkillParams["textContent"]["vocabulary"][number],
  index: number,
) {
  /* return normalizeSentenceExplanationLines([
    `第${index + 1}个词是 ${item.word}，它是${item.partOfSpeech}，意思是${item.meaning}。`,
    `例句是 ${item.example}`,
    `这句例句的中文意思是 ${item.translation}`,
  ]); */
  return normalizeSentenceExplanationLines([
    `\u7b2c${index + 1}\u4e2a\u8bcd\u662f ${item.word}\uff0c\u8bcd\u6027\u662f ${item.partOfSpeech}\uff0c\u610f\u601d\u662f ${item.meaning}\u3002`,
    `\u4f8b\u53e5\u662f ${item.example}`,
    `\u8fd9\u53e5\u4f8b\u53e5\u7684\u4e2d\u6587\u7ffb\u8bd1\u662f ${item.translation}`,
  ]);
}

function repairVocabularySection(
  section: SentenceExplanationArticle["sections"][number],
  params: ExplanationSkillParams,
) {
  const baseLines = normalizeSentenceExplanationLines(section.lines, section.content).filter(
    (line) => !containsVocabularyPronunciationCue(stripMarkdownDecorations(line)),
  );
  const seedLines = baseLines.length ? baseLines : normalizeSentenceExplanationLines(["然后看词汇解析图。"]);
  const sectionText = seedLines.join("\n");
  const missingLines = params.textContent.vocabulary.flatMap((item, index) => {
    const isCovered =
      containsComparableText(sectionText, item.word) &&
      containsComparableText(sectionText, item.meaning) &&
      containsComparableText(sectionText, item.example) &&
      containsComparableText(sectionText, item.translation);

    return isCovered ? [] : buildVocabularyItemLines(item, index);
  });
  const lines = [...seedLines, ...missingLines];

  return {
    ...section,
    content: joinSentenceExplanationLines(lines),
    lines,
  };
}

function buildFallbackSectionLines(moduleId: ModuleId, params: ExplanationSkillParams) {
  const { textContent, originalSentence } = params;

  switch (moduleId) {
    case "translation":
      return normalizeSentenceExplanationLines([
        `先看句译对照图，原句是 ${originalSentence}`,
        `这句话的中文意思是 ${textContent.translation}`,
        "图里把前后两段英文和中文提示对应摆出来，方便你边看边对照理解。",
      ]);
    case "grammar":
      return normalizeSentenceExplanationLines([
        "再看句式分析图。",
        `全句时态是 ${stripMarkdownDecorations(textContent.grammar.tense)}`,
        `语态上属于 ${stripMarkdownDecorations(textContent.grammar.voice)}`,
        `结构重点可以概括为 ${extractStructureSummaryText(textContent.grammar.structure)}`,
      ]);
    case "summary":
      return normalizeSentenceExplanationLines([
        "接着看句式总结图。",
        `这一页把整句压缩成核心模板，重点还是 ${extractStructureSummaryText(textContent.grammar.structure)}`,
        "学这一类长句时，先抓主干，再把补充信息按顺序放回去，会更容易复述和仿写。",
      ]);
    case "vocabulary": {
      const introLines = normalizeSentenceExplanationLines([
        "然后看词汇解析图。",
        textContent.vocabulary.length
          ? "这一页会把图里出现的核心词逐个拆开来讲，而且每个词都会讲到词义、例句和例句翻译。"
          : "这一页会把句子里的核心词逐个拆开来讲。",
      ]);
      const detailLines = textContent.vocabulary.flatMap((item, index) => buildVocabularyItemLines(item, index));
      return [...introLines, ...detailLines];
    }
    case "ielts":
      return normalizeSentenceExplanationLines([
        "最后看雅思备考图。",
        `听力上要注意 ${stripMarkdownDecorations(textContent.ielts.listening)}`,
        `口语和阅读上可以分别借用 ${stripMarkdownDecorations(textContent.ielts.speaking)} 和 ${stripMarkdownDecorations(textContent.ielts.reading)}`,
        `写作上也可以参考 ${stripMarkdownDecorations(textContent.ielts.writing)}`,
      ]);
  }
}

function normalizeArticleForOrderedModules(
  article: SentenceExplanationArticle,
  orderedModules: ModuleId[],
  params?: ExplanationSkillParams,
): SentenceExplanationArticle {
  const sections = orderedModules.map((moduleId, index) => {
    const matched =
      article.sections.find((section) => section.moduleId === moduleId || section.imageRef === moduleId) ??
      article.sections[index];
    const lines = normalizeSentenceExplanationLines(matched?.lines, matched?.content || "");

    const section = {
      moduleId,
      moduleName: matched?.moduleName || sentenceExplanationModuleLabels[moduleId],
      imageRef: moduleId,
      content: joinSentenceExplanationLines(lines),
      lines,
    };

    return moduleId === "vocabulary" && params ? repairVocabularySection(section, params) : section;
  });
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
    welcomeMessage: article.welcomeMessage.trim() || DEFAULT_WELCOME_MESSAGE,
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
  };
}

function buildBestEffortArticle(
  article: SentenceExplanationArticle,
  params: ExplanationSkillParams,
): SentenceExplanationArticle {
  const normalized = normalizeArticleForOrderedModules(article, params.orderedModules, params);
  const introductionLines = normalized.introductionLines?.length
    ? normalized.introductionLines
    : buildFallbackIntroductionLines(params);
  const conclusionLines = normalized.conclusionLines?.length
    ? normalized.conclusionLines
    : buildFallbackConclusionLines();
  const sections = params.orderedModules.map((moduleId) => {
    const matched = normalized.sections.find((section) => section.moduleId === moduleId);
    if (matched?.lines?.length) {
      return {
        ...matched,
        moduleName: matched.moduleName || sentenceExplanationModuleLabels[moduleId],
        imageRef: moduleId,
        content: joinSentenceExplanationLines(matched.lines),
      };
    }

    const lines = buildFallbackSectionLines(moduleId, params);
    return {
      moduleId,
      moduleName: sentenceExplanationModuleLabels[moduleId],
      imageRef: moduleId,
      content: joinSentenceExplanationLines(lines),
      lines,
    };
  });

  return {
    title: normalized.title || `${params.bookName} 句子讲解`,
    welcomeMessage: normalized.welcomeMessage.trim() || DEFAULT_WELCOME_MESSAGE,
    introduction: joinSentenceExplanationLines(introductionLines),
    introductionLines,
    sections,
    conclusion: joinSentenceExplanationLines(conclusionLines),
    conclusionLines,
    totalWordCount: calculateSentenceExplanationTotalWordCountFromBlocks([
      introductionLines,
      ...sections.map((section) => section.lines),
      conclusionLines,
    ]),
    totalLineCount:
      introductionLines.length +
      sections.reduce((total, section) => total + (section.lines?.length || 0), 0) +
      conclusionLines.length,
  };
}

export function parseArticle(raw: string): SentenceExplanationArticle {
  const article = parseArticleRecord(raw);
  const sectionsRaw = extractSectionEntries(article);
  if (!sectionsRaw.length && Array.isArray(article.sections) && article.sections.length < 0) {
    throw new Error("句子讲解 skill 返回的 JSON 缺少 sections 数组。");
  }

  const sections = sectionsRaw.map((section, index) => {
    const record = asRecord(section);
    const fallbackModuleId = sentenceExplanationModuleOrder[index] || "translation";
    const resolvedModuleId = asModuleId(asTrimmedString(record.moduleId)) || asModuleId(asTrimmedString(record.imageRef));
    const moduleId = resolvedModuleId || fallbackModuleId;
    const content = extractSectionText(record);
    const lines = readLineArray(record, "lines", content);
    return {
      moduleId,
      moduleName: asTrimmedString(record.moduleName) || sentenceExplanationModuleLabels[moduleId],
      imageRef: asModuleId(asTrimmedString(record.imageRef)) || moduleId,
      content: joinSentenceExplanationLines(lines, content),
      lines,
    };
  });

  const introductionLines = readLineArray(
    article,
    "introductionLines",
    extractArticleText(article, ["introduction", "intro", "opening"]),
  );
  const conclusionLines = readLineArray(
    article,
    "conclusionLines",
    extractArticleText(article, ["conclusion", "outro", "ending"]),
  );
  const totalWordCount =
    Number(article.totalWordCount) ||
    calculateSentenceExplanationTotalWordCountFromBlocks([
      introductionLines,
      ...sections.map((section) => section.lines),
      conclusionLines,
    ]);

  const parsed = {
    title: extractArticleText(article, ["title", "heading"]),
    welcomeMessage: extractArticleText(article, ["welcomeMessage", "welcome", "openingMessage"]),
    introduction: joinSentenceExplanationLines(introductionLines),
    introductionLines,
    sections,
    conclusion: joinSentenceExplanationLines(conclusionLines),
    conclusionLines,
    totalWordCount,
    totalLineCount:
      Number(article.totalLineCount) ||
      introductionLines.length +
        sections.reduce((total, section) => total + (section.lines?.length || 0), 0) +
        conclusionLines.length,
  };

  const hasMeaningfulContent =
    Boolean(parsed.welcomeMessage) ||
    Boolean(parsed.introductionLines.length) ||
    Boolean(parsed.conclusionLines.length) ||
    parsed.sections.some((section) => Boolean(section.lines?.length));

  if (!hasMeaningfulContent) {
    throw new Error("句子讲解 skill 返回了空文章内容，通常是 skill 输出格式与当前解析器不一致。");
  }

  return parsed;
}

export function parseRegeneratedBlock(raw: string, target: SentenceExplanationRegenerationTarget): ParsedRegeneratedBlock {
  const article = parseArticleRecord(raw);

  if (target.type === "introduction") {
    const welcomeMessage = asTrimmedString(article.welcomeMessage);
    const introductionLines = readLineArray(article, "introductionLines", asTrimmedString(article.introduction));
    if (!welcomeMessage) {
      throw new Error("局部重生成结果缺少 welcomeMessage。");
    }
    if (!introductionLines.length) {
      throw new Error("局部重生成结果缺少开场讲解内容。");
    }

    return {
      type: "introduction",
      welcomeMessage,
      introduction: joinSentenceExplanationLines(introductionLines),
      introductionLines,
    };
  }

  if (target.type === "conclusion") {
    const conclusionLines = readLineArray(article, "conclusionLines", asTrimmedString(article.conclusion));
    if (!conclusionLines.length) {
      throw new Error("局部重生成结果缺少结尾讲解内容。");
    }

    return {
      type: "conclusion",
      conclusion: joinSentenceExplanationLines(conclusionLines),
      conclusionLines,
    };
  }

  const sectionsRaw = extractSectionEntries(article);
  const sectionRecord =
    sectionsRaw
      .map((section) => asRecord(section))
      .find((section) => {
        const moduleId = asTrimmedString(section.moduleId);
        const imageRef = asTrimmedString(section.imageRef);
        return moduleId === target.moduleId || imageRef === target.moduleId;
      }) ?? asRecord(sectionsRaw[0]);

  if (!Object.keys(sectionRecord).length) {
    throw new Error("局部重生成结果缺少模块讲解内容。");
  }

  const lines = readLineArray(sectionRecord, "lines", extractSectionText(sectionRecord));
  if (!lines.length) {
    throw new Error("局部重生成结果缺少模块讲解内容。");
  }

  return {
    type: "section",
    moduleId: target.moduleId,
    moduleName: asTrimmedString(sectionRecord.moduleName) || sentenceExplanationModuleLabels[target.moduleId],
    imageRef: target.moduleId,
    content: joinSentenceExplanationLines(lines),
    lines,
  };
}

function mergeRegeneratedBlock(
  currentArticle: SentenceExplanationArticle,
  regenerated: ParsedRegeneratedBlock,
) {
  switch (regenerated.type) {
    case "introduction":
      return replaceSentenceExplanationIntroduction(currentArticle, {
        welcomeMessage: regenerated.welcomeMessage,
        introduction: regenerated.introduction,
        introductionLines: regenerated.introductionLines,
      });
    case "section":
      return replaceSentenceExplanationSection(currentArticle, regenerated.moduleId, {
        moduleName: regenerated.moduleName,
        imageRef: regenerated.imageRef,
        content: regenerated.content,
        lines: regenerated.lines,
      });
    case "conclusion":
      return replaceSentenceExplanationConclusion(currentArticle, {
        conclusion: regenerated.conclusion,
        conclusionLines: regenerated.conclusionLines,
      });
  }
}

async function runSentenceExplanationSkill(
  params: ExplanationSkillParams,
  env: SentenceExplanationEnv,
): Promise<ExplanationSkillResult> {
  validateSkillParams(params, env);

  const timeoutMs = resolvePositiveInteger(
    env.ANTHROPIC_HTTP_TIMEOUT_MS || env.OPENAI_HTTP_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  const maxRetries = resolvePositiveInteger(
    env.ANTHROPIC_HTTP_MAX_RETRIES || env.OPENAI_HTTP_MAX_RETRIES,
    DEFAULT_MAX_RETRIES,
  );
  const attemptErrors: string[] = [];
  let bestEffortResult:
    | (ExplanationSkillResult & {
        missingPartCount: number;
      })
    | null = null;

  for (const provider of resolveProviderAttempts(env)) {
    const model = resolveModel(env, provider);

    try {
      const raw = await callProviderSkill(provider, params, env, model, timeoutMs, maxRetries);
      if (hasRegenerationTarget(params)) {
        return {
          article: mergeRegeneratedBlock(params.currentArticle, parseRegeneratedBlock(raw, params.regenerationTarget)),
          source: provider === "anthropic" ? "anthropic-compatible-api" : "openai-compatible-api",
          model,
        };
      }

      const parsedArticle = normalizeArticleForOrderedModules(parseArticle(raw), params.orderedModules, params);
      const missingParts = collectMissingArticleParts(parsedArticle, params.orderedModules);
      if (!missingParts.length) {
        return {
          article: parsedArticle,
          source: provider === "anthropic" ? "anthropic-compatible-api" : "openai-compatible-api",
          model,
        };
      }

      const bestEffortArticle = ensureCompleteArticle(buildBestEffortArticle(parsedArticle, params), params.orderedModules);
      if (!bestEffortResult || missingParts.length < bestEffortResult.missingPartCount) {
        bestEffortResult = {
          article: bestEffortArticle,
          source: provider === "anthropic" ? "anthropic-compatible-api" : "openai-compatible-api",
          model,
          missingPartCount: missingParts.length,
        };
      }

      throw new Error(
        `句子讲解 skill 返回了不完整的文章内容，缺少：${missingParts.join("、")}。这通常说明 skill 输出格式与当前解析器不一致。`,
      );
    } catch (error) {
      attemptErrors.push(`${provider}:${model}: ${getErrorMessage(error, "句子讲解生成失败。")}`);
    }
  }

  if (bestEffortResult) {
    return {
      article: bestEffortResult.article,
      source: bestEffortResult.source,
      model: bestEffortResult.model,
    };
  }

  throw new Error(attemptErrors.join(" | "));
}

export function installEnglishSentenceExplanationSkillShim(env: SentenceExplanationEnv) {
  if (shimInstalled) {
    return;
  }

  registerRuntimeSkill("english-sentence-explanation", async (rawParams) =>
    runSentenceExplanationSkill(rawParams as ExplanationSkillParams, env),
  );

  shimInstalled = true;
}
