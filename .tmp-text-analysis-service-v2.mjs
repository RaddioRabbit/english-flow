// server/text-analysis-service-v2.ts
import { randomUUID } from "node:crypto";

// src/lib/text-analysis-contract.ts
var DEFAULT_TEXT_ANALYSIS_STAGE_TIMEOUT_MS = 9e4;
var DEFAULT_TEXT_ANALYSIS_MAX_RETRIES = 1;
var DEFAULT_TEXT_ANALYSIS_REQUEST_TIMEOUT_MS = DEFAULT_TEXT_ANALYSIS_STAGE_TIMEOUT_MS + 5e3;

// server/text-analysis-service-v2.ts
var DEFAULT_MODEL = "kimi-for-coding";
var DEFAULT_TIMEOUT_MS = DEFAULT_TEXT_ANALYSIS_STAGE_TIMEOUT_MS;
var DEFAULT_MAX_RETRIES = DEFAULT_TEXT_ANALYSIS_MAX_RETRIES;
var EXTRA_GRAMMAR_STRUCTURE_RULES = [
  "",
  "=== EXTRA STRUCTURE SAFETY RULES ===",
  "For grammar.structure, every detail line must name the structure type, the sentence component, and the exact English words from the original sentence.",
  "Never use ellipsis such as '...', '\u2026', 'that ...', or any shortened English fragment.",
  "Never use wording such as '\u7701\u7565', '\u7701\u53BB', '\u7565\u53BB', or '\u7701\u5199'.",
  "If grammar involves an ellipsis relationship, explain it as a parallel, follow-up, or complement structure, but still quote the full English words that actually appear in the original sentence.",
  "The reader must be able to map every structure directly back to the exact words in the original sentence."
].join("\n");
var STAGE_MODES = ["translation", "segmentation", "grammar", "vocabulary", "ielts"];
async function analyzeSentence(input, env) {
  validateInput(input, env);
  const provider = resolveProvider(env);
  const model = resolveModel(env, provider);
  const timeoutMs = resolvePositiveInteger(
    env.ANTHROPIC_HTTP_TIMEOUT_MS || env.OPENAI_HTTP_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
  const maxRetries = resolvePositiveInteger(
    env.ANTHROPIC_HTTP_MAX_RETRIES || env.OPENAI_HTTP_MAX_RETRIES,
    DEFAULT_MAX_RETRIES
  );
  const textContent = input.mode === "all" ? await analyzeAll(input, env, provider, model, timeoutMs, maxRetries) : await analyzeSingleStage(input, env, provider, model, timeoutMs, maxRetries);
  return {
    textContent,
    source: "anthropic-compatible-api",
    model
  };
}
async function analyzeAll(input, env, provider, model, timeoutMs, maxRetries) {
  let current = input.currentTextContent ?? createEmptyTextContent();
  for (const mode of STAGE_MODES) {
    current = await analyzeSingleStage(
      {
        ...input,
        mode,
        currentTextContent: current
      },
      env,
      provider,
      model,
      timeoutMs,
      maxRetries
    );
  }
  return current;
}
async function analyzeSingleStage(input, env, provider, model, timeoutMs, maxRetries) {
  const prompt = `${buildUserPrompt(input)}

Strict requirement: return JSON only, with no markdown code fence and no extra explanation.`;
  const raw = provider === "anthropic" ? await callAnthropicCompatibleApi(input.mode, prompt, env, model, timeoutMs, maxRetries) : await callOpenAiCompatibleApi(input.mode, prompt, env, model, timeoutMs, maxRetries);
  const parsed = parseModelJsonContent(raw, input.mode);
  if (!parsed) {
    throw new Error("LLM returned incomplete or invalid JSON.");
  }
  return mergeAndNormalizeResult(input, parsed);
}
function validateInput(input, env) {
  if (!input.sentence?.trim()) {
    throw new Error("\u82F1\u8BED\u539F\u53E5\u4E0D\u80FD\u4E3A\u7A7A\u3002");
  }
  if (!input.bookName?.trim()) {
    throw new Error("\u539F\u8457\u4E66\u540D\u4E0D\u80FD\u4E3A\u7A7A\u3002");
  }
  if (!input.author?.trim()) {
    throw new Error("\u539F\u8457\u4F5C\u8005\u4E0D\u80FD\u4E3A\u7A7A\u3002");
  }
  if (!resolveApiKey(env, resolveProvider(env))) {
    throw new Error("\u7F3A\u5C11 API Key\uFF0C\u65E0\u6CD5\u8C03\u7528\u6587\u672C\u89E3\u6790\u6A21\u578B\u3002");
  }
  if (!resolveBaseUrl(env, resolveProvider(env))) {
    throw new Error("\u7F3A\u5C11 API Base URL\uFF0C\u65E0\u6CD5\u8C03\u7528\u6587\u672C\u89E3\u6790\u6A21\u578B\u3002");
  }
}
function resolveProvider(env) {
  return env.ANTHROPIC_BASE_URL?.trim() || env.ANTHROPIC_API_KEY?.trim() ? "anthropic" : "openai";
}
function resolveModel(env, provider) {
  if (provider === "anthropic") {
    return env.ANTHROPIC_MODEL?.trim() || env.Kimi_MODEL?.trim() || env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  }
  return env.Kimi_MODEL?.trim() || env.OPENAI_MODEL?.trim() || env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}
function resolveApiKey(env, provider) {
  if (provider === "anthropic") {
    return env.ANTHROPIC_API_KEY?.trim() || env.Kimi_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || "";
  }
  return env.Kimi_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim() || "";
}
function resolveBaseUrl(env, provider) {
  if (provider === "anthropic") {
    return env.ANTHROPIC_BASE_URL?.trim() || "";
  }
  return env.Kimi_API_BASE?.trim() || env.OPENAI_API_BASE?.trim() || "";
}
async function callAnthropicCompatibleApi(mode, prompt, env, model, timeoutMs, maxRetries) {
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
        content: [{ type: "text", text: prompt }]
      }
    ]
  };
  return requestWithRetry(
    endpoint,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(body)
    },
    timeoutMs,
    maxRetries,
    extractTextFromAnthropicResponse,
    "Anthropic \u517C\u5BB9\u63A5\u53E3\u8C03\u7528\u5931\u8D25"
  );
}
async function callOpenAiCompatibleApi(mode, prompt, env, model, timeoutMs, maxRetries) {
  const baseUrl = resolveBaseUrl(env, "openai").replace(/\/$/, "");
  const endpoint = `${baseUrl}/chat/completions`;
  const apiKey = resolveApiKey(env, "openai");
  const body = {
    model,
    max_tokens: getMaxTokensForMode(mode),
    temperature: 0.1,
    messages: [
      { role: "system", content: buildSystemPrompt(mode) },
      { role: "user", content: prompt }
    ]
  };
  return requestWithRetry(
    endpoint,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    },
    timeoutMs,
    maxRetries,
    extractTextFromOpenAiResponse,
    "OpenAI \u517C\u5BB9\u63A5\u53E3\u8C03\u7528\u5931\u8D25"
  );
}
async function requestWithRetry(endpoint, init, timeoutMs, maxRetries, extractText, errorPrefix) {
  let lastError = "\u8BF7\u6C42\u5931\u8D25\u3002";
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        ...init,
        signal: controller.signal
      });
      const rawText = await response.text();
      const payload = safeJsonParse(rawText);
      if (!response.ok) {
        const reason = extractProviderError(payload, rawText, response.status);
        throw new Error(`${errorPrefix}\uFF1A${reason}`);
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
function resolveAnthropicMessagesEndpoint(baseUrl) {
  const normalized = baseUrl.replace(/\/$/, "");
  return /\/v1$/i.test(normalized) ? `${normalized}/messages` : `${normalized}/v1/messages`;
}
function extractProviderError(payload, rawText, status) {
  const record = asRecord(payload);
  const error = asRecord(record.error);
  return asTrimmedString(error.message) || rawText || `HTTP ${status}`;
}
function extractTextFromAnthropicResponse(payload) {
  const record = asRecord(payload);
  const content = Array.isArray(record.content) ? record.content : [];
  const text = content.map((item) => asRecord(item)).filter((item) => item.type === "text" && typeof item.text === "string").map((item) => String(item.text).trim()).filter(Boolean).join("\n");
  if (!text) {
    throw new Error("Anthropic \u517C\u5BB9\u63A5\u53E3\u8FD4\u56DE\u5185\u5BB9\u4E3A\u7A7A\u3002");
  }
  return text;
}
function extractTextFromOpenAiResponse(payload) {
  const record = asRecord(payload);
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const message = asRecord(asRecord(choices[0]).message);
  const text = asTrimmedString(message.content);
  if (!text) {
    throw new Error("OpenAI \u517C\u5BB9\u63A5\u53E3\u8FD4\u56DE\u5185\u5BB9\u4E3A\u7A7A\u3002");
  }
  return text;
}
function buildSystemPrompt(mode) {
  const rules = [
    "You are a precise English sentence analysis agent for Chinese learners.",
    "Return valid JSON only and match the requested schema exactly.",
    "Use Simplified Chinese for explanations. Keep original English text in English.",
    "Do not output markdown code fences, notes, or any extra text.",
    "Never leave required fields empty.",
    "translation must be a natural Chinese translation suitable for teaching.",
    "prompt1 and prompt3 must be the two English halves of the original sentence.",
    "prompt2 and prompt4 must be the matching Chinese explanations or translations.",
    "prompt1, prompt2, prompt3, and prompt4 must contain only the segment content itself, with no labels such as \u524D\u534A\u90E8\u5206, \u540E\u534A\u90E8\u5206, \u7B2C\u4E00\u90E8\u5206, \u7B2C\u4E8C\u90E8\u5206, Part 1, Part 2, Prompt 1, or Prompt 2.",
    "",
    "=== GRAMMAR ANALYSIS FORMAT RULES ===",
    "",
    "grammar.tense MUST use EXACTLY this format:",
    "  \u5168\u53E5\u4F7F\u7528**[\u65F6\u6001\u540D\u79F0]**\uFF08[\u5177\u4F53\u52A8\u8BCD\u5F62\u5F0F]\uFF09\uFF0C\u7528\u4E8E\u63CF\u8FF0[\u8BE5\u65F6\u6001\u7684\u529F\u80FD\u548C\u4F5C\u7528]\u3002",
    "Examples:",
    "  \u5168\u53E5\u4F7F\u7528**\u4E00\u822C\u8FC7\u53BB\u65F6**\uFF08was, lay\uFF09\uFF0C\u7528\u4E8E\u63CF\u8FF0\u8FC7\u53BB\u53D1\u751F\u7684\u72B6\u6001\u548C\u5B58\u5728\u3002",
    "  \u5168\u53E5\u4F7F\u7528**\u73B0\u5728\u5B8C\u6210\u65F6**\uFF08have done\uFF09\uFF0C\u7528\u4E8E\u5F3A\u8C03\u8FC7\u53BB\u52A8\u4F5C\u5BF9\u73B0\u5728\u7684\u5F71\u54CD\u3002",
    "",
    "grammar.voice MUST use EXACTLY this format:",
    "  **[\u4E3B\u52A8\u8BED\u6001/\u88AB\u52A8\u8BED\u6001]**\uFF08[\u5177\u4F53\u52A8\u8BCD\u793A\u4F8B]\uFF09",
    "Examples:",
    "  **\u4E3B\u52A8\u8BED\u6001**\uFF08the road lay / it lumbered\uFF09",
    "  **\u88AB\u52A8\u8BED\u6001**\uFF08was written / were made\uFF09",
    "  **\u4E3B\u52A8\u8BED\u6001**\uFF08he had appointed / he had provided / he had sent / he had ordered\uFF09",
    "",
    "grammar.structure MUST follow these rules:",
    "  1. First provide detailed analysis with multiple lines starting with '-', explaining each component",
    "  2. The LAST line ONLY must be the bold complete structure summary",
    "  3. The final summary line MUST use this EXACT format with ALL components:",
    "       **\u4E3B\u8BED\uFF08...\uFF09 + \u8C13\u8BED\uFF08...\uFF09 + \u5BBE\u8BED/\u8868\u8BED\uFF08...\uFF09 + \u5176\u4ED6\u6210\u5206\uFF08...\uFF09**",
    "  4. Each component must be wrapped in bold markers ** **",
    "  5. Use + to connect all components",
    "  6. Examples of final summary line:",
    "       **\u4E3B\u8BED\uFF08The Dover road\uFF09 + \u8C13\u8BED\uFF08lay\uFF09 + \u8868\u8BED\uFF08beyond the Dover mail\uFF09 + \u63D2\u5165\u8BED\uFF08as to him\uFF09 + \u65B9\u5F0F\u72B6\u8BED\u4ECE\u53E5\uFF08as it lumbered...\uFF09**",
    "       **\u5F62\u5F0F\u4E3B\u8BED\uFF08It\uFF09+ \u8C13\u8BED\uFF08happened\uFF09+ \u4E3B\u8BED\u4ECE\u53E5\uFF08that he had appointed...\uFF09+ \u5E76\u5217\u7684\u5B9A\u8BED\u4ECE\u53E5\u53CA\u4FEE\u9970\u6210\u5206\uFF08for whom...\uFF09+ \u5E76\u5217\u7684\u8C13\u8BED\u90E8\u5206\uFF08and had ordered...\uFF09+ \u5B9A\u8BED\u4ECE\u53E5\uFF08which...\uFF09+ \u539F\u56E0\u72B6\u8BED\u4ECE\u53E5\uFF08for that...\uFF09**",
    "",
    "=== END GRAMMAR RULES ===",
    "",
    "vocabulary must contain exactly 6 items.",
    "Each vocabulary item must include word, phonetic, partOfSpeech, meaning, example, and translation.",
    "Each vocabulary.example must be a brand-new English sentence created from the target word's meaning in the original sentence.",
    "Never reuse the original sentence, any clause, or any fragment from the original sentence as vocabulary.example.",
    "Each vocabulary.translation must translate that new example sentence, not the original sentence.",
    "ielts must contain listening, speaking, reading, and writing as natural paragraphs.",
    `Output shape: ${getModeOutputShape(mode)}`
  ];
  if (mode === "segmentation") {
    rules.push("Only output prompt1, prompt2, prompt3, and prompt4.");
  } else if (mode !== "all") {
    rules.push(`Only output the field group for ${mode}.`);
  }
  return `${rules.join("\n")}${EXTRA_GRAMMAR_STRUCTURE_RULES}`;
}
function buildUserPrompt(input) {
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
    "   Format: \u5168\u53E5\u4F7F\u7528**[\u65F6\u6001\u540D\u79F0]**\uFF08[\u5177\u4F53\u52A8\u8BCD\u5F62\u5F0F]\uFF09\uFF0C\u7528\u4E8E\u63CF\u8FF0[\u8BE5\u65F6\u6001\u7684\u529F\u80FD\u548C\u4F5C\u7528]\u3002",
    "   Examples:",
    "   - \u5168\u53E5\u4F7F\u7528**\u4E00\u822C\u8FC7\u53BB\u65F6**\uFF08was, lay\uFF09\uFF0C\u7528\u4E8E\u63CF\u8FF0\u8FC7\u53BB\u53D1\u751F\u7684\u72B6\u6001\u548C\u5B58\u5728\u3002",
    "   - \u5168\u53E5\u4F7F\u7528**\u73B0\u5728\u5B8C\u6210\u65F6**\uFF08have done\uFF09\uFF0C\u7528\u4E8E\u5F3A\u8C03\u8FC7\u53BB\u52A8\u4F5C\u5BF9\u73B0\u5728\u7684\u5F71\u54CD\u3002",
    '   - \u5168\u53E5\u4F7F\u7528**\u8FC7\u53BB\u5B8C\u6210\u65F6**\uFF08had appointed, had provided, had sent, had ordered\uFF09\uFF0C\u7528\u4E8E\u63CF\u8FF0\u5728\u8FC7\u53BB\u7684\u67D0\u4E2A\u65F6\u95F4\u70B9\uFF08\u5373"It happened"\u6240\u6307\u7684\u65F6\u523B\uFF09\u4E4B\u524D\u5DF2\u7ECF\u5B8C\u6210\u6216\u53D1\u751F\u7684\u52A8\u4F5C\uFF0C\u5F3A\u8C03\u8FD9\u4E9B\u5B89\u6392\u548C\u51C6\u5907\u662F\u5148\u4E8E"\u78B0\u5DE7"\u8FD9\u4E00\u65F6\u523B\u7684\u65E2\u5B9A\u4E8B\u5B9E\u3002',
    "",
    "2. VOICE ANALYSIS (grammar.voice) - MUST use EXACTLY this format:",
    "   Format: **[\u4E3B\u52A8\u8BED\u6001/\u88AB\u52A8\u8BED\u6001]**\uFF08[\u5177\u4F53\u52A8\u8BCD\u793A\u4F8B]\uFF09",
    "   Examples:",
    "   - **\u4E3B\u52A8\u8BED\u6001**\uFF08the road lay / it lumbered\uFF09",
    "   - **\u88AB\u52A8\u8BED\u6001**\uFF08was written / were made\uFF09",
    "   - **\u4E3B\u52A8\u8BED\u6001**\uFF08he had appointed / he had provided / he had sent / he had ordered\uFF09",
    "",
    "3. STRUCTURE ANALYSIS (grammar.structure) - MUST follow these rules:",
    "   - Provide detailed analysis with multiple lines starting with '-', explaining each component",
    "   - The LAST line ONLY must be the complete structure summary",
    "   - The final summary line MUST use this EXACT format with ALL components:",
    "     **\u4E3B\u8BED\uFF08...\uFF09 + \u8C13\u8BED\uFF08...\uFF09 + \u5BBE\u8BED/\u8868\u8BED\uFF08...\uFF09 + \u5176\u4ED6\u6210\u5206\uFF08...\uFF09**",
    "   - Each component must be wrapped in bold markers ** **",
    "   - Use + to connect all components",
    "   - Examples of final summary line:",
    "     **\u4E3B\u8BED\uFF08The Dover road\uFF09 + \u8C13\u8BED\uFF08lay\uFF09 + \u8868\u8BED\uFF08beyond the Dover mail\uFF09 + \u63D2\u5165\u8BED\uFF08as to him\uFF09 + \u65B9\u5F0F\u72B6\u8BED\u4ECE\u53E5\uFF08as it lumbered...\uFF09**",
    "     **\u5F62\u5F0F\u4E3B\u8BED\uFF08It\uFF09+ \u8C13\u8BED\uFF08happened\uFF09+ \u4E3B\u8BED\u4ECE\u53E5\uFF08that he had appointed...\uFF09+ \u5E76\u5217\u7684\u5B9A\u8BED\u4ECE\u53E5\u53CA\u4FEE\u9970\u6210\u5206\uFF08for whom...\uFF09+ \u5E76\u5217\u7684\u8C13\u8BED\u90E8\u5206\uFF08and had ordered...\uFF09+ \u5B9A\u8BED\u4ECE\u53E5\uFF08which...\uFF09+ \u539F\u56E0\u72B6\u8BED\u4ECE\u53E5\uFF08for that...\uFF09**",
    "   - ALWAYS end with the bold complete structure summary line",
    "",
    "4. VOCABULARY EXAMPLE RULES:",
    "   - Each vocabulary.example must be a newly created English sentence based on the target word's meaning in the original sentence.",
    "   - NEVER copy the original sentence, any clause, or any fragment from the original sentence.",
    "   - vocabulary.translation must be the Chinese translation of that new example sentence.",
    "",
    "=== END FORMAT REQUIREMENTS ==="
  ];
  if (input.currentTextContent) {
    lines.push("", "Current draft for reference:");
    lines.push(JSON.stringify(stripVocabularyIds(input.currentTextContent), null, 2));
  }
  return `${lines.join("\n")}${EXTRA_GRAMMAR_STRUCTURE_RULES}`;
}
function getModeOutputShape(mode) {
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
function getMaxTokensForMode(mode) {
  switch (mode) {
    case "translation":
      return 1e3;
    case "segmentation":
      return 1e3;
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
function stripVocabularyIds(textContent) {
  return {
    ...textContent,
    vocabulary: textContent.vocabulary.map(({ id: _id, ...item }) => item)
  };
}
function parseModelJsonContent(text, mode) {
  const direct = safeJsonParse(extractJsonBlock(text));
  if (direct) {
    return direct;
  }
  return salvageModeResult(text, mode);
}
function extractJsonBlock(text) {
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
function salvageModeResult(text, mode) {
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
function extractJsonStringField(text, key) {
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
function extractBalancedJsonField(text, key) {
  const match = text.match(new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*([\\[{])`, "s"));
  if (!match?.[0] || match.index === void 0) {
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
    if (char === '"') {
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
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function mergeAndNormalizeResult(input, raw) {
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
          prompt4: candidate.prompt4
        },
        input
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
function normalizeTextContent(raw, input) {
  const fallback = input.currentTextContent ?? createEmptyTextContent();
  const grammar = asRecord(raw.grammar);
  const ielts = asRecord(raw.ielts);
  const vocabulary = Array.isArray(raw.vocabulary) ? raw.vocabulary : fallback.vocabulary;
  return {
    translation: asTrimmedString(raw.translation, fallback.translation),
    prompt1: asTrimmedString(raw.prompt1, fallback.prompt1),
    prompt2: asTrimmedString(raw.prompt2, fallback.prompt2),
    prompt3: asTrimmedString(raw.prompt3, fallback.prompt3),
    prompt4: asTrimmedString(raw.prompt4, fallback.prompt4),
    grammar: {
      tense: asTrimmedString(grammar.tense, fallback.grammar.tense),
      voice: asTrimmedString(grammar.voice, fallback.grammar.voice),
      structure: asTrimmedString(grammar.structure, fallback.grammar.structure)
    },
    vocabulary: normalizeVocabulary(vocabulary, fallback.vocabulary, input.sentence),
    ielts: {
      listening: asTrimmedString(ielts.listening, fallback.ielts.listening),
      speaking: asTrimmedString(ielts.speaking, fallback.ielts.speaking),
      reading: asTrimmedString(ielts.reading, fallback.ielts.reading),
      writing: asTrimmedString(ielts.writing, fallback.ielts.writing)
    }
  };
}
function normalizeVocabulary(raw, fallback, sentence) {
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
      translation: shouldReplaceExample ? buildVocabularyExampleTranslation(word) : asTrimmedString(record.translation, fallbackItem.translation) || buildVocabularyExampleTranslation(word)
    };
  });
  while (normalized.length < 6) {
    normalized.push(createEmptyVocabularyCard(normalized.length));
  }
  return normalized;
}
function normalizeForSentenceComparison(value) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function reusesOriginalSentenceFragment(example, sentence) {
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
function buildVocabularyExample(word) {
  if (!word) {
    return "";
  }
  return `In a new example, "${word}" carries a meaning similar to the one in the original sentence.`;
}
function buildVocabularyExampleTranslation(word) {
  if (!word) {
    return "";
  }
  return `\u5728\u8FD9\u4E2A\u65B0\u4F8B\u53E5\u91CC\uFF0C\u201C${word}\u201D\u8868\u8FBE\u7684\u610F\u601D\u4E0E\u539F\u53E5\u4E2D\u7684\u7528\u6CD5\u76F8\u8FD1\u3002`;
}
function createEmptyTextContent() {
  return {
    translation: "",
    prompt1: "",
    prompt2: "",
    prompt3: "",
    prompt4: "",
    grammar: {
      tense: "",
      voice: "",
      structure: ""
    },
    vocabulary: Array.from({ length: 6 }, (_, index) => createEmptyVocabularyCard(index)),
    ielts: {
      listening: "",
      speaking: "",
      reading: "",
      writing: ""
    }
  };
}
function createEmptyVocabularyCard(index) {
  return {
    id: `vocab-${index + 1}-${randomUUID()}`,
    word: "",
    phonetic: "",
    partOfSpeech: "",
    meaning: "",
    example: "",
    translation: ""
  };
}
function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}
function asTrimmedString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}
function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function resolvePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function humanizeErrorMessage(message) {
  if (/tool_search/i.test(message) && /400|bad request/i.test(message)) {
    return "\u63A5\u53E3\u89E6\u53D1\u4E86 tool_search 400 \u9519\u8BEF\uFF0C\u8BF7\u786E\u8BA4 ENABLE_TOOL_SEARCH=false\u3002";
  }
  if (/only available for coding agents/i.test(message)) {
    return "\u5F53\u524D\u4ECD\u5728\u7528\u9519\u8BEF\u534F\u8BAE\u8BBF\u95EE Kimi Code\u3002\u8BF7\u4F7F\u7528 ANTHROPIC_BASE_URL=https://api.kimi.com/coding/ \u548C ANTHROPIC_API_KEY\u3002";
  }
  if (/aborted|timeout/i.test(message)) {
    return "\u6587\u672C\u89E3\u6790\u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002";
  }
  return message;
}
export {
  analyzeSentence
};
