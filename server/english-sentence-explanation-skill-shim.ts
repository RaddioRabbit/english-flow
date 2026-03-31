import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_HTTP_TIMEOUT_MS?: string;
  ANTHROPIC_HTTP_MAX_RETRIES?: string;
}

type Provider = "anthropic";

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
const DEFAULT_WELCOME_MESSAGE = "欢迎来到英语名著句子讲解小课堂";

let shimInstalled = false;
let cachedSkillPrompt: string | null = null;

/**
 * 读取 english-sentence-explanation skill 的 SKILL.md 文件
 * 这是模拟 Claude Code 调用 skill 的核心机制
 */
function loadSkillPrompt(): string {
  if (cachedSkillPrompt) {
    return cachedSkillPrompt;
  }

  try {
    // 尝试多个可能的路径
    const possiblePaths = [
      join(process.cwd(), ".claude", "skills", "english-sentence-explanation", "SKILL.md"),
      join(__dirname, "..", ".claude", "skills", "english-sentence-explanation", "SKILL.md"),
      join(__dirname, ".claude", "skills", "english-sentence-explanation", "SKILL.md"),
    ];

    for (const skillPath of possiblePaths) {
      try {
        const content = readFileSync(skillPath, "utf-8");
        // 提取 frontmatter 后的正文内容
        const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
        cachedSkillPrompt = match ? match[1].trim() : content.trim();
        console.log(`[Skill Shim] Loaded skill prompt from: ${skillPath}`);
        return cachedSkillPrompt;
      } catch {
        continue;
      }
    }

    throw new Error("SKILL.md not found in any of the expected paths");
  } catch (error) {
    console.error("[Skill Shim] Failed to load SKILL.md:", error);
    // 返回内嵌的 fallback prompt
    return getFallbackSkillPrompt();
  }
}

/**
 * Fallback skill prompt - 当无法读取 SKILL.md 时使用
 * 这确保了系统在没有 skill 文件时也能工作
 */
function getFallbackSkillPrompt(): string {
  return `# English Sentence Explanation Skill

## 任务目标
根据英语原句、文本解析结果和对应的讲解图片，生成可直接用于文章展示、TTS和视频字幕的句子讲解文章。

## 输出总规则
1. 只输出合法 JSON，不要 markdown code fence
2. 所有讲解内容都要数组化，每行不超过50字
3. 在标点符号后或语气停顿处换行
4. 文章必须和图片逐一对应

## 内容要求
- 开场必须用"欢迎来到英语名著句子讲解小课堂"
- 句译对照：完整念出原句，给出中文翻译
- 句式分析：讲清时态、语态、结构
- 句式总结：提炼句型模板
- 词汇解析：覆盖所有词汇，格式"第X个词是[单词]，它是[词性]，意思是[释义]"
- 雅思备考：覆盖听说读写四科

## 硬性约束
- 绝对禁止中文音译（如"发音是XXX"）
- 原句必须完整念出
- 所有词汇都必须讲解
- 总字数800-1000字`;
}

function resolveProvider(env: SentenceExplanationEnv): Provider {
  return "anthropic";
}

function resolveModel(env: SentenceExplanationEnv, provider: Provider) {
  return env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

function resolveApiKey(env: SentenceExplanationEnv, provider: Provider) {
  return env.ANTHROPIC_API_KEY?.trim() || "";
}

function resolveBaseUrl(env: SentenceExplanationEnv, provider: Provider) {
  return env.ANTHROPIC_BASE_URL?.trim() || "";
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

/**
 * 构建模拟 Claude Code 调用 skill 的 system prompt
 * 这是关键：我们让 LLM 扮演 Claude Code，使用 skill 指令来生成内容
 */
function buildSimulatedClaudeCodeSystemPrompt(skillPrompt: string, target?: SentenceExplanationRegenerationTarget) {
  const modeInstructions = target
    ? `\n\n## 当前任务模式\n这是一个局部重生成任务，只重新生成"${getTargetLabel(target)}"部分。严格按照 SKILL.md 中的局部重生成规则输出。`
    : `\n\n## 当前任务模式\n这是完整文章生成任务。生成包含开场、五个模块讲解、结尾的完整文章。`;

  return [
    "You are Claude Code, a coding assistant with access to various skills.",
    "",
    "You have been asked to use the following skill:",
    "",
    "=== SKILL START ===",
    skillPrompt,
    "=== SKILL END ===",
    modeInstructions,
    "",
    "## Execution Rules",
    "1. Follow the skill instructions exactly as written",
    "2. Return ONLY the JSON output specified in the skill",
    "3. Do not include markdown code fences (\`\`\`json)",
    "4. Do not add any explanation or commentary",
    "5. Ensure every array item in introductionLines, section lines, and conclusionLines is at most 50 characters",
    "6. The output must be valid JSON that can be parsed by JSON.parse()",
  ].join("\n");
}

function clipPromptText(value: unknown, maxLength: number) {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxLength - 3)).trim()}...`;
}

function summarizeTextContentForPrompt(textContent: ExplanationSkillParams["textContent"]) {
  const PROMPT_SENTENCE_LIMIT = 900;
  const PROMPT_TRANSLATION_LIMIT = 360;
  const PROMPT_SEGMENT_LIMIT = 180;
  const PROMPT_GRAMMAR_LIMIT = 220;
  const PROMPT_VOCAB_MEANING_LIMIT = 100;
  const PROMPT_VOCAB_EXAMPLE_LIMIT = 140;
  const PROMPT_IELTS_LIMIT = 120;

  return {
    translation: clipPromptText(textContent.translation, PROMPT_TRANSLATION_LIMIT),
    prompt1: clipPromptText(textContent.prompt1, PROMPT_SEGMENT_LIMIT),
    prompt2: clipPromptText(textContent.prompt2, PROMPT_SEGMENT_LIMIT),
    prompt3: clipPromptText(textContent.prompt3, PROMPT_SEGMENT_LIMIT),
    prompt4: clipPromptText(textContent.prompt4, PROMPT_SEGMENT_LIMIT),
    grammar: {
      tense: clipPromptText(textContent.grammar?.tense, 80),
      voice: clipPromptText(textContent.grammar?.voice, 80),
      structure: clipPromptText(textContent.grammar?.structure, PROMPT_GRAMMAR_LIMIT),
    },
    vocabulary: (textContent.vocabulary ?? []).slice(0, 6).map((card) => ({
      word: clipPromptText(card.word, 40),
      partOfSpeech: clipPromptText(card.partOfSpeech, 20),
      meaning: clipPromptText(card.meaning, PROMPT_VOCAB_MEANING_LIMIT),
      example: clipPromptText(card.example, PROMPT_VOCAB_EXAMPLE_LIMIT),
      translation: clipPromptText(card.translation, PROMPT_VOCAB_EXAMPLE_LIMIT),
    })),
    ielts: {
      listening: clipPromptText(textContent.ielts?.listening, PROMPT_IELTS_LIMIT),
      speaking: clipPromptText(textContent.ielts?.speaking, PROMPT_IELTS_LIMIT),
      reading: clipPromptText(textContent.ielts?.reading, PROMPT_IELTS_LIMIT),
      writing: clipPromptText(textContent.ielts?.writing, PROMPT_IELTS_LIMIT),
    },
  };
}

function buildUserPrompt(params: ExplanationSkillParams) {
  const imageModules = getPromptImageModules(params);

  const lines = [] as string[];

  lines.push(
    "请根据以下输入数据生成句子讲解文章：",
    "",
    "## 输入数据",
    "",
    JSON.stringify({
      originalSentence: clipPromptText(params.originalSentence, 900),
      bookName: clipPromptText(params.bookName, 80),
      author: clipPromptText(params.author, 80),
      textContent: summarizeTextContentForPrompt(params.textContent),
      orderedModules: params.orderedModules,
      regenerationTarget: params.regenerationTarget ?? null,
      imageModules,
    }, null, 2),
  );

  if (params.regenerationTarget) {
    lines.push(
      "",
      "## 注意",
      `这是局部重生成任务，只重新生成"${getTargetLabel(params.regenerationTarget)}"部分。`,
      "严格按照 SKILL.md 中的局部重生成规则输出，只包含必要的字段。",
    );
  }

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

function humanizeSentenceExplanationError(message: string) {
  if (/only available for coding agents/i.test(message)) {
    return "当前仍在用错误协议访问 Kimi Code。请使用 ANTHROPIC_BASE_URL=https://api.kimi.com/coding/ 和 ANTHROPIC_API_KEY。";
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    return "无法连接到 Kimi 域名，请检查本机网络、DNS 或代理设置。";
  }
  if (/other side closed|socketerror/i.test(message)) {
    return "Kimi 端点主动断开了句子讲解请求，通常是提示词过长或请求体过大。";
  }
  if (/aborted|timeout/i.test(message)) {
    return "句子讲解模型请求超时，请稍后重试。";
  }

  return message;
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

function resolveAnthropicMessagesEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  return /\/v1$/i.test(normalized) ? `${normalized}/messages` : `${normalized}/v1/messages`;
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
      lastError = isAbortError(error)
        ? "句子讲解模型请求超时，请稍后重试。"
        : humanizeSentenceExplanationError(getDetailedErrorMessage(error) || "句子讲解请求失败。");
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

/**
 * 核心：调用 LLM 模拟 Claude Code 使用 skill
 * 关键改进：使用 SKILL.md 作为 system prompt，让 LLM 扮演 Claude Code 执行 skill
 */
async function callSkillViaLLM(
  params: ExplanationSkillParams,
  env: SentenceExplanationEnv,
  model: string,
  timeoutMs: number,
  maxRetries: number,
): Promise<string> {
  const endpoint = resolveAnthropicMessagesEndpoint(resolveBaseUrl(env, "anthropic"));
  const apiKey = resolveApiKey(env, "anthropic");

  // 关键：加载 SKILL.md 作为 skill 指令
  const skillPrompt = loadSkillPrompt();

  // 构建模拟 Claude Code 的 system prompt
  const systemPrompt = buildSimulatedClaudeCodeSystemPrompt(skillPrompt, params.regenerationTarget);

  const body = {
    model,
    max_tokens: DEFAULT_OUTPUT_MAX_TOKENS,
    temperature: 0.4,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(params),
      },
    ],
  };

  console.log("[Skill Shim] Calling LLM with simulated Claude Code skill execution");
  console.log(`[Skill Shim] System prompt length: ${systemPrompt.length} chars`);
  console.log(`[Skill Shim] User prompt length: ${body.messages[0].content.length} chars`);

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

function hasProviderCredentials(env: SentenceExplanationEnv, provider: Provider) {
  return Boolean(resolveApiKey(env, provider) && resolveBaseUrl(env, provider));
}

function resolveProviderAttempts(env: SentenceExplanationEnv): Provider[] {
  const attempts: Provider[] = [];

  if (hasProviderCredentials(env, "anthropic")) {
    attempts.push("anthropic");
  }

  return attempts;
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
      `句子讲解 skill 返回了不完整的文章内容，缺少：${missingParts.join("。")}。这通常说明 skill 输出格式与当前解析器不一致。`,
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
    .replace(/^[-*\u2022]\s*/gm, "")
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
  return normalizeSentenceExplanationLines([
    `第${index + 1}个词是 ${item.word}，词性是 ${item.partOfSpeech}，意思是 ${item.meaning}。`,
    `例句是 ${item.example}`,
    `这句例句的中文翻译是 ${item.translation}`,
  ]);
}

function countStructuredVocabularyEntries(lines: string[]) {
  return lines.reduce((count, line) => {
    const normalized = stripMarkdownDecorations(line);
    return /第\s*[0-9一二三四五六七八九十]+\s*个词/u.test(normalized) ? count + 1 : count;
  }, 0);
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
  const structuredEntryCount = countStructuredVocabularyEntries(seedLines);
  const coveredWordCount = params.textContent.vocabulary.filter((item) =>
    containsComparableText(sectionText, item.word),
  ).length;

  if (
    params.textContent.vocabulary.length > 0 &&
    structuredEntryCount >= params.textContent.vocabulary.length &&
    coveredWordCount >= params.textContent.vocabulary.length
  ) {
    return {
      ...section,
      content: joinSentenceExplanationLines(seedLines),
      lines: seedLines,
    };
  }

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

  // 如果没有有意义的内容，返回一个空的文章对象，让后续逻辑使用 fallback 生成
  // 而不是直接抛出错误
  if (!hasMeaningfulContent) {
    return {
      title: parsed.title || "",
      welcomeMessage: "",
      introduction: "",
      introductionLines: [],
      sections: parsed.sections.map((section) => ({
        ...section,
        content: "",
        lines: [],
      })),
      conclusion: "",
      conclusionLines: [],
      totalWordCount: 0,
      totalLineCount: 0,
    };
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

/**
 * 运行 english-sentence-explanation skill
 * 核心改进：使用 SKILL.md 作为 prompt，让 LLM 模拟 Claude Code 调用 skill
 */
async function runSentenceExplanationSkill(
  params: ExplanationSkillParams,
  env: SentenceExplanationEnv,
): Promise<ExplanationSkillResult> {
  validateSkillParams(params, env);

  const timeoutMs = resolvePositiveInteger(
    env.ANTHROPIC_HTTP_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  const maxRetries = resolvePositiveInteger(
    env.ANTHROPIC_HTTP_MAX_RETRIES,
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
      // 关键：通过 LLM 调用 skill，传入 SKILL.md 作为 system prompt
      const raw = await callSkillViaLLM(params, env, model, timeoutMs, maxRetries);

      if (hasRegenerationTarget(params)) {
        return {
          article: mergeRegeneratedBlock(params.currentArticle, parseRegeneratedBlock(raw, params.regenerationTarget)),
          source: "anthropic-compatible-api",
          model,
        };
      }

      const parsedArticle = normalizeArticleForOrderedModules(parseArticle(raw), params.orderedModules, params);
      const missingParts = collectMissingArticleParts(parsedArticle, params.orderedModules);
      if (!missingParts.length) {
        return {
          article: parsedArticle,
          source: "anthropic-compatible-api",
          model,
        };
      }

      const bestEffortArticle = ensureCompleteArticle(buildBestEffortArticle(parsedArticle, params), params.orderedModules);
      if (!bestEffortResult || missingParts.length < bestEffortResult.missingPartCount) {
        bestEffortResult = {
          article: bestEffortArticle,
          source: "anthropic-compatible-api",
          model,
          missingPartCount: missingParts.length,
        };
      }

      throw new Error(
        `句子讲解 skill 返回了不完整的文章内容，缺少：${missingParts.join("。")}。这通常说明 skill 输出格式与当前解析器不一致。`,
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
  console.log("[Skill Shim] english-sentence-explanation skill installed (using SKILL.md as prompt)");
}
