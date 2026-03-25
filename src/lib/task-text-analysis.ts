import { analyzeSentenceText } from "@/lib/text-analysis-client";
import type { TextAnalysisMode } from "@/lib/text-analysis-contract";
import { getRequiredTextAnalysisModes, type ModuleId, type TextContent } from "@/lib/task-store";

export interface TaskTextAnalysisPayload {
  sentence: string;
  bookName: string;
  author: string;
  modules: ModuleId[];
}

export interface TaskTextAnalysisProgress {
  mode: TextAnalysisMode;
  stepIndex: number;
  stepCount: number;
  completedModes: TextAnalysisMode[];
}

const PARSING_STEP_TARGET_DURATION_MS: Record<TextAnalysisMode, number> = {
  all: 75_000,
  translation: 24_000,
  segmentation: 20_000,
  grammar: 28_000,
  vocabulary: 26_000,
  ielts: 22_000,
};

const MIN_RUNNING_STEP_COMPLETION = 0.1;
const MAX_RUNNING_STEP_COMPLETION = 0.92;

export function estimateRunningParsingStepCompletion(
  mode: TextAnalysisMode | null | undefined,
  elapsedMs: number,
): number {
  if (!mode) {
    return 0;
  }

  const targetDurationMs = PARSING_STEP_TARGET_DURATION_MS[mode] ?? 25_000;
  const safeElapsedMs = Math.max(0, elapsedMs);
  const easedCompletion =
    MIN_RUNNING_STEP_COMPLETION +
    (MAX_RUNNING_STEP_COMPLETION - MIN_RUNNING_STEP_COMPLETION) *
      (1 - Math.exp(-safeElapsedMs / targetDurationMs));

  return Math.min(MAX_RUNNING_STEP_COMPLETION, easedCompletion);
}

export function estimateParsingProgressPercentage(options: {
  totalSteps: number;
  completedSteps: number;
  runningMode?: TextAnalysisMode | null;
  elapsedMs?: number;
  maxPercentage?: number;
}) {
  if (options.totalSteps <= 0) {
    return 0;
  }

  const completedRatio = options.completedSteps / options.totalSteps;
  const inFlightCompletion = estimateRunningParsingStepCompletion(
    options.runningMode ?? null,
    options.elapsedMs ?? 0,
  );
  const estimatedRatio = (options.completedSteps + inFlightCompletion) / options.totalSteps;

  return Math.max(
    Math.round(completedRatio * 100),
    Math.min(options.maxPercentage ?? 96, Math.round(estimatedRatio * 100)),
  );
}

export async function analyzeTaskTextContent(
  payload: TaskTextAnalysisPayload,
  options: {
    currentTextContent?: TextContent;
    onStepStart?: (progress: TaskTextAnalysisProgress) => void;
    onStepComplete?: (progress: TaskTextAnalysisProgress) => void;
  } = {},
) {
  const modes = getRequiredTextAnalysisModes(payload.modules);
  const orderedModes = modes.length ? modes : ["all"];
  let latestAnalysis: Awaited<ReturnType<typeof analyzeSentenceText>> | null = null;

  for (const [stepIndex, mode] of orderedModes.entries()) {
    options.onStepStart?.({
      mode,
      stepIndex,
      stepCount: orderedModes.length,
      completedModes: orderedModes.slice(0, stepIndex),
    });

    latestAnalysis = await analyzeSentenceText({
      sentence: payload.sentence,
      bookName: payload.bookName,
      author: payload.author,
      mode,
      currentTextContent: latestAnalysis?.textContent ?? options.currentTextContent,
    });

    options.onStepComplete?.({
      mode,
      stepIndex,
      stepCount: orderedModes.length,
      completedModes: orderedModes.slice(0, stepIndex + 1),
    });
  }

  if (!latestAnalysis) {
    throw new Error("未能生成所选模块对应的文本解析内容。");
  }

  return {
    analysis: latestAnalysis,
    orderedModes,
  };
}
