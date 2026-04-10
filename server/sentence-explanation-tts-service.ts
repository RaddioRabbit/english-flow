import type {
  SentenceExplanationTtsAudioContent,
  SentenceExplanationTtsLanguage,
  SentenceExplanationTtsPreviewRequest,
  SentenceExplanationTtsPreviewResponse,
  SentenceExplanationTtsRequest,
  SentenceExplanationTtsResponse,
  SentenceExplanationTtsSection,
  SentenceExplanationTtsVoice,
} from "../src/lib/sentence-explanation-tts-contract";
import {
  DEFAULT_TTS_MODEL,
  getSentenceExplanationTtsLanguageOption,
  resolveSentenceExplanationTtsVoice,
} from "../src/lib/sentence-explanation-tts-options";
import type { SentenceExplanationArticle } from "../src/lib/sentence-explanation-contract";
import {
  joinSentenceExplanationLines,
  normalizeSentenceExplanationLines,
  sentenceExplanationModuleLabels,
} from "../src/lib/sentence-explanation-contract";
import type { ModuleId } from "../src/lib/task-store";

type RuntimeSkillResult = SentenceExplanationTtsResponse;
type RuntimePreviewSkillResult = SentenceExplanationTtsPreviewResponse;

const MODULE_LABELS: Record<ModuleId, string> = {
  translation: sentenceExplanationModuleLabels.translation,
  grammar: sentenceExplanationModuleLabels.grammar,
  summary: sentenceExplanationModuleLabels.summary,
  vocabulary: sentenceExplanationModuleLabels.vocabulary,
  ielts: sentenceExplanationModuleLabels.ielts,
};

function asModuleId(value: unknown): ModuleId | null {
  return typeof value === "string" &&
    ["translation", "grammar", "summary", "vocabulary", "ielts"].includes(value)
    ? (value as ModuleId)
    : null;
}

function resolveLanguage(language?: SentenceExplanationTtsLanguage) {
  return getSentenceExplanationTtsLanguageOption(language).value;
}

function resolveVoice(language: SentenceExplanationTtsLanguage | undefined, voice: SentenceExplanationTtsVoice | undefined) {
  return resolveSentenceExplanationTtsVoice(resolveLanguage(language), voice);
}

function normalizeAudioContent(
  content: Partial<SentenceExplanationTtsAudioContent> | undefined,
  fallbackText: string,
  fallbackLines: string[],
): SentenceExplanationTtsAudioContent {
  let lineAudios = Array.isArray(content?.lineAudios)
    ? content!.lineAudios!.map((lineAudio, lineIndex) => ({
        ...lineAudio,
        lineIndex: typeof lineAudio.lineIndex === "number" ? lineAudio.lineIndex : lineIndex,
        text: lineAudio.text || fallbackLines[lineIndex] || "",
        audioDataUrl: lineAudio.audioDataUrl ?? null,
      }))
    : [];
  const text = content?.text || fallbackText;

  if (!lineAudios.length && fallbackLines.length === 1) {
    lineAudios = [
      {
        lineIndex: 0,
        text: fallbackLines[0] || text,
        audioDataUrl: content?.audioDataUrl ?? null,
        assetId: content?.assetId,
        fileName: content?.fileName,
        mimeType: content?.mimeType,
        publicUrl: content?.publicUrl,
        durationSeconds: content?.durationSeconds,
      },
    ];
  }

  return {
    text,
    audioDataUrl: content?.audioDataUrl ?? null,
    assetId: content?.assetId,
    fileName: content?.fileName,
    mimeType: content?.mimeType,
    publicUrl: content?.publicUrl,
    durationSeconds: content?.durationSeconds,
    lineAudios,
  };
}

function countResolvedAudioSegments(content: SentenceExplanationTtsAudioContent) {
  if (content.lineAudios?.length) {
    return content.lineAudios.filter((lineAudio) => Boolean(lineAudio.audioDataUrl || lineAudio.publicUrl)).length;
  }

  return content.audioDataUrl || content.publicUrl ? 1 : 0;
}

function normalizeSection(
  section: SentenceExplanationArticle["sections"][number],
  resultSections: SentenceExplanationTtsSection[],
) {
  if (!section) {
    throw new Error("Sentence explanation article contains an invalid section.");
  }

  const moduleId = asModuleId(section.moduleId) ?? asModuleId(section.imageRef);
  if (!moduleId) {
    throw new Error("Sentence explanation article contains an invalid module id.");
  }

  const matched =
    resultSections.find((item) => item.moduleId === moduleId || item.imageRef === moduleId) ?? null;
  const lines = normalizeSentenceExplanationLines(section.lines, section.content);

  return {
    moduleId,
    moduleName: matched?.moduleName || section.moduleName || MODULE_LABELS[moduleId] || moduleId,
    imageRef: moduleId,
    content: normalizeAudioContent(matched?.content, joinSentenceExplanationLines(lines), lines),
  } satisfies SentenceExplanationTtsSection;
}

function normalizeResponse(
  input: SentenceExplanationTtsRequest,
  article: SentenceExplanationArticle,
  result: RuntimeSkillResult,
): SentenceExplanationTtsResponse {
  const safeResult = (result || {}) as RuntimeSkillResult;
  const resultSections = Array.isArray(safeResult.sections) ? safeResult.sections : [];
  const sections = article.sections.map((section) => normalizeSection(section, resultSections));
  const language = safeResult.metadata?.language || resolveLanguage(input.language);
  const voice = safeResult.metadata?.voice || resolveVoice(language, input.voice);
  const speed =
    typeof safeResult.metadata?.speed === "number"
      ? safeResult.metadata.speed
      : typeof input.speed === "number"
        ? input.speed
        : 1;
  const model = safeResult.metadata?.model || safeResult.model || input.model || DEFAULT_TTS_MODEL;
  const introductionLines = normalizeSentenceExplanationLines(article.introductionLines, article.introduction);
  const conclusionLines = normalizeSentenceExplanationLines(article.conclusionLines, article.conclusion);
  const introduction = normalizeAudioContent(
    safeResult.introduction,
    joinSentenceExplanationLines(introductionLines),
    introductionLines,
  );
  const conclusion = normalizeAudioContent(
    safeResult.conclusion,
    joinSentenceExplanationLines(conclusionLines),
    conclusionLines,
  );
  const totalSegments =
    introductionLines.length +
    article.sections.reduce(
      (total, section) => total + normalizeSentenceExplanationLines(section.lines, section.content).length,
      0,
    ) +
    conclusionLines.length;
  const successfulSegments =
    countResolvedAudioSegments(introduction) +
    sections.reduce((total, section) => total + countResolvedAudioSegments(section.content), 0) +
    countResolvedAudioSegments(conclusion);

  return {
    title: safeResult.title || article.title || "Sentence explanation audio",
    welcomeMessage: safeResult.welcomeMessage || article.welcomeMessage || "",
    introduction,
    sections,
    conclusion,
    metadata: {
      language,
      voice,
      speed,
      model,
      generatedAt: safeResult.metadata?.generatedAt || new Date().toISOString(),
      totalSegments,
      successfulSegments,
    },
    source: safeResult.source || "minimax-api",
    model,
  };
}

function validateInput(input: SentenceExplanationTtsRequest) {
  if (!input.taskId?.trim()) {
    throw new Error("Missing task id. Cannot generate sentence explanation audio.");
  }

  const article = input.article;
  if (!article) {
    throw new Error("Missing sentence explanation article. Cannot generate sentence explanation audio.");
  }

  if (!article.sections?.length) {
    throw new Error("Sentence explanation article is missing sections.");
  }

  const missingSections = article.sections.filter(
    (section) => !normalizeSentenceExplanationLines(section.lines, section.content).length,
  );
  if (missingSections.length) {
    throw new Error("Sentence explanation article contains an empty section.");
  }
}

function validatePreviewInput(input: SentenceExplanationTtsPreviewRequest) {
  if (!input.language?.trim()) {
    throw new Error("Missing preview language.");
  }
}

function normalizePreviewResponse(
  input: SentenceExplanationTtsPreviewRequest,
  result: RuntimePreviewSkillResult,
): SentenceExplanationTtsPreviewResponse {
  const safeResult = (result || {}) as RuntimePreviewSkillResult;
  const language = safeResult.language || resolveLanguage(input.language);
  const voice = safeResult.voice || resolveVoice(language, input.voice);
  const speed =
    typeof safeResult.speed === "number" ? safeResult.speed : typeof input.speed === "number" ? input.speed : 1;
  const model = safeResult.model || input.model || DEFAULT_TTS_MODEL;

  return {
    language,
    voice,
    speed,
    model,
    generatedAt: safeResult.generatedAt || new Date().toISOString(),
    text: safeResult.text || getSentenceExplanationTtsLanguageOption(language).previewText,
    audioDataUrl: safeResult.audioDataUrl ?? null,
    source: safeResult.source || "minimax-api",
  };
}

export async function generateSentenceExplanationTts(
  input: SentenceExplanationTtsRequest,
): Promise<SentenceExplanationTtsResponse> {
  validateInput(input);

  const runtime = globalThis as typeof globalThis & {
    skill?: (name: string, params: unknown) => Promise<unknown>;
  };

  if (!runtime.skill) {
    throw new Error("Sentence explanation TTS skill is not installed.");
  }

  const result = (await runtime.skill("sentence-explanation-tts", input)) as RuntimeSkillResult;
  const normalized = normalizeResponse(input, input.article, result);

  if (normalized.metadata.successfulSegments < normalized.metadata.totalSegments) {
    throw new Error(
      `文本转语音未完整生成，成功 ${normalized.metadata.successfulSegments}/${normalized.metadata.totalSegments} 句。为保证图片、文本、语音一一对应，本次结果未保存，请重试。`,
    );
  }

  return normalized;
}

export async function previewSentenceExplanationTts(
  input: SentenceExplanationTtsPreviewRequest,
): Promise<SentenceExplanationTtsPreviewResponse> {
  validatePreviewInput(input);

  const runtime = globalThis as typeof globalThis & {
    skill?: (name: string, params: unknown) => Promise<unknown>;
  };

  if (!runtime.skill) {
    throw new Error("Sentence explanation TTS skill is not installed.");
  }

  const result = (await runtime.skill("sentence-explanation-tts-preview", input)) as RuntimePreviewSkillResult;
  return normalizePreviewResponse(input, result);
}
