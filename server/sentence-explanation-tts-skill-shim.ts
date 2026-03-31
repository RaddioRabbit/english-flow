import type {
  SentenceExplanationTtsAudioContent,
  SentenceExplanationTtsLanguage,
  SentenceExplanationTtsLineAudio,
  SentenceExplanationTtsMetadata,
  SentenceExplanationTtsPreviewRequest,
  SentenceExplanationTtsPreviewResponse,
  SentenceExplanationTtsRequest,
  SentenceExplanationTtsResponse,
  SentenceExplanationTtsSection,
  SentenceExplanationTtsVoice,
} from "../src/lib/sentence-explanation-tts-contract";
import {
  getSentenceExplanationTtsLanguageBoost,
  getSentenceExplanationTtsLanguageOption,
  resolveSentenceExplanationTtsVoice,
} from "../src/lib/sentence-explanation-tts-options";
import {
  joinSentenceExplanationLines,
  normalizeSentenceExplanationLines,
  sentenceExplanationModuleLabels,
} from "../src/lib/sentence-explanation-contract";
import type { ModuleId } from "../src/lib/task-store";
import { registerRuntimeSkill } from "./runtime-skill-registry";

interface SentenceExplanationTtsEnv {
  MINIMAX_API_KEY?: string;
  MINIMAX_BASE_URL?: string;
  SENTENCE_EXPLANATION_TTS_TIMEOUT_MS?: string;
  SENTENCE_EXPLANATION_TTS_MAX_RETRIES?: string;
  SENTENCE_EXPLANATION_TTS_SEGMENT_RETRY_PASSES?: string;
  SENTENCE_EXPLANATION_TTS_CONCURRENCY?: string;
  SENTENCE_EXPLANATION_TTS_RATE_LIMIT_RETRIES?: string;
  SENTENCE_EXPLANATION_TTS_RATE_LIMIT_COOLDOWN_MS?: string;
}

interface MiniMaxSpeechResponse {
  data?: {
    audio?: string;
    status?: number;
  };
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
}

type SegmentOwner = ModuleId | "introduction" | "conclusion";

type TtsSegment = {
  key: string;
  owner: SegmentOwner;
  moduleName: string;
  text: string;
  lineIndex: number;
};

interface ResolvedTtsRuntimeConfig {
  requestTimeoutMs: number;
  maxRetries: number;
  segmentRetryPasses: number;
  concurrency: number;
  rateLimitRetries: number;
  rateLimitCooldownMs: number;
}

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_SEGMENT_RETRY_PASSES = 1;
const DEFAULT_CONCURRENCY = 6;
const DEFAULT_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 65_000;
const MIN_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 180_000;
const MAX_CONCURRENCY = 12;
const MIN_RATE_LIMIT_COOLDOWN_MS = 1_000;
const MAX_RATE_LIMIT_COOLDOWN_MS = 300_000;
const DEFAULT_TTS_MODEL = "speech-2.8-hd";
const DEFAULT_TTS_VOICE = getSentenceExplanationTtsLanguageOption("zh").defaultVoice;
const DEFAULT_TTS_SPEED = 1;
const DEFAULT_TTS_ENDPOINTS = [
  "https://api.minimaxi.com/v1/t2a_v2",
  "https://api-bj.minimaxi.com/v1/t2a_v2",
];
const MAX_TTS_TEXT_LENGTH = 10_000;
const LONG_FORM_TTS_SEGMENT_THRESHOLD = 60;
const LONG_FORM_MIN_CONCURRENCY = 2;

const MODULE_LABELS: Record<ModuleId, string> = {
  translation: sentenceExplanationModuleLabels.translation,
  grammar: sentenceExplanationModuleLabels.grammar,
  summary: sentenceExplanationModuleLabels.summary,
  vocabulary: sentenceExplanationModuleLabels.vocabulary,
  ielts: sentenceExplanationModuleLabels.ielts,
};

let shimInstalled = false;

class SentenceExplanationTtsRateLimitError extends Error {
  retryAfterMs: number | null;

  constructor(message: string, retryAfterMs?: number | null) {
    super(message);
    this.name = "SentenceExplanationTtsRateLimitError";
    this.retryAfterMs = retryAfterMs ?? null;
  }
}

interface TtsRateLimitState {
  cooldownUntil: number;
}

function resolveSpeed(raw: number | undefined) {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_TTS_SPEED;
  }

  return Math.min(2, Math.max(0.5, raw));
}

function resolveLanguage(raw: SentenceExplanationTtsLanguage | undefined) {
  return getSentenceExplanationTtsLanguageOption(raw).value;
}

function resolveVoice(
  language: SentenceExplanationTtsLanguage,
  raw: SentenceExplanationTtsRequest["voice"] | SentenceExplanationTtsPreviewRequest["voice"],
) {
  return resolveSentenceExplanationTtsVoice(language, raw) || DEFAULT_TTS_VOICE;
}

function ensureAudioConfig(env: SentenceExplanationTtsEnv) {
  if (!env.MINIMAX_API_KEY?.trim()) {
    throw new Error("Missing MINIMAX_API_KEY for sentence explanation TTS.");
  }
}

function resolvePositiveInteger(
  raw: string | undefined,
  fallback: number,
  options: { min?: number; max?: number } = {},
) {
  const parsed = Number.parseInt(raw?.trim() || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  const min = options.min ?? 1;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  return Math.max(min, Math.min(max, parsed));
}

function resolveRuntimeConfig(env: SentenceExplanationTtsEnv): ResolvedTtsRuntimeConfig {
  return {
    requestTimeoutMs: resolvePositiveInteger(env.SENTENCE_EXPLANATION_TTS_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, {
      min: MIN_TIMEOUT_MS,
      max: MAX_TIMEOUT_MS,
    }),
    maxRetries: resolvePositiveInteger(env.SENTENCE_EXPLANATION_TTS_MAX_RETRIES, DEFAULT_MAX_RETRIES, {
      min: 1,
      max: 3,
    }),
    segmentRetryPasses: resolvePositiveInteger(
      env.SENTENCE_EXPLANATION_TTS_SEGMENT_RETRY_PASSES,
      DEFAULT_SEGMENT_RETRY_PASSES,
      {
        min: 1,
        max: 3,
      },
    ),
    concurrency: resolvePositiveInteger(env.SENTENCE_EXPLANATION_TTS_CONCURRENCY, DEFAULT_CONCURRENCY, {
      min: 1,
      max: MAX_CONCURRENCY,
    }),
    rateLimitRetries: resolvePositiveInteger(
      env.SENTENCE_EXPLANATION_TTS_RATE_LIMIT_RETRIES,
      DEFAULT_RATE_LIMIT_RETRIES,
      {
        min: 1,
        max: 10,
      },
    ),
    rateLimitCooldownMs: resolvePositiveInteger(
      env.SENTENCE_EXPLANATION_TTS_RATE_LIMIT_COOLDOWN_MS,
      DEFAULT_RATE_LIMIT_COOLDOWN_MS,
      {
        min: MIN_RATE_LIMIT_COOLDOWN_MS,
        max: MAX_RATE_LIMIT_COOLDOWN_MS,
      },
    ),
  };
}

function resolveEffectiveConcurrency(config: ResolvedTtsRuntimeConfig, segmentCount: number) {
  if (segmentCount < LONG_FORM_TTS_SEGMENT_THRESHOLD) {
    return config.concurrency;
  }

  return Math.max(config.concurrency, LONG_FORM_MIN_CONCURRENCY);
}

function getRequestEndpoints(env: SentenceExplanationTtsEnv) {
  const customEndpoint = env.MINIMAX_BASE_URL?.trim();
  const endpoints = customEndpoint ? [customEndpoint, ...DEFAULT_TTS_ENDPOINTS] : DEFAULT_TTS_ENDPOINTS;

  return Array.from(new Set(endpoints));
}

function buildSegmentKey(owner: SegmentOwner, lineIndex: number) {
  return `${owner}:${lineIndex}`;
}

function buildSegments(input: SentenceExplanationTtsRequest) {
  const segments: TtsSegment[] = [];

  if (!input.article) {
    return segments;
  }

  const introductionLines = normalizeSentenceExplanationLines(
    input.article.introductionLines,
    input.article.introduction,
  );
  introductionLines.forEach((text, lineIndex) => {
    segments.push({
      key: buildSegmentKey("introduction", lineIndex),
      owner: "introduction",
      moduleName: "Introduction",
      text,
      lineIndex,
    });
  });

  for (const section of input.article.sections ?? []) {
    if (!section?.moduleId) {
      continue;
    }

    const moduleId = section.moduleId as ModuleId;
    const moduleName = section.moduleName || MODULE_LABELS[moduleId] || section.moduleId;
    const lines = normalizeSentenceExplanationLines(section.lines, section.content);

    lines.forEach((text, lineIndex) => {
      segments.push({
        key: buildSegmentKey(moduleId, lineIndex),
        owner: moduleId,
        moduleName,
        text,
        lineIndex,
      });
    });
  }

  const conclusionLines = normalizeSentenceExplanationLines(
    input.article.conclusionLines,
    input.article.conclusion,
  );
  conclusionLines.forEach((text, lineIndex) => {
    segments.push({
      key: buildSegmentKey("conclusion", lineIndex),
      owner: "conclusion",
      moduleName: "Conclusion",
      text,
      lineIndex,
    });
  });

  return segments;
}

function trimTtsText(text: string) {
  const normalized = text.trim();
  return normalized.length > MAX_TTS_TEXT_LENGTH ? normalized.slice(0, MAX_TTS_TEXT_LENGTH) : normalized;
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitMessage(message: string | undefined) {
  return /rate limit|too many requests|rpm/i.test(message || "");
}

function isRateLimitError(error: unknown): error is SentenceExplanationTtsRateLimitError {
  return error instanceof SentenceExplanationTtsRateLimitError;
}

function parseIntegerHeader(value: string | null | undefined) {
  const parsed = Number.parseInt((value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseRetryAfterMs(headers: Pick<Headers, "get"> | undefined) {
  if (!headers) {
    return null;
  }

  const retryAfterMs = parseIntegerHeader(headers.get("retry-after-ms"));
  if (retryAfterMs) {
    return retryAfterMs;
  }

  const retryAfterSeconds = parseIntegerHeader(headers.get("retry-after"));
  if (retryAfterSeconds) {
    return retryAfterSeconds * 1_000;
  }

  const resetEpochMs = parseIntegerHeader(headers.get("x-ratelimit-reset-ms"));
  if (resetEpochMs) {
    return Math.max(0, resetEpochMs - Date.now());
  }

  const resetEpochSeconds = parseIntegerHeader(headers.get("x-ratelimit-reset"));
  if (resetEpochSeconds) {
    const normalizedResetEpochMs = resetEpochSeconds > 1_000_000_000_000 ? resetEpochSeconds : resetEpochSeconds * 1_000;
    return Math.max(0, normalizedResetEpochMs - Date.now());
  }

  return null;
}

function extractMiniMaxErrorMessage(rawText: string, fallback: string) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      error?: string;
      message?: string;
      base_resp?: {
        status_msg?: string;
      };
    };

    return parsed.base_resp?.status_msg || parsed.error || parsed.message || trimmed;
  } catch {
    return trimmed;
  }
}

function buildMiniMaxResponseError(
  statusCode: number,
  rawText: string,
  headers: Pick<Headers, "get"> | undefined,
) {
  const message = extractMiniMaxErrorMessage(rawText, `HTTP ${statusCode}`);
  if (statusCode === 429 || isRateLimitMessage(message)) {
    return new SentenceExplanationTtsRateLimitError(message, parseRetryAfterMs(headers));
  }

  return new Error(message);
}

async function waitForRateLimitCooldown(rateLimitState: TtsRateLimitState) {
  const waitMs = rateLimitState.cooldownUntil - Date.now();
  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

function extendRateLimitCooldown(rateLimitState: TtsRateLimitState, cooldownMs: number) {
  rateLimitState.cooldownUntil = Math.max(rateLimitState.cooldownUntil, Date.now() + cooldownMs);
}

async function requestSpeech(
  text: string,
  language: SentenceExplanationTtsLanguage,
  voice: SentenceExplanationTtsVoice,
  speed: number,
  env: SentenceExplanationTtsEnv,
  config: ResolvedTtsRuntimeConfig,
  rateLimitState: TtsRateLimitState,
) {
  const endpoints = getRequestEndpoints(env);
  let lastError = "Sentence explanation TTS failed.";

  for (const endpoint of endpoints) {
    let requestAttempt = 1;
    let rateLimitAttempt = 0;

    while (requestAttempt <= config.maxRetries) {
      await waitForRateLimitCooldown(rateLimitState);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${env.MINIMAX_API_KEY!.trim()}`,
          },
          body: JSON.stringify({
            model: DEFAULT_TTS_MODEL,
            text: trimTtsText(text),
            stream: false,
            language_boost: getSentenceExplanationTtsLanguageBoost(language),
            voice_setting: {
              voice_id: voice,
              speed,
              vol: 1,
              pitch: 0,
            },
            audio_setting: {
              sample_rate: 32000,
              bitrate: 128000,
              format: "mp3",
              channel: 1,
            },
            output_format: "hex",
            subtitle_enable: false,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const rawText = await response.text();
          throw buildMiniMaxResponseError(response.status, rawText, response.headers);
        }

        const json = (await response.json()) as MiniMaxSpeechResponse;
        if (json.base_resp?.status_code !== 0) {
          const message = json.base_resp?.status_msg || `MiniMax error ${json.base_resp?.status_code}`;
          if (isRateLimitMessage(message)) {
            throw new SentenceExplanationTtsRateLimitError(message);
          }

          throw new Error(message);
        }

        const hexAudio = json.data?.audio;
        if (!hexAudio) {
          throw new Error("MiniMax returned no audio data.");
        }

        const audioBuffer = Buffer.from(hexAudio, "hex");
        return {
          audioDataUrl: `data:audio/mpeg;base64,${audioBuffer.toString("base64")}`,
          model: DEFAULT_TTS_MODEL,
        };
      } catch (error) {
        lastError = getErrorMessage(error, "Sentence explanation TTS request timed out.");

        if (isRateLimitError(error)) {
          extendRateLimitCooldown(rateLimitState, error.retryAfterMs ?? config.rateLimitCooldownMs);
          rateLimitAttempt += 1;

          if (rateLimitAttempt <= config.rateLimitRetries) {
            continue;
          }
        }

        if (requestAttempt < config.maxRetries) {
          await sleep(requestAttempt * 400);
          requestAttempt += 1;
          continue;
        }

        break;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  throw new Error(lastError);
}

function buildLineAudios(
  owner: SegmentOwner,
  lines: string[],
  audioBySegment: Map<string, string | null>,
): SentenceExplanationTtsLineAudio[] {
  return lines.map((text, lineIndex) => ({
    lineIndex,
    text,
    audioDataUrl: audioBySegment.get(buildSegmentKey(owner, lineIndex)) ?? null,
  }));
}

function buildAudioContent(
  owner: SegmentOwner,
  lines: string[],
  audioBySegment: Map<string, string | null>,
): SentenceExplanationTtsAudioContent {
  const lineAudios = buildLineAudios(owner, lines, audioBySegment);
  const singleAudio = lineAudios.length === 1 ? lineAudios[0].audioDataUrl : null;

  return {
    text: joinSentenceExplanationLines(lines),
    audioDataUrl: singleAudio,
    lineAudios,
  };
}

function buildSectionRecord(input: SentenceExplanationTtsRequest, audioBySegment: Map<string, string | null>) {
  return (input.article.sections ?? [])
    .filter((section): section is typeof section & { moduleId: ModuleId } => Boolean(section?.moduleId))
    .map((section) => {
      const lines = normalizeSentenceExplanationLines(section.lines, section.content);

      return {
        moduleId: section.moduleId,
        moduleName: section.moduleName || MODULE_LABELS[section.moduleId] || section.moduleId,
        imageRef: section.imageRef || section.moduleId,
        content: buildAudioContent(section.moduleId, lines, audioBySegment),
      } satisfies SentenceExplanationTtsSection;
    });
}

function buildSegmentFailureMessage(segment: TtsSegment, error: unknown) {
  return `${segment.moduleName} line ${segment.lineIndex + 1} failed: ${getErrorMessage(
    error,
    "Sentence explanation TTS failed.",
  )}`;
}

async function processWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  handler: (item: T) => Promise<void>,
) {
  if (!items.length) {
    return;
  }

  let index = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = index;
        index += 1;
        const item = items[currentIndex];
        if (typeof item === "undefined") {
          return;
        }

        await handler(item);
      }
    }),
  );
}

async function synthesizeSegments(
  segments: TtsSegment[],
  language: SentenceExplanationTtsLanguage,
  voice: SentenceExplanationTtsVoice,
  speed: number,
  env: SentenceExplanationTtsEnv,
  config: ResolvedTtsRuntimeConfig,
) {
  const audioBySegment = new Map<string, string | null>();
  const segmentErrors = new Map<string, string>();
  const rateLimitState: TtsRateLimitState = {
    cooldownUntil: 0,
  };
  let pendingSegments = [...segments];

  for (let pass = 1; pass <= config.segmentRetryPasses && pendingSegments.length; pass += 1) {
    const failedSegmentKeys = new Set<string>();

    await processWithConcurrency(pendingSegments, config.concurrency, async (segment) => {
      try {
        const result = await requestSpeech(segment.text, language, voice, speed, env, config, rateLimitState);
        audioBySegment.set(segment.key, result.audioDataUrl);
        segmentErrors.delete(segment.key);
      } catch (error) {
        audioBySegment.set(segment.key, null);
        segmentErrors.set(segment.key, buildSegmentFailureMessage(segment, error));
        failedSegmentKeys.add(segment.key);
      }
    });

    pendingSegments = pendingSegments.filter((segment) => failedSegmentKeys.has(segment.key));

    if (pendingSegments.length && pass < config.segmentRetryPasses) {
      await new Promise((resolve) => setTimeout(resolve, pass * 300));
    }
  }

  return {
    audioBySegment,
    segmentErrors,
    pendingSegments,
  };
}

export async function runSentenceExplanationTtsSkill(
  input: SentenceExplanationTtsRequest,
  env: SentenceExplanationTtsEnv,
): Promise<SentenceExplanationTtsResponse> {
  ensureAudioConfig(env);

  const config = resolveRuntimeConfig(env);
  const language = resolveLanguage(input.language);
  const voice = resolveVoice(language, input.voice);
  const speed = resolveSpeed(input.speed);
  const segments = buildSegments(input);
  const effectiveConfig = {
    ...config,
    concurrency: resolveEffectiveConcurrency(config, segments.length),
  };
  const { audioBySegment, segmentErrors, pendingSegments } = await synthesizeSegments(
    segments,
    language,
    voice,
    speed,
    env,
    effectiveConfig,
  );

  const successfulSegments = Array.from(audioBySegment.values()).filter(Boolean).length;
  if (pendingSegments.length) {
    const firstFailedSegment = pendingSegments[0];
    throw new Error(
      `Sentence explanation TTS still has ${pendingSegments.length}/${segments.length} failed segments. ${
        segmentErrors.get(firstFailedSegment.key) || "Sentence explanation TTS failed."
      }`,
    );
  }

  if (!successfulSegments && segments.length) {
    throw new Error("Sentence explanation TTS returned no audio segments.");
  }

  const introduction = buildAudioContent(
    "introduction",
    normalizeSentenceExplanationLines(input.article.introductionLines, input.article.introduction),
    audioBySegment,
  );

  const conclusion = buildAudioContent(
    "conclusion",
    normalizeSentenceExplanationLines(input.article.conclusionLines, input.article.conclusion),
    audioBySegment,
  );

  const metadata: SentenceExplanationTtsMetadata = {
    language,
    voice,
    speed,
    generatedAt: new Date().toISOString(),
    totalSegments: segments.length,
    successfulSegments,
  };

  return {
    title: input.article.title,
    welcomeMessage: input.article.welcomeMessage,
    introduction,
    sections: buildSectionRecord(input, audioBySegment),
    conclusion,
    metadata,
    source: "minimax-api",
    model: DEFAULT_TTS_MODEL,
  };
}

async function runSentenceExplanationTtsPreviewSkill(
  input: SentenceExplanationTtsPreviewRequest,
  env: SentenceExplanationTtsEnv,
): Promise<SentenceExplanationTtsPreviewResponse> {
  ensureAudioConfig(env);

  const config = resolveRuntimeConfig(env);
  const language = resolveLanguage(input.language);
  const voice = resolveVoice(language, input.voice);
  const speed = resolveSpeed(input.speed);
  const previewText = getSentenceExplanationTtsLanguageOption(language).previewText;
  const result = await requestSpeech(previewText, language, voice, speed, env, config, {
    cooldownUntil: 0,
  });

  return {
    language,
    voice,
    speed,
    generatedAt: new Date().toISOString(),
    text: previewText,
    audioDataUrl: result.audioDataUrl,
    source: "minimax-api",
    model: result.model,
  };
}

export function installSentenceExplanationTtsSkillShim(env: SentenceExplanationTtsEnv) {
  if (shimInstalled) {
    return;
  }

  registerRuntimeSkill("sentence-explanation-tts", async (rawParams) =>
    runSentenceExplanationTtsSkill(rawParams as SentenceExplanationTtsRequest, env),
  );
  registerRuntimeSkill("sentence-explanation-tts-preview", async (rawParams) =>
    runSentenceExplanationTtsPreviewSkill(rawParams as SentenceExplanationTtsPreviewRequest, env),
  );

  shimInstalled = true;
}
