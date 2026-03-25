import { randomUUID } from "node:crypto";
import type {
  AnalysisSource,
  TextAnalysisContent,
  TextAnalysisMode,
  TextAnalysisRequest,
  TextAnalysisResponse,
} from "../src/lib/text-analysis-contract";

const DEFAULT_MODEL = "kimi-for-coding";
const DEFAULT_HTTP_TIMEOUT_MS = 300_000;
const DEFAULT_HTTP_MAX_RETRIES = 2;

const ALL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["translation", "prompt1", "prompt2", "prompt3", "prompt4", "grammar", "vocabulary", "ielts"],
  properties: {
    translation: { type: "string" },
    prompt1: { type: "string" },
    prompt2: { type: "string" },
    prompt3: { type: "string" },
    prompt4: { type: "string" },
    grammar: {
      type: "object",
      additionalProperties: false,
      required: ["tense", "voice", "structure"],
      properties: {
        tense: { type: "string" },
        voice: { type: "string" },
        structure: { type: "string" },
      },
    },
    vocabulary: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["word", "phonetic", "partOfSpeech", "meaning", "example", "translation"],
        properties: {
          word: { type: "string" },
          phonetic: { type: "string" },
          partOfSpeech: { type: "string" },
          meaning: { type: "string" },
          example: { type: "string" },
          translation: { type: "string" },
        },
      },
    },
    ielts: {
      type: "object",
      additionalProperties: false,
      required: ["listening", "speaking", "reading", "writing"],
      properties: {
        listening: { type: "string" },
        speaking: { type: "string" },
        reading: { type: "string" },
        writing: { type: "string" },
      },
    },
  },
} as const;

const PARTIAL_SCHEMAS: Record<Exclude<TextAnalysisMode, "all">, Record<string, unknown>> = {
  segmentation: {
    type: "object",
    additionalProperties: false,
    required: ["prompt1", "prompt2", "prompt3", "prompt4"],
    properties: {
      prompt1: { type: "string" },
      prompt2: { type: "string" },
      prompt3: { type: "string" },
      prompt4: { type: "string" },
    },
  },
  translation: {
    type: "object",
    additionalProperties: false,
    required: ["translation"],
    properties: {
      translation: { type: "string" },
    },
  },
  grammar: {
    type: "object",
    additionalProperties: false,
    required: ["grammar"],
    properties: {
      grammar: ALL_SCHEMA.properties.grammar,
    },
  },
  vocabulary: {
    type: "object",
    additionalProperties: false,
    required: ["vocabulary"],
    properties: {
      vocabulary: ALL_SCHEMA.properties.vocabulary,
    },
  },
  ielts: {
    type: "object",
    additionalProperties: false,
    required: ["ielts"],
    properties: {
      ielts: ALL_SCHEMA.properties.ielts,
    },
  },
};

interface AnalyzeEnv {
  OPENAI_API_KEY?: string;
  OPENAI_API_BASE?: string;
  OPENAI_MODEL?: string;
  OPENAI_HTTP_TIMEOUT_MS?: string;
  OPENAI_HTTP_MAX_RETRIES?: string;
  // 兼容 Kimi 的变量名
  Kimi_API_KEY?: string;
  Kimi_API_BASE?: string;
  Kimi_MODEL?: string;
  // 保留旧配置兼容
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_HTTP_TIMEOUT_MS?: string;
  ANTHROPIC_HTTP_MAX_RETRIES?: string;
}

export async function analyzeSentence(input: TextAnalysisRequest, env: AnalyzeEnv): Promise<TextAnalysisResponse> {
  validateInput(input, env);

  // 优先使用 Kimi 配置，然后是 OpenAI，最后是旧配置
  const model = env.Kimi_MODEL?.trim() || env.OPENAI_MODEL?.trim() || env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const httpTimeoutMs = resolvePositiveInteger(
    env.OPENAI_HTTP_TIMEOUT_MS || env.ANTHROPIC_HTTP_TIMEOUT_MS,
    DEFAULT_HTTP_TIMEOUT_MS
  );
  const httpMaxRetries = resolvePositiveInteger(
    env.OPENAI_HTTP_MAX_RETRIES || env.ANTHROPIC_HTTP_MAX_RETRIES,
    DEFAULT_HTTP_MAX_RETRIES
  );
  const errors: string[] = [];

  const textContent =
    input.mode === "all"
      ? await analyzeAllWithOpenAICompatibleApi(input, env, model, errors, httpTimeoutMs, httpMaxRetries)
      : await analyzeWithOpenAICompatibleApi(input, env, model, errors, httpTimeoutMs, httpMaxRetries);
  return {
    textContent,
    source: "openai-compatible-api",
    model,
  };
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
  // 优先使用 Kimi 配置，然后是 OpenAI，最后是旧配置
  const apiKey = env.Kimi_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim();
  const baseUrl = env.Kimi_API_BASE?.trim() || env.OPENAI_API_BASE?.trim() || env.ANTHROPIC_BASE_URL?.trim();
  if (!apiKey) {
    throw new Error("缺少 API Key（Kimi_API_KEY、OPENAI_API_KEY 或 ANTHROPIC_API_KEY），无法调用 LLM。");
  }
  if (!baseUrl) {
    throw new Error("缺少 API Base URL（Kimi_API_BASE、OPENAI_API_BASE 或 ANTHROPIC_BASE_URL），无法调用 LLM。");
  }
}

async function analyzeWithOpenAICompatibleApi(
  input: TextAnalysisRequest,
  env: AnalyzeEnv,
  model: string,
  previousErrors: string[],
  timeoutMs: number,
  maxRetries: number,
) {
  // 优先使用 Kimi 配置，然后是 OpenAI，最后是旧配置
  const baseUrl = (env.Kimi_API_BASE?.trim() || env.OPENAI_API_BASE?.trim() || env.ANTHROPIC_BASE_URL?.trim() || "").replace(/\/$/, "");
  const apiKey = env.Kimi_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim() || "";
  const endpoint = `${baseUrl}/chat/completions`;

  // OpenAI 格式: system 作为 message 角色
  const body = {
    model,
    max_tokens: getMaxTokensForMode(input.mode),
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: buildCompactSystemPrompt(input.mode),
      },
      {
        role: "user",
        content: `${buildCompactUserPrompt(input)}\n\nStrict requirement: return JSON only, with no markdown code fence and no extra explanation.`,
      },
    ],
  };

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const rawText = await response.text();
      const payload = safeJsonParse(rawText);

      if (response.status === 429 && attempt < maxRetries) {
        await sleep(getRetryDelayMs(payload, attempt));
        continue;
      }

      if (!response.ok) {
        const reason = payload?.error?.message || rawText || `HTTP ${response.status}`;
        throw new Error(`OpenAI 兼容接口调用失败：${reason}`);
      }

      const content = extractTextFromOpenAIResponse(payload);
      const result = parseModelJsonContent(content, input.mode);
      if (!result) {
        throw new Error("OpenAI 兼容接口没有返回可解析的 JSON。");
      }

      return mergeAndNormalizeResult(input, result);
    } catch (error) {
      if (attempt >= maxRetries) {
        const messages = [...previousErrors, getErrorMessage(error)];
        throw new Error(joinErrorMessages(messages));
      }
      await sleep(400 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("文本解析失败。");
}

async function analyzeAllWithOpenAICompatibleApi(
  input: TextAnalysisRequest,
  env: AnalyzeEnv,
  model: string,
  previousErrors: string[],
  timeoutMs: number,
  maxRetries: number,
) {
  let currentTextContent = input.currentTextContent ?? createEmptyTextContent();
  const stageModes: TextAnalysisMode[] = ["translation", "segmentation", "grammar", "vocabulary", "ielts"];

  for (let index = 0; index < stageModes.length; index += 1) {
    currentTextContent = await analyzeWithOpenAICompatibleApi(
      {
        ...input,
        mode: stageModes[index],
        currentTextContent,
      },
      env,
      model,
      index === 0 ? previousErrors : [],
      timeoutMs,
      maxRetries,
    );
  }

  return currentTextContent;
}

function getSchemaForMode(mode: TextAnalysisMode) {
  return mode === "all" ? ALL_SCHEMA : PARTIAL_SCHEMAS[mode];
}

function getMaxTokensForMode(mode: TextAnalysisMode) {
  switch (mode) {
    case "translation":
      return 600;
    case "segmentation":
      return 700;
    case "grammar":
      return 900;
    case "vocabulary":
      return 1400;
    case "ielts":
      return 1500;
    case "all":
    default:
      return 2200;
  }
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
    case "all":
    default:
      return '{"translation":"...","prompt1":"...","prompt2":"...","prompt3":"...","prompt4":"...","grammar":{"tense":"...","voice":"...","structure":"..."},"vocabulary":[...],"ielts":{"listening":"...","speaking":"...","reading":"...","writing":"..."}}';
  }
}

function buildSystemPrompt(mode: TextAnalysisMode) {
  const sharedRules = [
    "你是一个严谨的英语长难句教学解析 Agent，负责输出可直接进入编辑页的中文教学内容。",
    "必须使用简体中文解释，英语原文保留英文。",
    "严格遵守产品需求：文本解析阶段输出翻译、分句、语法分析、6个词汇解析、雅思备考建议。",
    "不得输出 schema 之外的字段。",
    "不要解释你自己在做什么，不要输出多余前后缀。",
    "prompt1 和 prompt3 必须是原句拆分后的英文两部分；prompt2 和 prompt4 必须分别对应这两部分的中文解释或翻译。",
    "grammar.tense 和 grammar.voice 里的时态/语态名称必须用 markdown 加粗，例如 **一般现在时**、**主动语态**。",
    "grammar.structure 必须是多行内容，前面几行用 '-' 开头列出成分分析，最后一行必须是一个加粗的完整结构总结。",
    "vocabulary 必须正好输出 6 项，每项包括单词、音标、词性、中文释义、英文例句、中文例句翻译。",
    "ielts 四项建议必须是自然段，禁止使用编号或列表符号。",
  ];

  if (mode === "segmentation") {
    sharedRules.push("本次只重新生成分句相关字段：prompt1、prompt2、prompt3、prompt4。");
  } else if (mode !== "all") {
    sharedRules.push(`本次只重新生成 ${mode} 对应字段，未要求的字段不要输出。`);
  }

  return sharedRules.join("\n");
}

function buildUserPrompt(input: TextAnalysisRequest) {
  const base = [
    `任务模式：${input.mode}`,
    `英语原句：${input.sentence.trim()}`,
    `书名：${input.bookName.trim()}`,
    `作者：${input.author.trim()}`,
    "",
    "请根据 PRD 的文本解析要求输出结果：",
    "1. translation：完整中文翻译，适合教学场景。",
    "2. prompt1-4：把句子拆成两部分，英文和中文一一对应，长度尽量平衡，自然断在语义或语气边界。",
    "3. grammar：输出时态分析、语态识别、句式结构分析，结构分析最后必须有一行加粗总结。",
    "4. vocabulary：精挑 6 个核心词汇或难点词汇，兼顾原著语境与教学价值。",
    "5. ielts：分别给出 listening、speaking、reading、writing 四项备考建议，每项单独成段。",
  ];

  if (input.currentTextContent) {
    base.push("", "当前编辑页草稿如下，可作为风格和术语参考，但请以原句准确解析为准：");
    base.push(JSON.stringify(stripVocabularyIds(input.currentTextContent), null, 2));
  }

  return base.join("\n");
}

function buildStrictSystemPrompt(mode: TextAnalysisMode) {
  const sharedRules = [
    "You are a precise English sentence analysis agent for Chinese learners.",
    "Return teaching explanations in Simplified Chinese, but keep original English text in English.",
    "Return only JSON that matches the requested schema. Do not output markdown code fences or extra commentary.",
    "Never leave required fields blank. If uncertain, provide a conservative best-effort answer instead of an empty string.",
    "prompt1 and prompt3 must be the two English parts of the original sentence; prompt2 and prompt4 must be the matching Chinese explanations or translations.",
    "prompt1, prompt2, prompt3, and prompt4 must contain only the segment content itself, with no labels such as 前半部分, 后半部分, 第一部分, 第二部分, Part 1, Part 2, Prompt 1, or Prompt 2.",
    "grammar.tense and grammar.voice must use bold markdown labels such as **一般现在时** and **主动语态**.",
    "grammar.structure must be multiline: start with several '-' analysis lines and end with one bold overall structure summary line.",
    "Provide exactly 6 vocabulary items.",
    "Every vocabulary item must include word, phonetic, partOfSpeech, meaning, example, and translation.",
    "Each vocabulary.example must be one complete English sentence that naturally contains the target word.",
    "Each vocabulary.example must be a brand-new sentence created from the target word's meaning in the original sentence.",
    "Never reuse the original sentence, any clause, or any fragment from the original sentence as vocabulary.example.",
    "Each vocabulary.translation must be the Chinese translation of that example sentence.",
    "IELTS advice must be natural paragraphs without numbering or bullet symbols.",
    "ielts.listening must explain listening comprehension difficulties, test points, and practical listening strategies for this exact sentence.",
    "ielts.speaking must explain how to imitate or adapt this sentence pattern in speaking, including usable scenarios and topic extension ideas.",
    "ielts.reading must explain how to identify the sentence core, split the long sentence, and locate key information efficiently.",
    "ielts.writing must explain how to imitate this sentence pattern in writing, including tense choice, logical connectors, and suitable essay situations.",
    "IELTS advice must be concrete and sentence-specific, not generic study tips.",
    "When useful, directly mention exact trigger words or patterns from the original sentence, such as connectors, verb chains, rare words, relative clauses, or with-structures.",
    "ielts.listening must follow this example style: '在听力考试中，这类包含[句子特点，如长串动作顺序、多个从句]的句子是[Section 3或4学术对话或独白]的典型难点。考生需要注意[具体的连接词、从句标记、罕见词汇]。建议采用[预判关键词/梳理事件链条/抓主干]的听力策略，[具体操作建议].' Always quote exact words from the sentence.",
    "ielts.speaking must follow this example style: '这个句式在口语表达中可以用于描述[具体场景，如个人经历中一段复杂的、有多步骤和转折的事件]。考生可以模仿[具体句式框架]的结构，来[清晰、有条理地讲述故事/进行对比论证]。在Part 2描述[事件类/人物类/地点类]话题时，这种能体现[时间顺序/细节描述/逻辑对比]的句式非常实用，能有效展示[语言组织能力/论证深度].'",
    "ielts.reading must follow this example style: '阅读此类[由分号连接多个意群/包含多从句]的长难句时，应首先识别主干（如：[主语+谓语+宾语]），然后利用[分号和连词/从句标记]将长句拆解为[几个逻辑部分]。关键是理解[某个关键从句或结构]这个[非限制性定语从句/独立主格结构]概括的是[前面整个复杂指令/伴随状态]，这样便可以快速准确地理解句意，抓住[核心词汇]这些核心词汇，就能快速把握[句子核心含义].'",
    "ielts.writing must follow this example style: '这个句式可以用于写作Task [1/2]中描述[流程图/论证过程/举例论证]。通过使用[with + 宾语 + 补足语/not...but.../分号连接相关意群]的结构，可以在主句之外高效地[补充细节状态/进行对比论证]。模仿其用[具体连接词]引入[转折事件/并列信息]的方法，能够有效提升文章[句式的多样性和逻辑层次感/句子丰富度和表现力]，建议在需要[叙述事件发展/描述多步骤过程/进行对比论证]的文章中使用.'",
  ];

  if (mode === "segmentation") {
    sharedRules.push("Only regenerate prompt1, prompt2, prompt3, and prompt4.");
  } else if (mode !== "all") {
    sharedRules.push(`Only regenerate the field group for "${mode}". Do not output unrelated fields.`);
  }

  return sharedRules.join("\n");
}

function buildStrictUserPrompt(input: TextAnalysisRequest) {
  const base = [
    `Task mode: ${input.mode}`,
    `Original English sentence: ${input.sentence.trim()}`,
    `Book: ${input.bookName.trim()}`,
    `Author: ${input.author.trim()}`,
    "",
    "Output requirements:",
    "1. translation: a complete Chinese translation suitable for teaching.",
    "2. prompt1-4: split the sentence into two balanced English parts, with matching Chinese explanations or translations.",
    "3. grammar: provide tense, voice, and detailed structure analysis; the final line of structure must be a bold overall summary.",
    "4. vocabulary: select 6 important words or difficult items from the sentence. Every item must include partOfSpeech, one complete English example sentence, and the Chinese translation of that example sentence.",
    "5. ielts: provide separate listening, speaking, reading, and writing advice paragraphs.",
    "   - listening: describe listening difficulties, key signals, and note-taking/listening strategies in a natural paragraph.",
    "   - speaking: describe how this pattern can be imitated in speaking, with scenario suggestions and topic expansion ideas.",
    "   - reading: describe how to identify the main clause, split the long sentence, and locate key details step by step.",
    "   - writing: describe how this pattern can be borrowed in writing, including tense choice, logical connection, and suitable essay use cases.",
    "   - all four IELTS paragraphs should sound like worked exam coaching for this exact sentence, not like broad textbook advice.",
    "   - when useful, quote exact words or structures from the sentence, such as connectors, verbs, clause markers, or notable vocabulary.",
    "   - listening must follow example style: '在听力考试中，这类包含...的句子是...的典型难点。考生需要注意...建议采用...的听力策略.' Quote exact words from the sentence.",
    "   - speaking must follow example style: '这个句式在口语表达中可以用于描述...考生可以模仿...在Part 2...时，这种...'",
    "   - reading must follow example style: '阅读此类...长难句时，应首先识别主干（...），然后利用...将长句拆解为...关键是理解...'",
    "   - writing must follow example style: '这个句式可以用于写作...中描述...。通过使用...的结构，可以在...。模仿其用...的方法，能够有效提升...'",
    "6. Keep every required field non-empty. Do not use placeholders like N/A, null, or empty strings.",
  ];

  if (input.currentTextContent) {
    base.push("", "Current editor draft for style reference only:");
    base.push(JSON.stringify(stripVocabularyIds(input.currentTextContent), null, 2));
  }

  return base.join("\n");
}

function buildGrammarAwareSystemPrompt(mode: TextAnalysisMode) {
  const rules = [
    "You are a precise English sentence analysis agent for Chinese learners.",
    "Return teaching explanations in Simplified Chinese, but keep original English text in English.",
    "Return only JSON that matches the requested schema. Do not output markdown code fences or extra commentary.",
    "Never leave required fields blank. If uncertain, provide a conservative best-effort answer instead of an empty string.",
    "prompt1 and prompt3 must be the two English parts of the original sentence; prompt2 and prompt4 must be the matching Chinese explanations or translations.",
    'grammar.tense must use exactly this format: 全句使用**[时态名称]**（[具体动词形式]），用于描述[该时态的功能和作用]。',
    'grammar.voice must use exactly this format: **[主动语态/被动语态]**（[具体动词示例]）。',
    "grammar.structure must be multiline and start with several lines beginning with '-'.",
    'The final line of grammar.structure must be one bold complete structure summary only, in a format like **主语（...） + 谓语（...） + 宾语/表语（...） + 从句或修饰成分（...）**.',
    "Provide exactly 6 vocabulary items.",
    "Every vocabulary item must include word, phonetic, partOfSpeech, meaning, example, and translation.",
    "Each vocabulary.example must be one complete English sentence that naturally contains the target word.",
    "Each vocabulary.example must be a brand-new sentence created from the target word's meaning in the original sentence.",
    "Never reuse the original sentence, any clause, or any fragment from the original sentence as vocabulary.example.",
    "Each vocabulary.translation must be the Chinese translation of that example sentence.",
    "IELTS advice must be natural paragraphs without numbering or bullet symbols.",
  ];

  if (mode === "segmentation") {
    rules.push("Only regenerate prompt1, prompt2, prompt3, and prompt4.");
  } else if (mode !== "all") {
    rules.push(`Only regenerate the field group for "${mode}". Do not output unrelated fields.`);
  }

  return rules.join("\n");
}

function buildGrammarAwareUserPrompt(input: TextAnalysisRequest) {
  const base = [
    `Task mode: ${input.mode}`,
    `Original English sentence: ${input.sentence.trim()}`,
    `Book: ${input.bookName.trim()}`,
    `Author: ${input.author.trim()}`,
    "",
    "Output requirements:",
    "1. translation: a complete Chinese translation suitable for teaching.",
    "2. prompt1-4: split the sentence into two balanced English parts, with matching Chinese explanations or translations.",
    "3. grammar requirements:",
    "   - tense must be exactly: 全句使用**[时态名称]**（[具体动词形式]），用于描述[该时态的功能和作用]。",
    "   - voice must be exactly: **[主动语态/被动语态]**（[具体动词示例]）。",
    "   - structure must begin with several '-' analysis lines.",
    "   - the final line of structure must be a bold complete structure summary, like **形式主语（It） + 谓语（happened） + 主语从句（that ...） + 并列谓语部分（...） + 定语从句（which ...） + 原因状语从句（for ...）**.",
    "4. vocabulary: select 6 important words or difficult items from the sentence. Every item must include partOfSpeech, one complete English example sentence, and the Chinese translation of that example sentence.",
    "5. ielts: provide separate listening, speaking, reading, and writing advice paragraphs.",
    "6. Keep every required field non-empty. Do not use placeholders like N/A, null, or empty strings.",
  ];

  if (input.currentTextContent) {
    base.push("", "Current editor draft for style reference only:");
    base.push(JSON.stringify(stripVocabularyIds(input.currentTextContent), null, 2));
  }

  return base.join("\n");
}

function buildCompactSystemPrompt(mode: TextAnalysisMode) {
  const rules = [
    "Return valid JSON only and match the requested schema exactly.",
    `Return only this JSON shape: ${getModeOutputShape(mode)}`,
    "Do not include markdown code fences, comments, or any unrelated top-level keys.",
    "Use Simplified Chinese for explanations. Keep original English text and vocabulary example sentences in English.",
    "Never leave required fields empty.",
    "translation: natural teaching-friendly Chinese.",
    "segmentation: prompt1/prompt3 are English halves; prompt2/prompt4 are the matching Chinese explanations.",
    "grammar.tense format must be exactly: 全句使用**[时态名称]**（[具体动词形式]），用于描述[该时态的功能和作用]。",
    "grammar.voice format must be exactly: **[主动语态/被动语态]**（[具体动词示例]）。",
    "grammar.structure: several '-' analysis lines, and the final line must be one bold complete structure summary.",
    "vocabulary: exactly 6 items; every item must include word, phonetic, partOfSpeech, meaning, example, translation.",
    "ielts: four separate natural paragraphs.",
    "ielts.listening style: Start with '在听力考试中，这类包含...的句子是...的典型难点。' Then explain what test-takers should pay attention to (connectors, clause markers, rare words). Finally give specific listening strategy with '建议采用...的听力策略'. Quote exact words from the sentence.",
    "ielts.speaking style: Start with '这个句式在口语表达中可以用于描述...' Then show the frame/pattern to imitate with '考生可以模仿...' Finally give practical suggestion with '在Part 2...时，这种...' or similar.",
    "ielts.reading style: Start with '阅读此类...长难句时，应首先识别主干（...）' Then explain clause splitting with '然后利用...将长句拆解为...' Finally state the core meaning with '关键是理解...' or '抓住...这些核心词汇，就能快速把握...'.",
    "ielts.writing style: Start with '这个句式可以用于写作...中描述...' Then mention grammar/connector borrowing with '通过使用...的结构，可以在...' Finally explain the effect with '模仿其用...的方法，能够有效提升...'.",
    "IELTS advice must be sentence-specific, concrete, and may quote exact connectors, verb chains, clause markers, or notable words from the sentence.",
  ];

  if (mode === "segmentation") {
    rules.push("Only output prompt1, prompt2, prompt3, prompt4.");
  } else if (mode !== "all") {
    rules.push(`Only output the field group for ${mode}.`);
  }

  return rules.join("\n");
}

function buildCompactUserPrompt(input: TextAnalysisRequest) {
  const base = [
    `Mode: ${input.mode}`,
    `Sentence: ${input.sentence.trim()}`,
    `Book: ${input.bookName.trim()}`,
    `Author: ${input.author.trim()}`,
    "",
    "Generate the requested analysis fields for this exact sentence.",
    "Be concrete, sentence-specific, and concise.",
    `Required JSON shape: ${getModeOutputShape(input.mode)}`,
    "Do not output any field outside this shape.",
  ];

  if (input.currentTextContent) {
    base.push("", "Current draft for reference:");
    base.push(JSON.stringify(stripVocabularyIds(input.currentTextContent), null, 2));
  }

  return base.join("\n");
}

function stripVocabularyIds(textContent: TextAnalysisContent) {
  return {
    ...textContent,
    vocabulary: textContent.vocabulary.map(({ id: _id, ...item }) => item),
  };
}

function mergeAndNormalizeResult(input: TextAnalysisRequest, raw: unknown): TextAnalysisContent {
  const current = input.currentTextContent ?? createEmptyTextContent();
  const candidate = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  if (input.mode === "all") {
    return normalizeTextContent(candidate, current, input);
  }

  switch (input.mode) {
    case "segmentation":
      return normalizeTextContent(
        {
          ...current,
          prompt1: candidate.prompt1,
          prompt2: candidate.prompt2,
          prompt3: candidate.prompt3,
          prompt4: candidate.prompt4,
        },
        current,
        input,
      );
    case "translation":
      return normalizeTextContent(
        {
          ...current,
          translation: candidate.translation,
        },
        current,
        input,
      );
    case "grammar":
      return normalizeTextContent(
        {
          ...current,
          grammar: candidate.grammar,
        },
        current,
        input,
      );
    case "vocabulary":
      return normalizeTextContent(
        {
          ...current,
          vocabulary: candidate.vocabulary,
        },
        current,
        input,
      );
    case "ielts":
      return normalizeTextContent(
        {
          ...current,
          ielts: candidate.ielts,
        },
        current,
        input,
      );
    default:
      return normalizeTextContent(candidate, current, input);
  }
}

function normalizeTextContent(
  raw: Record<string, unknown>,
  fallback: TextAnalysisContent,
  input: Pick<TextAnalysisRequest, "sentence" | "bookName" | "author">,
): TextAnalysisContent {
  const grammarRaw = asRecord(raw.grammar);
  const ieltsRaw = asRecord(raw.ielts);
  const vocabularyRaw = Array.isArray(raw.vocabulary) ? raw.vocabulary : fallback.vocabulary;
  const fallbackIelts = buildExampleStyleFallbackIeltsTips(input.sentence, input.bookName);

  return {
    translation: asTrimmedString(raw.translation, fallback.translation),
    prompt1: asTrimmedString(raw.prompt1, fallback.prompt1),
    prompt2: asTrimmedString(raw.prompt2, fallback.prompt2),
    prompt3: asTrimmedString(raw.prompt3, fallback.prompt3),
    prompt4: asTrimmedString(raw.prompt4, fallback.prompt4),
    grammar: {
      tense: asTrimmedString(grammarRaw.tense, fallback.grammar.tense),
      voice: asTrimmedString(grammarRaw.voice, fallback.grammar.voice),
      structure: asTrimmedString(grammarRaw.structure, fallback.grammar.structure),
    },
    vocabulary: normalizeVocabulary(vocabularyRaw, fallback.vocabulary, input),
    ielts: {
      listening: pickRecordString(ieltsRaw, ["listening", "listeningTip", "听力建议"], fallback.ielts.listening || fallbackIelts.listening),
      speaking: pickRecordString(ieltsRaw, ["speaking", "speakingTip", "口语建议"], fallback.ielts.speaking || fallbackIelts.speaking),
      reading: pickRecordString(ieltsRaw, ["reading", "readingTip", "阅读建议"], fallback.ielts.reading || fallbackIelts.reading),
      writing: pickRecordString(ieltsRaw, ["writing", "writingTip", "写作建议"], fallback.ielts.writing || fallbackIelts.writing),
    },
  };
}

function normalizeVocabulary(
  raw: unknown,
  fallback: TextAnalysisContent["vocabulary"],
  input: Pick<TextAnalysisRequest, "sentence" | "bookName" | "author">,
) {
  const source = Array.isArray(raw) ? raw : fallback;
  const normalized = source.slice(0, 6).map((item, index) => {
    const record = asRecord(item);
    const fallbackItem = fallback[index] ?? createEmptyVocabularyCard(index);
    const word = pickRecordString(
      record,
      ["word", "lemma", "headword", "baseForm", "term", "单词原形", "单词", "词汇"],
      fallbackItem.word,
    );
    const phonetic = pickRecordString(record, ["phonetic", "ipa", "pronunciation", "音标"], fallbackItem.phonetic);
    const partOfSpeech =
      pickRecordString(
        record,
        ["partOfSpeech", "part_of_speech", "pos", "wordClass", "词性", "词类"],
        fallbackItem.partOfSpeech,
      ) || inferVocabularyPartOfSpeech(word);
    const meaning =
      pickRecordString(
        record,
        ["meaning", "definition", "gloss", "中文释义", "释义", "中文含义", "含义"],
        fallbackItem.meaning,
      ) || buildVocabularyMeaning(word, input.bookName);
    const example =
      pickRecordString(
        record,
        ["example", "exampleSentence", "example_sentence", "sentence", "英文例句", "例句"],
        fallbackItem.example,
      ) || buildVocabularyExample(word, input.sentence);
    const translation =
      pickRecordString(
        record,
        [
          "translation",
          "exampleTranslation",
          "example_translation",
          "translationZh",
          "chineseTranslation",
          "中文译文",
          "例句翻译",
          "中文例句翻译",
        ],
        fallbackItem.translation,
      ) || buildVocabularyExampleTranslation(word);

    return {
      id: asTrimmedString(record.id, fallbackItem.id) || `vocab-${index + 1}-${randomUUID()}`,
      word,
      phonetic: phonetic || buildVocabularyPhonetic(word),
      partOfSpeech,
      meaning,
      example,
      translation,
    };
  });

  while (normalized.length < 6) {
    normalized.push(createEmptyVocabularyCard(normalized.length));
  }

  return normalized;
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

function extractTextFromOpenAIResponse(payload: unknown) {
  const record = asRecord(payload);
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = choices[0] ? asRecord(choices[0]) : {};
  const message = asRecord(firstChoice.message);
  const text = typeof message.content === "string" ? message.content.trim() : "";

  if (!text) {
    throw new Error("OpenAI 兼容接口返回内容为空。");
  }

  return text;
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

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseModelJsonContent(text: string, mode: TextAnalysisMode) {
  const direct = safeJsonParse(extractJsonBlock(text));
  if (direct) {
    return direct;
  }

  return salvageModeResult(text, mode);
}

function salvageModeResult(text: string, mode: TextAnalysisMode) {
  if (mode === "all") {
    return null;
  }

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
    case "grammar":
    case "ielts": {
      const block = extractBalancedJsonField(text, mode);
      return block ? safeJsonParse(`{"${mode}":${block}}`) : null;
    }
    case "vocabulary": {
      const block = extractBalancedJsonField(text, "vocabulary");
      return block ? safeJsonParse(`{"vocabulary":${block}}`) : null;
    }
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asTrimmedString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function pickRecordString(record: Record<string, unknown>, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = asTrimmedString(record[key]);
    if (value) {
      return value;
    }
  }

  return fallback;
}

function inferVocabularyPartOfSpeech(word: string) {
  const normalized = word.toLowerCase();
  if (!normalized) return "";
  if (normalized.endsWith("ly")) return "adv.";
  if (normalized.endsWith("ing") || normalized.endsWith("ed")) return "v.";
  if (normalized.endsWith("tion") || normalized.endsWith("sion") || normalized.endsWith("ment") || normalized.endsWith("ness")) {
    return "n.";
  }
  if (normalized.endsWith("ous") || normalized.endsWith("ful") || normalized.endsWith("ive") || normalized.endsWith("al")) {
    return "adj.";
  }

  return "n./adj.";
}

function buildVocabularyPhonetic(word: string) {
  return word ? `/${word}/` : "";
}

function buildVocabularyMeaning(word: string, bookName: string) {
  if (!word) {
    return "";
  }

  return `结合《${bookName}》的语境，"${word}" 承担关键语义或语气提示作用。`;
}

function buildVocabularyExample(word: string, _sentence?: string) {
  if (!word) {
    return "";
  }

  return `In a new example, "${word}" carries a meaning similar to the one in the original sentence.`;
}

function buildVocabularyExampleTranslation(word: string) {
  if (!word) {
    return "";
  }

  return `在这个句子中，"${word}" 帮助承载作者想表达的核心含义。`;
}

function extractSentenceMatches(sentence: string, pattern: RegExp, limit = 4) {
  const matches = sentence.match(pattern) ?? [];
  return Array.from(new Set(matches.map((item) => item.trim()))).slice(0, limit);
}

function joinSentenceMatches(values: string[], fallback: string) {
  return values.length ? values.join("、") : fallback;
}

function buildFallbackIeltsTips(sentence: string, bookName: string) {
  const markers = extractSentenceMatches(sentence, /\b(and|or|but|that|which|who|whom|because|for|therefore|as well as|either|neither|not only)\b/gi);
  const actions = extractSentenceMatches(
    sentence,
    /\b(?:has|have|had|is|are|am|was|were|do|does|did|must|should|would|could|can|will|shall|may|might)\s+[A-Za-z][A-Za-z'-]*(?:ed|en|ing)?\b/gi,
  );
  const keywords = extractSentenceMatches(sentence, /\b[A-Za-z][A-Za-z'-]{4,}\b/g, 5);
  const coreClause = sentence.replace(/\s+/g, " ").trim().split(/,\s*|\band\b/)[0]?.trim() || sentence.trim();
  const markerText = joinSentenceMatches(markers, "and、that、which 等逻辑信号");
  const actionText = joinSentenceMatches(actions, "核心动作链");
  const keywordText = joinSentenceMatches(keywords, "关键信息词");

  return {
    listening: `在听力考试中，这类长句的难点通常在于信息层级多、动作链长，而且逻辑连接词不会单独停顿。考生需要重点捕捉 ${markerText} 这类信号词，快速判断并列、因果或补充说明关系，再把 ${actionText} 记录成简短笔记框架。像 ${keywordText} 这类词汇如果不够熟，也要结合上下文先判断其角色和大意，这样更容易稳住整句理解。`,
    speaking: `这个句式在口语中适合用于讲述一次准备充分的经历、说明事件如何一步步推进，或描述带有背景铺垫的个人故事。考生可以模仿原句先交代核心事件，再用并列动作和补充信息把细节展开，例如围绕 ${actionText} 这样的动作链去组织答案。放在经历类、计划类或叙事类话题中，这种表达会让内容更有条理，也更容易体现语言层次。`,
    reading: `阅读这类长难句时，应先锁定主干 "${coreClause}"，明确句子的核心事件或判断，再顺着 ${markerText} 逐层拆分后续并列成分、修饰语和从句。对于 ${keywordText} 这类关键词，不必一开始逐个死抠，而应先判断它们在句中承担的是人物、动作、目的还是补充说明。这样分层处理，能更快把握整句在《${bookName}》语境中的核心信息。`,
    writing: `这个句式在写作中适合用于描述一系列相互关联的准备动作、交代事件背景，或在论述中展示清晰的层次推进。可以借鉴它先立主干、再补并列动作和修饰信息的写法，并通过 ${markerText} 这类连接手段把逻辑关系表达得更清楚。如果在议论文、流程描述或经历叙述中有意识地使用这种结构，文章会显得更严谨，也更能体现复杂句控制能力。`,
  };
}

function formatQuotedMatches(values: string[], fallback: string) {
  return values.length ? values.map((value) => `“${value}”`).join("、") : fallback;
}

function detectSentenceShape(sentence: string, actions: string[], markers: string[]) {
  const features: string[] = [];
  if (actions.length >= 3) {
    features.push("长串并列动作");
  } else if (actions.length >= 2) {
    features.push("连续动作链");
  }
  if (/\b(which|who|whom|that|when|where)\b/i.test(sentence)) {
    features.push("多个从句");
  }
  if (/\bfor\b/i.test(sentence)) {
    features.push("目的或原因成分");
  }
  if (/\bwith\b/i.test(sentence)) {
    features.push("伴随状态描述");
  }
  if (/;/.test(sentence)) {
    features.push("分号连接的多个意群");
  }
  if (!features.length && markers.length) {
    features.push("多重逻辑连接");
  }

  return features.length ? features.join("和") : "信息层级复杂";
}

function detectSpeakingFrame(sentence: string) {
  const normalized = sentence.replace(/\s+/g, " ").trim();
  const happenedMatch = normalized.match(/\bIt happened that\b/i);
  if (happenedMatch) {
    return "“It happened that ...”";
  }

  const withMatch = normalized.match(/\bwith\s+[^,;]+/i);
  if (withMatch) {
    return `“${withMatch[0]}”`;
  }

  const whenMatch = normalized.match(/\b[^,;]{0,30}\bwhen\b[^,;]{0,30}/i);
  if (whenMatch) {
    return `“${whenMatch[0].trim()}”`;
  }

  const opener = normalized.split(/[,;]+/)[0]?.trim();
  return opener ? `“${opener.slice(0, 48)}${opener.length > 48 ? "..." : ""}”` : "原句的开头框架";
}

function detectWritingBorrowPoint(sentence: string) {
  if (/\bwith\s+[A-Za-z][A-Za-z'-]*\s+[A-Za-z][A-Za-z'-]*ed\b/i.test(sentence)) {
    return "with + 宾语 + 补足语";
  }
  if (/;/.test(sentence)) {
    return "分号连接相关意群";
  }
  if (/\b(?:has|have|had)\s+[A-Za-z][A-Za-z'-]*(?:ed|en)\b/i.test(sentence)) {
    return "完成时态表达时间先后";
  }
  return "主干先行、细节递进的复杂句结构";
}

function buildExampleStyleFallbackIeltsTips(sentence: string, bookName: string) {
  const markers = extractSentenceMatches(
    sentence,
    /\b(and|or|but|that|which|who|whom|because|for|therefore|as well as|either|neither|not only|when|with)\b/gi,
    5,
  );
  const actions = extractSentenceMatches(
    sentence,
    /\b(?:has|have|had|is|are|am|was|were|do|does|did|must|should|would|could|can|will|shall|may|might)\s+[A-Za-z][A-Za-z'-]*(?:ed|en|ing)?\b/gi,
    5,
  );
  const keywords = extractSentenceMatches(sentence, /\b[A-Za-z][A-Za-z'-]{4,}\b/g, 5);
  const coreClause = sentence.replace(/\s+/g, " ").trim().split(/,\s*|\band\b/i)[0]?.trim() || sentence.trim();
  const sentenceShape = detectSentenceShape(sentence, actions, markers);
  const markerText = formatQuotedMatches(markers, "“and”、“that”、“which”等逻辑连接词");
  const actionText = formatQuotedMatches(actions, "关键动作链");
  const keywordText = formatQuotedMatches(keywords, "关键信息词");
  const speakingFrame = detectSpeakingFrame(sentence);
  const writingBorrowPoint = detectWritingBorrowPoint(sentence);

  return {
    listening: `在听力考试中，这类包含${sentenceShape}的句子是Section 3或4学术对话或独白的典型难点。考生需要注意${markerText}等连词构建的逻辑关系，以及${keywordText}等关键信息。建议采用预判关键词（如${actionText}）和梳理事件链条的听力策略，忽略个别生僻词，把握整体叙事流。`,
    speaking: `这个句式在口语表达中可以用于描述${sentenceShape.includes("多从句") || sentenceShape.includes("插入语") ? "个人经历中一段复杂的、有多步骤和转折的事件" : "一段包含多个动作或细节的事件"}。考生可以模仿"${speakingFrame}"的框架，来清晰、有条理地讲述故事。在Part 2描述事件类话题时，这种能体现时间顺序和细节的句式非常实用，能有效展示语言组织能力。`,
    reading: `阅读此类${sentenceShape}的长难句时，应首先识别主干（${coreClause}），然后利用${markerText}将长句拆解为几个逻辑部分。关键是理解这些从句和修饰成分的关系，这样便可以快速准确地理解句意，避免在细节中迷失。`,
    writing: `这个句式可以用于写作Task 2举例论证中描述过程。通过使用${writingBorrowPoint}的结构，可以在主句之外高效地补充细节状态。模仿其用${markerText}引入转折事件的方法，能够有效提升文章句式的多样性和逻辑层次感，建议在需要叙述事件发展或描述多步骤过程的文章中使用。`,
  };
}

function getRetryDelayMs(payload: unknown, attempt: number) {
  const message = asRecord(asRecord(payload).error).message;
  if (typeof message === "string") {
    const match = message.match(/after\s+(\d+)\s+seconds?/i);
    if (match?.[1]) {
      // Add 1 second buffer to the requested wait time
      return Number(match[1]) * 1000 + 1000;
    }
  }

  // Exponential backoff: 2s, 4s, 8s, 16s, 32s
  return Math.min(2000 * Math.pow(2, attempt - 1), 32000);
}

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "未知错误";
  return humanizeExternalErrorMessage(message);
}

function humanizeExternalErrorMessage(message: string) {
  if (/engine is currently overloaded|engine_overloaded_error|overloaded/i.test(message)) {
    return "LLM 接口当前负载过高，请稍后重试。";
  }

  if (/fetch failed|socketerror|other side closed|econnreset|und_err_socket/i.test(message)) {
    return "LLM 接口连接失败，远端可能提前断开了连接，请稍后重试。";
  }

  return humanizeErrorMessage(message);
}

function resolvePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function joinErrorMessages(messages: string[]) {
  const seen = new Set<string>();
  const normalized = messages
    .map((message) => message.trim())
    .filter(Boolean)
    .filter((message) => {
      if (seen.has(message)) {
        return false;
      }

      seen.add(message);
      return true;
    });

  return normalized.join("；");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanizeErrorMessage(message: string) {
  if (/rate limit/i.test(message)) {
    return "当前 LLM 账户正在限流，请稍后重试。";
  }

  if (/operation was aborted|request aborted|aborted by user/i.test(message)) {
    return "LLM 接口请求超时，请稍后重试，或调大超时配置。";
  }

  return message;
}
