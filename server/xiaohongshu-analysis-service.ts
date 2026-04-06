import type {
  XiaohongshuAnalysisRequest,
  XiaohongshuAnalysisResponse,
} from "../src/lib/xiaohongshu-analysis-contract";

interface AnalyzeEnv {
  OPENAI_API_KEY?: string;
  OPENAI_API_BASE?: string;
  OPENAI_MODEL?: string;
  OPENAI_HTTP_TIMEOUT_MS?: string;
  OPENAI_HTTP_MAX_RETRIES?: string;
  Kimi_API_KEY?: string;
  Kimi_API_BASE?: string;
  Kimi_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_HTTP_TIMEOUT_MS?: string;
  ANTHROPIC_HTTP_MAX_RETRIES?: string;
}

type Provider = "anthropic" | "openai";

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MODEL = "kimi-for-coding";

export async function generateXiaohongshuAnalysis(
  input: XiaohongshuAnalysisRequest,
  env: AnalyzeEnv,
): Promise<XiaohongshuAnalysisResponse> {
  validateInput(input);

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
      ? await callAnthropicCompatibleApi(input, env, model, timeoutMs, maxRetries)
      : await callOpenAiCompatibleApi(input, env, model, timeoutMs, maxRetries);

  return parseResponse(raw);
}

function validateInput(input: XiaohongshuAnalysisRequest) {
  if (!input.sentence?.trim()) {
    throw new Error("英语原句不能为空。");
  }
  if (!input.bookName?.trim()) {
    throw new Error("原著书名不能为空。");
  }
  if (!input.author?.trim()) {
    throw new Error("原著作者不能为空。");
  }
}

function resolveProvider(env: AnalyzeEnv): Provider {
  return env.ANTHROPIC_BASE_URL?.trim() || env.ANTHROPIC_API_KEY?.trim() ? "anthropic" : "openai";
}

function resolveModel(env: AnalyzeEnv, provider: Provider) {
  if (provider === "anthropic") {
    return env.ANTHROPIC_MODEL?.trim() || env.Kimi_MODEL?.trim() || env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  }
  return env.Kimi_MODEL?.trim() || env.OPENAI_MODEL?.trim() || env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

function resolveApiKey(env: AnalyzeEnv, provider: Provider) {
  if (provider === "anthropic") {
    return env.ANTHROPIC_API_KEY?.trim() || env.Kimi_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || "";
  }
  return env.Kimi_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim() || "";
}

function resolveBaseUrl(env: AnalyzeEnv, provider: Provider) {
  if (provider === "anthropic") {
    return env.ANTHROPIC_BASE_URL?.trim() || "";
  }
  return env.Kimi_API_BASE?.trim() || env.OPENAI_API_BASE?.trim() || "";
}

async function callAnthropicCompatibleApi(
  input: XiaohongshuAnalysisRequest,
  env: AnalyzeEnv,
  model: string,
  timeoutMs: number,
  maxRetries: number,
) {
  const endpoint = resolveAnthropicMessagesEndpoint(resolveBaseUrl(env, "anthropic"));
  const apiKey = resolveApiKey(env, "anthropic");
  const body = {
    model,
    max_tokens: 2000,
    temperature: 0.7,
    system: buildSystemPrompt(),
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: buildUserPrompt(input) }],
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
    "Anthropic 兼容接口调用失败",
  );
}

async function callOpenAiCompatibleApi(
  input: XiaohongshuAnalysisRequest,
  env: AnalyzeEnv,
  model: string,
  timeoutMs: number,
  maxRetries: number,
) {
  const baseUrl = resolveBaseUrl(env, "openai").replace(/\/$/, "");
  const endpoint = `${baseUrl}/chat/completions`;
  const apiKey = resolveApiKey(env, "openai");
  const body = {
    model,
    max_tokens: 2000,
    temperature: 0.7,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(input) },
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
    "OpenAI 兼容接口调用失败",
  );
}

async function requestWithRetry(
  endpoint: string,
  init: RequestInit,
  timeoutMs: number,
  maxRetries: number,
  extractText: (payload: unknown) => string,
  errorPrefix: string,
) {
  let lastError = "请求失败。";

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
      lastError = humanizeErrorMessage(error instanceof Error ? error.message : String(error));
      if (attempt < maxRetries) {
        await sleep(400 * attempt);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(lastError);
}

function resolveAnthropicMessagesEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  return /\/v1$/i.test(normalized) ? `${normalized}/messages` : `${normalized}/v1/messages`;
}

function extractProviderError(payload: unknown, rawText: string, status: number) {
  const record = asRecord(payload);
  const error = asRecord(record.error);
  return asTrimmedString(error.message) || rawText || `HTTP ${status}`;
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
    throw new Error("Anthropic 兼容接口返回内容为空。");
  }

  return text;
}

function extractTextFromOpenAiResponse(payload: unknown) {
  const record = asRecord(payload);
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const message = asRecord(asRecord(choices[0]).message);
  const text = asTrimmedString(message.content);

  if (!text) {
    throw new Error("OpenAI 兼容接口返回内容为空。");
  }

  return text;
}

function buildSystemPrompt() {
  return [
    "你是一个为小红书平台创作英语原著句子深度解析内容的专家。",
    "你的任务是生成5个吸引人的推荐标题，以及一段专业的句子分析正文。",
    "请严格遵循以下输出格式，使用纯文本，不使用 Markdown 符号（**、#、-、>等）。",
    "",
    "=== 输出格式 ===",
    "",
    "推荐标题（5个）：",
    "1. 《书名》的\"[核心特点1]\"",
    "2. 《书名》的\"[核心特点2]\"",
    "3. 《书名》的\"[核心特点3]\"",
    "4. 《书名》的\"[核心特点4]\"",
    "5. 《书名》的\"[核心特点5]\"",
    "",
    "✨{author}《{book}》的[句子独特之处]！雅思[相关主题]的范本！",
    "",
    "核心修辞：[修辞艺术主题]",
    "✔️ [修辞手法名称]：\"[原文引用]\"[效果分析，20字以内]",
    "✔️ [修辞手法名称]：\"[原文引用]\"[效果分析，20字以内]",
    "✔️ [修辞手法名称]：\"[原文引用]\"[效果分析，20字以内]",
    "",
    "词汇宝库：[词汇主题]",
    "💡 [词汇类别1]：",
    "[英文词汇]（中文释义）",
    "[英文词汇]（中文释义）",
    "💡 [词汇类别2]：",
    "[英文词汇]（中文释义）",
    "[英文词汇]（中文释义）",
    "",
    "句式突破：雅思高分表达模板",
    "🌟 [句式类型]：\"[原文句式结构]\"[应用说明]",
    "🌟 [句式类型]：\"[原文句式结构]\"[应用说明]",
    "🌟 [句式类型]：\"[原文句式结构]\"[应用说明]",
    "",
    "=== 写作要求 ===",
    "",
    "- 纯文本输出，不使用 Markdown 格式符号",
    "- 全文不超过900字",
    "- 语言风格既专业又有小红书亲和力，适合学英语的年轻人",
    "- 每个板块的分析都要点出雅思写作或口语的实用价值",
    "- 引言第一句要突出这个句子自身最独特的亮点",
    "- 5个标题各从不同角度切入，不重复",
  ].join("\n");
}

function buildUserPrompt(input: XiaohongshuAnalysisRequest) {
  return [
    `Sentence: ${input.sentence.trim()}`,
    `Book: ${input.bookName.trim()}`,
    `Author: ${input.author.trim()}`,
    "",
    "请根据以上信息，严格按照 system prompt 中的输出格式生成小红书文案内容。",
  ].join("\n");
}

function parseResponse(raw: string): XiaohongshuAnalysisResponse {
  const marker = "推荐标题（5个）：";
  const idx = raw.indexOf(marker);
  if (idx === -1) {
    throw new Error("LLM 返回内容格式不正确，缺少标题部分。");
  }

  const afterMarker = raw.slice(idx + marker.length);
  const lines = afterMarker
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const titles: string[] = [];
  let contentStartIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\d+[.．、]\s*(.+)$/);
    if (match && titles.length < 5) {
      titles.push(match[1].trim());
    } else if (titles.length >= 5) {
      contentStartIndex = i;
      break;
    }
  }

  if (titles.length < 5) {
    throw new Error("LLM 返回内容格式不正确，未能提取到5个标题。");
  }

  const content = lines.slice(contentStartIndex).join("\n").trim();
  if (!content) {
    throw new Error("LLM 返回内容格式不正确，缺少正文分析部分。");
  }

  return { titles, content };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asTrimmedString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function resolvePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanizeErrorMessage(message: string) {
  if (/aborted|timeout/i.test(message)) {
    return "请求超时，请稍后重试。";
  }
  if (/only available for coding agents/i.test(message)) {
    return "当前仍在用错误协议访问 Kimi Code。请使用 ANTHROPIC_BASE_URL=https://api.kimi.com/coding/ 和 ANTHROPIC_API_KEY。";
  }
  return message;
}
