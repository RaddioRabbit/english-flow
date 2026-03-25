import { randomUUID } from "node:crypto";
import {
  DEFAULT_TEXT_ANALYSIS_MAX_RETRIES,
  DEFAULT_TEXT_ANALYSIS_STAGE_TIMEOUT_MS,
} from "../src/lib/text-analysis-contract";
import type {
  TextAnalysisContent,
  TextAnalysisMode,
  TextAnalysisRequest,
  TextAnalysisResponse,
} from "../src/lib/text-analysis-contract";
import { prepareTranslationImagePanels } from "../src/lib/translation-image-prompt";

const DEFAULT_MODEL = "kimi-for-coding";
const DEFAULT_TIMEOUT_MS = DEFAULT_TEXT_ANALYSIS_STAGE_TIMEOUT_MS;
const DEFAULT_MAX_RETRIES = DEFAULT_TEXT_ANALYSIS_MAX_RETRIES;

const EXTRA_GRAMMAR_STRUCTURE_RULES = [
  "",
  "=== EXTRA STRUCTURE SAFETY RULES ===",
  "For grammar.structure, every detail line must name the structure type, the sentence component, and the exact English words from the original sentence.",
  "Never use ellipsis such as '...', '…', 'that ...', or any shortened English fragment.",
  "Never use wording such as '省略', '省去', '略去', or '省写'.",
  "If grammar involves an ellipsis relationship, explain it as a parallel, follow-up, or complement structure, but still quote the full English words that actually appear in the original sentence.",
  "The reader must be able to map every structure directly back to the exact words in the original sentence.",
].join("\n");

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
  ENABLE_TOOL_SEARCH?: string;
}

type Provider = "anthropic" | "openai";

const STAGE_MODES: TextAnalysisMode[] = ["translation", "segmentation", "grammar", "vocabulary", "ielts"];

export async function analyzeSentence(input: TextAnalysisRequest, env: AnalyzeEnv): Promise<TextAnalysisResponse> {
  validateInput(input, env);

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

  const textContent =
    input.mode === "all"
      ? await analyzeAll(input, env, provider, model, timeoutMs, maxRetries)
      : await analyzeSingleStage(input, env, provider, model, timeoutMs, maxRetries);

  return {
    textContent,
    source: "anthropic-compatible-api",
    model,
  };
}

async function analyzeAll(
  input: TextAnalysisRequest,
  env: AnalyzeEnv,
  provider: Provider,
  model: string,
  timeoutMs: number,
  maxRetries: number,
) {
  let current = input.currentTextContent ?? createEmptyTextContent();

  for (const mode of STAGE_MODES) {
    current = await analyzeSingleStage(
      {
        ...input,
        mode,
        currentTextContent: current,
      },
      env,
      provider,
      model,
      timeoutMs,
      maxRetries,
    );
  }

  return current;
}

async function analyzeSingleStage(
  input: TextAnalysisRequest,
  env: AnalyzeEnv,
  provider: Provider,
  model: string,
  timeoutMs: number,
  maxRetries: number,
) {
  const prompt = `${buildUserPrompt(input)}\n\nStrict requirement: return JSON only, with no markdown code fence and no extra explanation.`;
  const raw =
    provider === "anthropic"
      ? await callAnthropicCompatibleApi(input.mode, prompt, env, model, timeoutMs, maxRetries)
      : await callOpenAiCompatibleApi(input.mode, prompt, env, model, timeoutMs, maxRetries);

  const parsed = parseModelJsonContent(raw, input.mode);
  if (!parsed) {
    throw new Error("LLM returned incomplete or invalid JSON.");
  }

  return mergeAndNormalizeResult(input, parsed);
}

function validateInput(input: TextAnalysisRequest, env: AnalyzeEnv) {
  if (!input.sentence?.trim()) {
    throw new Error("英语原句不能为空。");
  }
  if (!input.bookName?.trim()) {
    throw new Error("原著书名不能为空。");
  }
  if (!input.author?.trim()) {
    throw new Error("原著作者不能为空。");
  }
  if (!resolveApiKey(env, resolveProvider(env))) {
    throw new Error("缺少 API Key，无法调用文本解析模型。");
  }
  if (!resolveBaseUrl(env, resolveProvider(env))) {
    throw new Error("缺少 API Base URL，无法调用文本解析模型。");
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
  mode: TextAnalysisMode,
  prompt: string,
  env: AnalyzeEnv,
  model: string,
  timeoutMs: number,
  maxRetries: number,
) {
  const endpoint = resolveAnthropicMessagesEndpoint(resolveBaseUrl(env, "anthropic"));
  const apiKey = resolveApiKey(env, "anthropic");
  const body = {
    model,
    max_tokens: getMaxTokensForMode(mode),
    temperature: 0.1,
    system: buildSystemPrompt(mode),
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: prompt }],
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
  mode: TextAnalysisMode,
  prompt: string,
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
    max_tokens: getMaxTokensForMode(mode),
    temperature: 0.1,
    messages: [
      { role: "system", content: buildSystemPrompt(mode) },
      { role: "user", content: prompt },
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

function buildSystemPrompt(mode: TextAnalysisMode) {
  const rules = [
    "You are a precise English sentence analysis agent for Chinese learners.",
    "Return valid JSON only and match the requested schema exactly.",
    "Use Simplified Chinese for explanations. Keep original English text in English.",
    "Do not output markdown code fences, notes, or any extra text.",
    "Never leave required fields empty.",
    "translation must be a natural Chinese translation suitable for teaching.",
    "prompt1 and prompt3 must be the two English halves of the original sentence.",
    "prompt2 and prompt4 must be the matching Chinese translations or direct Chinese counterparts of prompt1 and prompt3.",
    "Do not summarize what each half describes. Do not add scene-analysis phrases such as 前半部分描述, 后半部分描述, 前半句强调, or 后半句补充.",
    "prompt1, prompt2, prompt3, and prompt4 must contain only the segment content itself, with no labels such as 前半部分, 后半部分, 第一部分, 第二部分, Part 1, Part 2, Prompt 1, or Prompt 2.",
    "",
    "=== GRAMMAR ANALYSIS FORMAT RULES ===",
    "",
    "grammar.tense MUST use EXACTLY this format:",
    '  全句使用**[时态名称]**（[具体动词形式]），用于描述[该时态的功能和作用]。',
    "Examples:",
    "  全句使用**一般过去时**（was, lay），用于描述过去发生的状态和存在。",
    "  全句使用**现在完成时**（have done），用于强调过去动作对现在的影响。",
    "",
    "grammar.voice MUST use EXACTLY this format:",
    '  **[主动语态/被动语态]**（[具体动词示例]）',
    "Examples:",
    "  **主动语态**（the road lay / it lumbered）",
    "  **被动语态**（was written / were made）",
    "  **主动语态**（he had appointed / he had provided / he had sent / he had ordered）",
    "",
    "grammar.structure MUST follow these rules:",
    "  1. First provide detailed analysis with multiple lines starting with '-', explaining each component",
    "  2. The LAST line ONLY must be the bold complete structure summary",
    "  3. The final summary line MUST use this EXACT format with ALL components:",
    '       **主语（...） + 谓语（...） + 宾语/表语（...） + 其他成分（...）**',
    "  4. Each component must be wrapped in bold markers ** **",
    "  5. Use + to connect all components",
    "  6. Examples of final summary line:",
    '       **主语（The Dover road） + 谓语（lay） + 表语（beyond the Dover mail） + 插入语（as to him） + 方式状语从句（as it lumbered...）**',
    '       **形式主语（It）+ 谓语（happened）+ 主语从句（that he had appointed...）+ 并列的定语从句及修饰成分（for whom...）+ 并列的谓语部分（and had ordered...）+ 定语从句（which...）+ 原因状语从句（for that...）**',
    "",
    "=== END GRAMMAR RULES ===",
    "",
    "vocabulary must contain exactly 6 items.",
    "Each vocabulary item must include word, phonetic, partOfSpeech, meaning, example, and translation.",
    "Each vocabulary.example must be a brand-new English sentence created from the target word's meaning in the original sentence.",
    "Never reuse the original sentence, any clause, or any fragment from the original sentence as vocabulary.example.",
    "Each vocabulary.translation must translate that new example sentence, not the original sentence.",
    "ielts must contain listening, speaking, reading, and writing as natural paragraphs.",
    `Output shape: ${getModeOutputShape(mode)}`,
  ];

  if (mode === "segmentation") {
    rules.push("Only output prompt1, prompt2, prompt3, and prompt4.");
  } else if (mode !== "all") {
    rules.push(`Only output the field group for ${mode}.`);
  }

  return `${rules.join("\n")}${EXTRA_GRAMMAR_STRUCTURE_RULES}`;
}

function buildUserPrompt(input: TextAnalysisRequest) {
  const lines = [
    `Mode: ${input.mode}`,
    `Sentence: ${input.sentence.trim()}`,
    `Book: ${input.bookName.trim()}`,
    `Author: ${input.author.trim()}`,
    "",
    "Generate sentence-specific teaching content for this exact sentence.",
    "",
    "=== GRAMMAR ANALYSIS FORMAT REQUIREMENTS ===",
    "",
    "1. TENSE ANALYSIS (grammar.tense) - MUST use EXACTLY this format:",
    '   Format: 全句使用**[时态名称]**（[具体动词形式]），用于描述[该时态的功能和作用]。',
    "   Examples:",
    "   - 全句使用**一般过去时**（was, lay），用于描述过去发生的状态和存在。",
    "   - 全句使用**现在完成时**（have done），用于强调过去动作对现在的影响。",
    '   - 全句使用**过去完成时**（had appointed, had provided, had sent, had ordered），用于描述在过去的某个时间点（即"It happened"所指的时刻）之前已经完成或发生的动作，强调这些安排和准备是先于"碰巧"这一时刻的既定事实。',
    "",
    "2. VOICE ANALYSIS (grammar.voice) - MUST use EXACTLY this format:",
    '   Format: **[主动语态/被动语态]**（[具体动词示例]）',
    "   Examples:",
    "   - **主动语态**（the road lay / it lumbered）",
    "   - **被动语态**（was written / were made）",
    "   - **主动语态**（he had appointed / he had provided / he had sent / he had ordered）",
    "",
    "3. STRUCTURE ANALYSIS (grammar.structure) - MUST follow these rules:",
    "   - Provide detailed analysis with multiple lines starting with '-', explaining each component",
    "   - The LAST line ONLY must be the complete structure summary",
    "   - The final summary line MUST use this EXACT format with ALL components:",
    '     **主语（...） + 谓语（...） + 宾语/表语（...） + 其他成分（...）**',
    "   - Each component must be wrapped in bold markers ** **",
    "   - Use + to connect all components",
    "   - Examples of final summary line:",
    '     **主语（The Dover road） + 谓语（lay） + 表语（beyond the Dover mail） + 插入语（as to him） + 方式状语从句（as it lumbered...）**',
    '     **形式主语（It）+ 谓语（happened）+ 主语从句（that he had appointed...）+ 并列的定语从句及修饰成分（for whom...）+ 并列的谓语部分（and had ordered...）+ 定语从句（which...）+ 原因状语从句（for that...）**',
    "   - ALWAYS end with the bold complete structure summary line",
    "",
    "4. VOCABULARY EXAMPLE RULES:",
    "   - Each vocabulary.example must be a newly created English sentence based on the target word's meaning in the original sentence.",
    "   - NEVER copy the original sentence, any clause, or any fragment from the original sentence.",
    "   - vocabulary.translation must be the Chinese translation of that new example sentence.",
    "",
    "=== END FORMAT REQUIREMENTS ===",
  ];

  if (input.currentTextContent) {
    lines.push("", "Current draft for reference:");
    lines.push(JSON.stringify(stripVocabularyIds(input.currentTextContent), null, 2));
  }

  return `${lines.join("\n")}${EXTRA_GRAMMAR_STRUCTURE_RULES}`;
}

function getModeOutputShape(mode: TextAnalysisMode) {
  switch (mode) {
    case "translation":
      return '{"translation":"..."}';
    case "segmentation":
      return '{"prompt1":"...","prompt2":"...","prompt3":"...","prompt4":"..."}';
    case "grammar":
      return '{"grammar":{"tense":"...","voice":"...","structure":"..."}}';
    case "vocabulary":
      return '{"vocabulary":[{"word":"...","phonetic":"...","partOfSpeech":"...","meaning":"...","example":"...","translation":"..."}]}';
    case "ielts":
      return '{"ielts":{"listening":"...","speaking":"...","reading":"...","writing":"..."}}';
    default:
      return '{"translation":"...","prompt1":"...","prompt2":"...","prompt3":"...","prompt4":"...","grammar":{"tense":"...","voice":"...","structure":"..."},"vocabulary":[...],"ielts":{"listening":"...","speaking":"...","reading":"...","writing":"..."}}';
  }
}

function getMaxTokensForMode(mode: TextAnalysisMode) {
  switch (mode) {
    case "translation":
      return 1000;
    case "segmentation":
      return 1000;
    case "grammar":
      return 1400;
    case "vocabulary":
      return 2600;
    case "ielts":
      return 2800;
    default:
      return 3200;
  }
}

function stripVocabularyIds(textContent: TextAnalysisContent) {
  return {
    ...textContent,
    vocabulary: textContent.vocabulary.map(({ id: _id, ...item }) => item),
  };
}

function parseModelJsonContent(text: string, mode: TextAnalysisMode) {
  const direct = safeJsonParse(extractJsonBlock(text));
  if (direct) {
    return direct;
  }

  return salvageModeResult(text, mode);
}

function extractJsonBlock(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text.trim();
}

function salvageModeResult(text: string, mode: TextAnalysisMode) {
  switch (mode) {
    case "translation": {
      const translation = extractJsonStringField(text, "translation");
      return translation ? { translation } : null;
    }
    case "segmentation": {
      const prompt1 = extractJsonStringField(text, "prompt1");
      const prompt2 = extractJsonStringField(text, "prompt2");
      const prompt3 = extractJsonStringField(text, "prompt3");
      const prompt4 = extractJsonStringField(text, "prompt4");
      return prompt1 && prompt2 && prompt3 && prompt4 ? { prompt1, prompt2, prompt3, prompt4 } : null;
    }
    case "grammar": {
      const block = extractBalancedJsonField(text, "grammar");
      return block ? safeJsonParse(`{"grammar":${block}}`) : null;
    }
    case "vocabulary": {
      const block = extractBalancedJsonField(text, "vocabulary");
      return block ? safeJsonParse(`{"vocabulary":${block}}`) : null;
    }
    case "ielts": {
      const block = extractBalancedJsonField(text, "ielts");
      return block ? safeJsonParse(`{"ielts":${block}}`) : null;
    }
    case "all":
    default:
      return null;
  }
}

function extractJsonStringField(text: string, key: string) {
  const match = text.match(new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s"));
  if (!match?.[1]) {
    return "";
  }

  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return "";
  }
}

function extractBalancedJsonField(text: string, key: string) {
  const match = text.match(new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*([\\[{])`, "s"));
  if (!match?.[0] || match.index === undefined) {
    return "";
  }

  const start = match.index + match[0].length - 1;
  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === opener) {
      depth += 1;
      continue;
    }
    if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mergeAndNormalizeResult(input: TextAnalysisRequest, raw: unknown): TextAnalysisContent {
  const current = input.currentTextContent ?? createEmptyTextContent();
  const candidate = asRecord(raw);

  switch (input.mode) {
    case "translation":
      return normalizeTextContent({ ...current, translation: candidate.translation }, input);
    case "segmentation":
      return normalizeTextContent(
        {
          ...current,
          prompt1: candidate.prompt1,
          prompt2: candidate.prompt2,
          prompt3: candidate.prompt3,
          prompt4: candidate.prompt4,
        },
        input,
      );
    case "grammar":
      return normalizeTextContent({ ...current, grammar: candidate.grammar }, input);
    case "vocabulary":
      return normalizeTextContent({ ...current, vocabulary: candidate.vocabulary }, input);
    case "ielts":
      return normalizeTextContent({ ...current, ielts: candidate.ielts }, input);
    default:
      return normalizeTextContent(candidate, input);
  }
}

function normalizeTextContent(raw: Record<string, unknown>, input: TextAnalysisRequest): TextAnalysisContent {
  const fallback = input.currentTextContent ?? createEmptyTextContent();
  const grammar = asRecord(raw.grammar);
  const ielts = asRecord(raw.ielts);
  const vocabulary = Array.isArray(raw.vocabulary) ? raw.vocabulary : fallback.vocabulary;
  const segmentationPanels = prepareTranslationImagePanels({
    originSentence: input.sentence,
    prompt1: asTrimmedString(raw.prompt1, fallback.prompt1),
    prompt2: asTrimmedString(raw.prompt2, fallback.prompt2),
    prompt3: asTrimmedString(raw.prompt3, fallback.prompt3),
    prompt4: asTrimmedString(raw.prompt4, fallback.prompt4),
  });

  return {
    translation: asTrimmedString(raw.translation, fallback.translation),
    prompt1: segmentationPanels.prompt1,
    prompt2: segmentationPanels.prompt2,
    prompt3: segmentationPanels.prompt3,
    prompt4: segmentationPanels.prompt4,
    grammar: {
      tense: asTrimmedString(grammar.tense, fallback.grammar.tense),
      voice: asTrimmedString(grammar.voice, fallback.grammar.voice),
      structure: asTrimmedString(grammar.structure, fallback.grammar.structure),
    },
    vocabulary: normalizeVocabulary(vocabulary, fallback.vocabulary, input.sentence),
    ielts: {
      listening: asTrimmedString(ielts.listening, fallback.ielts.listening),
      speaking: asTrimmedString(ielts.speaking, fallback.ielts.speaking),
      reading: asTrimmedString(ielts.reading, fallback.ielts.reading),
      writing: asTrimmedString(ielts.writing, fallback.ielts.writing),
    },
  };
}

function normalizeVocabulary(raw: unknown, fallback: TextAnalysisContent["vocabulary"], sentence: string) {
  const source = Array.isArray(raw) ? raw : fallback;
  const normalized = source.slice(0, 6).map((item, index) => {
    const record = asRecord(item);
    const fallbackItem = fallback[index] ?? createEmptyVocabularyCard(index);
    const word = asTrimmedString(record.word, fallbackItem.word);
    const candidateExample = asTrimmedString(record.example, fallbackItem.example);
    const shouldReplaceExample = reusesOriginalSentenceFragment(candidateExample, sentence);

    return {
      id: asTrimmedString(record.id, fallbackItem.id) || `vocab-${index + 1}-${randomUUID()}`,
      word,
      phonetic: asTrimmedString(record.phonetic, fallbackItem.phonetic) || (word ? `/${word}/` : ""),
      partOfSpeech: asTrimmedString(record.partOfSpeech, fallbackItem.partOfSpeech) || "n./adj.",
      meaning: asTrimmedString(record.meaning, fallbackItem.meaning),
      example: shouldReplaceExample ? buildVocabularyExample(word) : candidateExample || buildVocabularyExample(word),
      translation: shouldReplaceExample
        ? buildVocabularyExampleTranslation(word)
        : asTrimmedString(record.translation, fallbackItem.translation) || buildVocabularyExampleTranslation(word),
    };
  });

  while (normalized.length < 6) {
    normalized.push(createEmptyVocabularyCard(normalized.length));
  }

  return normalized;
}

function normalizeForSentenceComparison(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function reusesOriginalSentenceFragment(example: string, sentence: string) {
  if (!example || !sentence) {
    return false;
  }

  const normalizedExample = normalizeForSentenceComparison(example);
  const normalizedSentence = normalizeForSentenceComparison(sentence);
  if (!normalizedExample || !normalizedSentence) {
    return false;
  }

  if (normalizedExample === normalizedSentence) {
    return true;
  }

  const exampleWordCount = normalizedExample.split(" ").filter(Boolean).length;
  return exampleWordCount >= 5 && normalizedSentence.includes(normalizedExample);
}

function buildVocabularyExample(word: string) {
  if (!word) {
    return "";
  }

  return `In a new example, "${word}" carries a meaning similar to the one in the original sentence.`;
}

function buildVocabularyExampleTranslation(word: string) {
  if (!word) {
    return "";
  }

  return `在这个新例句里，“${word}”表达的意思与原句中的用法相近。`;
}

function createEmptyTextContent(): TextAnalysisContent {
  return {
    translation: "",
    prompt1: "",
    prompt2: "",
    prompt3: "",
    prompt4: "",
    grammar: {
      tense: "",
      voice: "",
      structure: "",
    },
    vocabulary: Array.from({ length: 6 }, (_, index) => createEmptyVocabularyCard(index)),
    ielts: {
      listening: "",
      speaking: "",
      reading: "",
      writing: "",
    },
  };
}

function createEmptyVocabularyCard(index: number) {
  return {
    id: `vocab-${index + 1}-${randomUUID()}`,
    word: "",
    phonetic: "",
    partOfSpeech: "",
    meaning: "",
    example: "",
    translation: "",
  };
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
  if (/tool_search/i.test(message) && /400|bad request/i.test(message)) {
    return "接口触发了 tool_search 400 错误，请确认 ENABLE_TOOL_SEARCH=false。";
  }
  if (/only available for coding agents/i.test(message)) {
    return "当前仍在用错误协议访问 Kimi Code。请使用 ANTHROPIC_BASE_URL=https://api.kimi.com/coding/ 和 ANTHROPIC_API_KEY。";
  }
  if (/aborted|timeout/i.test(message)) {
    return "文本解析请求超时，请稍后重试。";
  }
  return message;
}
