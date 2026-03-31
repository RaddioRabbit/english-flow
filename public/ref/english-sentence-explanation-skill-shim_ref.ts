import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  SentenceExplanationArticle,
  SentenceExplanationRequest,
  SentenceExplanationResponse,
} from "../src/lib/sentence-explanation-contract";
import { sentenceExplanationModuleLabels } from "../src/lib/sentence-explanation-contract";
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

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_REMOTE_IMAGE_TIMEOUT_MS = 30_000;
const DEFAULT_OUTPUT_MAX_TOKENS = 5000;
const DEFAULT_ANTHROPIC_MODEL = "claude-3-7-sonnet-latest";
const DEFAULT_OPENAI_MODEL = "gpt-4.1";
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

  const provider = resolveProvider(env);
  if (!resolveApiKey(env, provider)) {
    throw new Error("缺少句子讲解模型的 API Key。");
  }
  if (!resolveBaseUrl(env, provider)) {
    throw new Error("缺少句子讲解模型的 API Base URL。");
  }
}

function buildUserPrompt(params: ExplanationSkillParams) {
  return [
    "Important clarification: the skill rule about avoiding special symbols applies only to the natural-language article text fields, not to the JSON wrapper itself.",
    "The final response must be valid JSON, so all required JSON punctuation must be preserved.",
    "If the no-symbol writing rule conflicts with valid JSON output, valid JSON takes priority.",
    "Return exactly one top-level JSON object with an article field.",
    "Inside article, include only these keys: title, welcomeMessage, introduction, sections, conclusion, totalWordCount.",
    "Do not include fullScript, markdown code fences, comments, or any extra keys.",
    "Keep the response concise enough to fit comfortably within the model output limit while still covering all five sections.",
    "请执行 english-sentence-explanation skill。",
    "严格按 skill 文档要求输出 JSON，不要输出 markdown code fence，不要输出额外解释。",
    "请按照以下模块顺序，结合对应图片，一张一张地讲解这句英语：",
    ...params.orderedModules.map(
      (moduleId, index) => `${index + 1}. ${sentenceExplanationModuleLabels[moduleId]} (${moduleId})`,
    ),
    "",
    "下面是输入的结构化数据：",
    JSON.stringify(
      {
        originalSentence: params.originalSentence,
        bookName: params.bookName,
        author: params.author,
        textContent: params.textContent,
        orderedModules: params.orderedModules,
      },
      null,
      2,
    ),
    "",
    "注意：接下来附带的图片顺序与 orderedModules 完全一致。每个 section 都必须对应同顺序的那张图片进行讲解。",
  ].join("\n");
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
  const resolvedImages = await Promise.all(
    params.orderedModules.map(async (moduleId) => {
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

  for (const moduleId of params.orderedModules) {
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
    system: `${systemPrompt}\n\nStrict requirement: return JSON only, with no markdown code fence and no extra explanation. The no-symbol writing rule applies only to article text fields, not to JSON punctuation. Return exactly one top-level JSON object with an article field. Inside article, include only: title, welcomeMessage, introduction, sections, conclusion, totalWordCount. Do not include fullScript or any extra keys.`,
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
        content: `${systemPrompt}\n\nStrict requirement: return JSON only, with no markdown code fence and no extra explanation. The no-symbol writing rule applies only to article text fields, not to JSON punctuation. Return exactly one top-level JSON object with an article field. Inside article, include only: title, welcomeMessage, introduction, sections, conclusion, totalWordCount. Do not include fullScript or any extra keys.`,
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

export function parseArticle(raw: string): SentenceExplanationArticle {
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

  const sectionsRaw = Array.isArray(article.sections) ? article.sections : [];
  if (!sectionsRaw.length) {
    throw new Error("句子讲解 skill 返回的 JSON 缺少 sections 数组。");
  }

  const sections = sectionsRaw.map((section) => {
    const record = asRecord(section);
    return {
      moduleId: asTrimmedString(record.moduleId) as ModuleId,
      moduleName: asTrimmedString(record.moduleName),
      imageRef: asTrimmedString(record.imageRef) as ModuleId,
      content: asTrimmedString(record.content),
    };
  });

  const parsed = {
    title: asTrimmedString(article.title),
    welcomeMessage: asTrimmedString(article.welcomeMessage),
    introduction: asTrimmedString(article.introduction),
    sections,
    conclusion: asTrimmedString(article.conclusion),
    totalWordCount: Number(article.totalWordCount) || 0,
  };

  const hasMeaningfulContent =
    Boolean(parsed.welcomeMessage) ||
    Boolean(parsed.introduction) ||
    Boolean(parsed.conclusion) ||
    parsed.sections.some((section) => Boolean(section.content));

  if (!hasMeaningfulContent) {
    throw new Error("句子讲解 skill 返回了空文章内容，通常是 skill 输出格式与当前解析器不一致。");
  }

  return parsed;
}

async function runSentenceExplanationSkill(
  params: ExplanationSkillParams,
  env: SentenceExplanationEnv,
): Promise<ExplanationSkillResult> {
  validateSkillParams(params, env);

  const provider = resolveProvider(env);
  const model = resolveModel(env, provider);
  const timeoutMs = resolvePositiveInteger(
    env.ANTHROPIC_HTTP_TIMEOUT_MS || env.OPENAI_HTTP_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  const maxRetries = resolvePositiveInteger(
    env.ANTHROPIC_HTTP_MAX_RETRIES || env.OPENAI_HTTP_MAX_RETRIES,
    DEFAULT_MAX_RETRIES,
  );
  const raw =
    provider === "anthropic"
      ? await callAnthropicSkill(params, env, model, timeoutMs, maxRetries)
      : await callOpenAiSkill(params, env, model, timeoutMs, maxRetries);

  return {
    article: parseArticle(raw),
    source: provider === "anthropic" ? "anthropic-compatible-api" : "openai-compatible-api",
    model,
  };
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
