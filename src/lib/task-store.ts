import { useEffect, useMemo, useState } from "react";
import type {
  AnalysisSource,
  TextAnalysisContent,
  TextAnalysisGrammar,
  TextAnalysisIeltsTips,
  TextAnalysisMode,
  TextAnalysisVocabularyCard,
} from "@/lib/text-analysis-contract";
import { deleteAssetData, loadAssetData, saveAssetData } from "@/lib/browser-image-store";
import { buildGeneratedImageFileName } from "@/lib/image-file-name";
import {
  joinSentenceExplanationLines,
  normalizeSentenceExplanationLines,
  type SentenceExplanationResponse,
} from "@/lib/sentence-explanation-contract";
import type { SentenceExplanationVideoSubtitleTrack } from "@/lib/sentence-explanation-video";
import type {
  SentenceExplanationTtsAudioContent,
  SentenceExplanationTtsLineAudio,
  SentenceExplanationTtsResponse,
} from "@/lib/sentence-explanation-tts-contract";
import {
  deleteSupabaseTaskSnapshot,
  loadSupabaseTaskSnapshots,
  upsertSupabaseTaskSnapshots,
  type SupabaseTaskSnapshotRecord,
} from "@/lib/supabase-task-snapshots";
import {
  deleteStorageObject,
  getImageUrl,
  isSupabaseConfigured,
  uploadStorageObject,
} from "@/lib/supabase-image-store";
import { prepareTranslationImagePanels } from "@/lib/translation-image-prompt";

export type ModuleId = "translation" | "grammar" | "summary" | "vocabulary" | "ielts";
export type FlowMode = "text" | "all";
export type TaskStatus = "pending" | "parsing" | "parsed" | "edited" | "generating" | "completed" | "failed";
export type StepStatus = "pending" | "running" | "done" | "error";

export interface ModuleMeta {
  id: ModuleId;
  title: string;
  shortTitle: string;
  panels: string;
  description: string;
  dependsOn: string;
}

export interface ReferenceAsset {
  id: string;
  imageType: ModuleId;
  fileName: string;
  fileSize: number;
  mimeType: string;
  dataUrl: string;
  publicUrl?: string;
  uploadedAt: string;
}

export type VocabularyCard = TextAnalysisVocabularyCard;

export type IeltsTips = TextAnalysisIeltsTips;

export type GrammarFields = TextAnalysisGrammar;

export type TextContent = TextAnalysisContent;

export interface GeneratedImage {
  id: string;
  imageType: ModuleId;
  title: string;
  subtitle: string;
  sourceText: string;
  fileName: string;
  dataUrl: string;
  publicUrl?: string;
  createdAt: string;
}

export type TaskResumeRoute = "edit" | "task" | "result" | "explanation" | "video";

export interface SentenceExplanationVideoAsset {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  publicUrl?: string;
  durationSeconds: number;
  createdAt: string;
  subtitleTrack?: SentenceExplanationVideoSubtitleTrack;
}

export interface TaskSentenceExplanationState {
  article: SentenceExplanationResponse | null;
  tts: SentenceExplanationTtsResponse | null;
  video: SentenceExplanationVideoAsset | null;
  stage: "idle" | "article" | "tts" | "video";
  updatedAt?: string;
}

export interface TaskLog {
  id: string;
  level: "info" | "success" | "error";
  message: string;
  createdAt: string;
}

export interface TaskStep {
  id: string;
  stage: "parsing" | "generation";
  label: string;
  status: StepStatus;
  moduleId?: ModuleId;
}

export interface Task {
  id: string;
  workflowId?: string;
  sentence: string;
  bookName: string;
  author: string;
  modules: ModuleId[];
  referenceImages: Record<ModuleId, ReferenceAsset | null>;
  textContent: TextContent;
  generatedImages: Partial<Record<ModuleId, GeneratedImage>>;
  steps: TaskStep[];
  logs: TaskLog[];
  status: TaskStatus;
  progress: number;
  currentStage: "pending" | "parsing" | "edit" | "generation" | "done" | "failed";
  flowMode: FlowMode;
  analysisSource?: AnalysisSource;
  analysisModel?: string;
  sentenceExplanation?: TaskSentenceExplanationState;
  resumeRoute?: TaskResumeRoute;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TaskInput {
  sentence: string;
  bookName: string;
  author: string;
  modules: ModuleId[];
  referenceImages: Record<ModuleId, ReferenceAsset | null>;
}

export interface TaskCreationOptions {
  textContent?: TextContent;
  analysisSource?: AnalysisSource;
  analysisModel?: string;
}

export interface RegenerationTaskOptions {
  modules?: ModuleId[];
  textContent?: TextContent;
  referenceImages?: Record<ModuleId, ReferenceAsset | null>;
}

export interface RevisionTaskOptions {
  targetModules: ModuleId[];
  displayModules?: ModuleId[];
  textContent?: TextContent;
}

export interface SentenceExplanationRevisionTaskOptions {
  article?: SentenceExplanationResponse | null;
  tts?: SentenceExplanationTtsResponse | null;
  video?: SentenceExplanationVideoAsset | null;
  stage?: TaskSentenceExplanationState["stage"];
  resumeRoute?: TaskResumeRoute;
}

const TASKS_KEY = "english-flow.tasks.v2";
const MODULE_PREFS_KEY = "english-flow.module-prefs.v2";
const REFERENCES_KEY = "english-flow.reference-images.v2";
const TASKS_UPDATED_EVENT = "english-flow:tasks-updated";
const lastSyncedTaskSnapshotSignatures = new Map<string, string>();
const REFERENCE_IMAGE_SIZE_LIMIT_BYTES = 20 * 1024 * 1024;
const REFERENCE_IMAGE_OPTIMIZE_THRESHOLD_BYTES = 4 * 1024 * 1024;
const REFERENCE_IMAGE_MAX_EDGE = 1600;

const defaultModules: ModuleId[] = ["translation", "grammar", "summary", "vocabulary", "ielts"];

const moduleAnalysisModeMap: Record<ModuleId, TextAnalysisMode[]> = {
  translation: ["segmentation"],
  grammar: ["grammar"],
  summary: ["grammar"],
  vocabulary: ["vocabulary"],
  ielts: ["ielts"],
};

const analysisStepDefinitions: Record<TextAnalysisMode, { id: string; label: string }> = {
  all: { id: "parse-all", label: "生成全部文本解析内容" },
  translation: { id: "parse-translation", label: "生成汉语翻译" },
  segmentation: { id: "parse-segmentation", label: "智能分句并拆成 prompt1-4" },
  grammar: { id: "parse-grammar", label: "生成句式分析" },
  vocabulary: { id: "parse-vocabulary", label: "生成词汇解析" },
  ielts: { id: "parse-ielts", label: "生成雅思备考建议" },
};

const emptyReferenceRecord = (): Record<ModuleId, ReferenceAsset | null> => ({
  translation: null,
  grammar: null,
  summary: null,
  vocabulary: null,
  ielts: null,
});

export const moduleMetaList: ModuleMeta[] = [
  {
    id: "translation",
    title: "句译对照图",
    shortTitle: "句译对照",
    panels: "6 宫格",
    description: "根据 prompt1-4 生成中英对照教学条漫。",
    dependsOn: "prompt1-4",
  },
  {
    id: "grammar",
    title: "句式分析图",
    shortTitle: "句式分析",
    panels: "4 宫格",
    description: "展示时态、语态和句式结构拆解。",
    dependsOn: "句式分析文本",
  },
  {
    id: "summary",
    title: "句式总结图",
    shortTitle: "句式总结",
    panels: "2 宫格",
    description: "提炼长难句的核心结构总结。",
    dependsOn: "句式分析文本",
  },
  {
    id: "vocabulary",
    title: "词汇解析图",
    shortTitle: "词汇解析",
    panels: "6 宫格",
    description: "围绕 6 个核心词汇生成可视化讲解。",
    dependsOn: "词汇解析文本",
  },
  {
    id: "ielts",
    title: "雅思备考图",
    shortTitle: "雅思备考",
    panels: "4 宫格",
    description: "输出听说读写四维备考建议。",
    dependsOn: "雅思备考文本",
  },
];

export const referenceSlotList = moduleMetaList.map((module) => ({
  id: module.id,
  title: `${module.shortTitle}参考图`,
  helper: `用于控制${module.shortTitle}图片的风格与布局`,
}));

export const exampleSentence = {
  sentence:
    "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.",
  bookName: "Pride and Prejudice",
  author: "Jane Austen",
};

function hasWindow() {
  return typeof window !== "undefined";
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createTimestamp() {
  return new Date().toISOString();
}

function createLogEntry(level: TaskLog["level"], message: string): TaskLog {
  return {
    id: createId("log"),
    level,
    message,
    createdAt: createTimestamp(),
  };
}

function buildGeneratedImageUploadErrorMessage(moduleId: ModuleId, error?: string) {
  return `${moduleTitle(moduleId)}已生成，但上传到 Supabase 失败：${error || "未知错误"}。当前仅保存在本地，可稍后重新同步。`;
}

function buildGeneratedImageUploadSuccessMessage(moduleId: ModuleId) {
  return `${moduleTitle(moduleId)}已同步到 Supabase。`;
}

function normalizeReferenceAsset(asset: ReferenceAsset | null) {
  if (!asset) return null;
  return {
    ...asset,
    dataUrl: asset.dataUrl ?? "",
    publicUrl: asset.publicUrl ?? "",
  };
}

function normalizeReferenceRecord(images?: Partial<Record<ModuleId, ReferenceAsset | null>> | null) {
  const safeImages = images ?? {};
  return {
    translation: normalizeReferenceAsset(safeImages.translation ?? null),
    grammar: normalizeReferenceAsset(safeImages.grammar ?? null),
    summary: normalizeReferenceAsset(safeImages.summary ?? null),
    vocabulary: normalizeReferenceAsset(safeImages.vocabulary ?? null),
    ielts: normalizeReferenceAsset(safeImages.ielts ?? null),
  };
}

function normalizeGeneratedImage(image: GeneratedImage) {
  return {
    ...image,
    dataUrl: image.dataUrl ?? "",
    publicUrl: image.publicUrl ?? "",
  };
}

function createEmptySentenceExplanationState(): TaskSentenceExplanationState {
  return {
    article: null,
    tts: null,
    video: null,
    stage: "idle",
    updatedAt: undefined,
  };
}

function cloneSentenceExplanationResponse(
  response: SentenceExplanationResponse | null | undefined,
): SentenceExplanationResponse | null {
  if (!response) {
    return null;
  }

  return {
    ...response,
    orderedModules: [...response.orderedModules],
    article: {
      ...response.article,
      introduction: joinSentenceExplanationLines(
        response.article.introductionLines,
        response.article.introduction,
      ),
      introductionLines: normalizeSentenceExplanationLines(
        response.article.introductionLines,
        response.article.introduction,
      ),
      sections: response.article.sections.map((section) => ({
        ...section,
        lines: normalizeSentenceExplanationLines(section.lines, section.content),
        content: joinSentenceExplanationLines(section.lines, section.content),
      })),
      conclusion: joinSentenceExplanationLines(
        response.article.conclusionLines,
        response.article.conclusion,
      ),
      conclusionLines: normalizeSentenceExplanationLines(
        response.article.conclusionLines,
        response.article.conclusion,
      ),
    },
  };
}

function normalizeSentenceExplanationLineAudio(
  lineAudio: SentenceExplanationTtsLineAudio,
): SentenceExplanationTtsLineAudio {
  const audioDataUrl = lineAudio.audioDataUrl ?? null;
  return {
    ...lineAudio,
    audioDataUrl,
    assetId: lineAudio.assetId ?? (audioDataUrl ? createId("sentence-explanation-audio") : undefined),
    publicUrl: lineAudio.publicUrl ?? "",
  };
}

function normalizeSentenceExplanationAudioContent(
  content: SentenceExplanationTtsAudioContent,
): SentenceExplanationTtsAudioContent {
  const audioDataUrl = content.audioDataUrl ?? null;
  const lineAudios = Array.isArray(content.lineAudios)
    ? content.lineAudios.map((lineAudio) => normalizeSentenceExplanationLineAudio(lineAudio))
    : [];
  return {
    ...content,
    audioDataUrl,
    assetId:
      content.assetId ??
      (audioDataUrl || lineAudios.some((lineAudio) => Boolean(lineAudio.audioDataUrl))
        ? createId("sentence-explanation-audio")
        : undefined),
    publicUrl: content.publicUrl ?? "",
    lineAudios,
  };
}

function cloneSentenceExplanationTts(
  response: SentenceExplanationTtsResponse | null | undefined,
  cloneAssetIds = false,
): SentenceExplanationTtsResponse | null {
  if (!response) {
    return null;
  }

  const cloneAudio = (content: SentenceExplanationTtsAudioContent) => {
    const normalized = normalizeSentenceExplanationAudioContent(content);
    return {
      ...normalized,
      assetId: cloneAssetIds && normalized.assetId ? createId("sentence-explanation-audio") : normalized.assetId,
      lineAudios: normalized.lineAudios?.map((lineAudio) => ({
        ...lineAudio,
        assetId: cloneAssetIds && lineAudio.assetId ? createId("sentence-explanation-audio") : lineAudio.assetId,
      })),
    };
  };

  return {
    ...response,
    introduction: cloneAudio(response.introduction),
    sections: response.sections.map((section) => ({
      ...section,
      content: cloneAudio(section.content),
    })),
    conclusion: cloneAudio(response.conclusion),
    metadata: {
      ...response.metadata,
    },
  };
}

function normalizeSentenceExplanationVideoAsset(
  video: SentenceExplanationVideoAsset | null | undefined,
): SentenceExplanationVideoAsset | null {
  if (!video) {
    return null;
  }

  return {
    ...video,
    id: video.id || createId("sentence-explanation-video"),
    dataUrl: video.dataUrl ?? "",
    publicUrl: video.publicUrl ?? "",
  };
}

function cloneSentenceExplanationVideo(
  video: SentenceExplanationVideoAsset | null | undefined,
  cloneAssetId = false,
): SentenceExplanationVideoAsset | null {
  const normalized = normalizeSentenceExplanationVideoAsset(video);
  if (!normalized) {
    return null;
  }

  return {
    ...normalized,
    id: cloneAssetId ? createId("sentence-explanation-video") : normalized.id,
  };
}

function normalizeSentenceExplanationState(
  state?: TaskSentenceExplanationState | null,
): TaskSentenceExplanationState {
  if (!state) {
    return createEmptySentenceExplanationState();
  }

  return {
    article: cloneSentenceExplanationResponse(state.article),
    tts: cloneSentenceExplanationTts(state.tts),
    video: normalizeSentenceExplanationVideoAsset(state.video),
    stage: state.stage ?? "idle",
    updatedAt: state.updatedAt,
  };
}

function cloneSentenceExplanationState(
  state?: TaskSentenceExplanationState | null,
  options: { cloneAssetIds?: boolean } = {},
): TaskSentenceExplanationState {
  const normalized = normalizeSentenceExplanationState(state);
  return {
    article: cloneSentenceExplanationResponse(normalized.article),
    tts: cloneSentenceExplanationTts(normalized.tts, options.cloneAssetIds ?? false),
    video: cloneSentenceExplanationVideo(normalized.video, options.cloneAssetIds ?? false),
    stage: normalized.stage,
    updatedAt: normalized.updatedAt,
  };
}

function stripSentenceExplanationTts(
  response: SentenceExplanationTtsResponse | null | undefined,
): SentenceExplanationTtsResponse | null {
  if (!response) {
    return null;
  }

  const stripAudio = (content: SentenceExplanationTtsAudioContent) => ({
    ...content,
    audioDataUrl: null,
    lineAudios: content.lineAudios?.map((lineAudio) => ({
      ...lineAudio,
      audioDataUrl: null,
    })),
  });

  return {
    ...response,
    introduction: stripAudio(response.introduction),
    sections: response.sections.map((section) => ({
      ...section,
      content: stripAudio(section.content),
    })),
    conclusion: stripAudio(response.conclusion),
  };
}

function stripSentenceExplanationVideo(
  video: SentenceExplanationVideoAsset | null | undefined,
): SentenceExplanationVideoAsset | null {
  const normalized = normalizeSentenceExplanationVideoAsset(video);
  if (!normalized) {
    return null;
  }

  return {
    ...normalized,
    dataUrl: "",
  };
}

function stripSentenceExplanationState(
  state?: TaskSentenceExplanationState | null,
): TaskSentenceExplanationState {
  const normalized = normalizeSentenceExplanationState(state);
  return {
    ...normalized,
    article: cloneSentenceExplanationResponse(normalized.article),
    tts: stripSentenceExplanationTts(normalized.tts),
    video: stripSentenceExplanationVideo(normalized.video),
  };
}

function resolveImageSource(
  imageType: "reference" | "generated",
  ownerId: string,
  fileName: string,
  currentSource: string,
  localSource: string,
  publicUrl?: string,
) {
  if (currentSource) {
    return currentSource;
  }

  if (localSource) {
    return localSource;
  }

  if (publicUrl) {
    return publicUrl;
  }

  if (!ownerId || !fileName || !isSupabaseConfigured()) {
    return "";
  }

  return getImageUrl(imageType, ownerId, fileName);
}

function resolveCloudMediaSource(currentSource: string | null | undefined, publicUrl?: string) {
  if (currentSource) {
    return currentSource;
  }

  if (publicUrl) {
    return publicUrl;
  }

  return null;
}

function extractDataUrlMimeType(dataUrl: string | null | undefined) {
  if (!dataUrl?.startsWith("data:")) {
    return "";
  }

  const match = dataUrl.match(/^data:([^;,]+)/i);
  return match?.[1] ?? "";
}

function extensionForMimeType(mimeType: string, fallback: string) {
  const normalized = mimeType.trim().toLowerCase();
  switch (normalized) {
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/ogg":
      return "ogg";
    case "audio/aac":
      return "aac";
    case "audio/mp4":
    case "audio/x-m4a":
      return "m4a";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    default:
      return fallback;
  }
}

function buildSentenceExplanationAudioFileName(
  moduleId: ModuleId | "introduction" | "conclusion",
  mimeType?: string,
  lineIndex?: number,
) {
  const extension = extensionForMimeType(mimeType ?? "", "mp3");
  const suffix = typeof lineIndex === "number" ? `-${String(lineIndex + 1).padStart(2, "0")}` : "";
  if (moduleId === "introduction" || moduleId === "conclusion") {
    return `${moduleId}${suffix}.${extension}`;
  }

  const order = defaultModules.indexOf(moduleId);
  const prefix = String(order >= 0 ? order + 1 : 0).padStart(2, "0");
  return `${prefix}-${moduleId}${suffix}.${extension}`;
}

function buildSentenceExplanationVideoFileName(mimeType?: string) {
  const extension = extensionForMimeType(mimeType ?? "", "mp4");
  return `sentence-explanation-video.${extension}`;
}

function normalizeGeneratedImageRecord(images?: Partial<Record<ModuleId, GeneratedImage>> | null) {
  return Object.fromEntries(
    Object.entries(images ?? {}).map(([moduleId, image]) => [moduleId, normalizeGeneratedImage(image as GeneratedImage)]),
  ) as Partial<Record<ModuleId, GeneratedImage>>;
}

function stripReferenceAssetData(asset: ReferenceAsset | null) {
  if (!asset) return null;
  return {
    ...asset,
    dataUrl: "",
  };
}

function stripReferenceRecordData(images?: Partial<Record<ModuleId, ReferenceAsset | null>> | null) {
  const safeImages = images ?? {};
  return {
    translation: stripReferenceAssetData(safeImages.translation ?? null),
    grammar: stripReferenceAssetData(safeImages.grammar ?? null),
    summary: stripReferenceAssetData(safeImages.summary ?? null),
    vocabulary: stripReferenceAssetData(safeImages.vocabulary ?? null),
    ielts: stripReferenceAssetData(safeImages.ielts ?? null),
  };
}

function stripGeneratedImageData(image: GeneratedImage) {
  return {
    ...image,
    dataUrl: "",
  };
}

function stripGeneratedImageRecordData(images?: Partial<Record<ModuleId, GeneratedImage>> | null) {
  return Object.fromEntries(
    Object.entries(images ?? {}).map(([moduleId, image]) => [moduleId, stripGeneratedImageData(image as GeneratedImage)]),
  ) as Partial<Record<ModuleId, GeneratedImage>>;
}

function serializeTask(task: Task): Task {
  return {
    ...task,
    referenceImages: stripReferenceRecordData(task.referenceImages),
    generatedImages: stripGeneratedImageRecordData(task.generatedImages),
    sentenceExplanation: stripSentenceExplanationState(task.sentenceExplanation),
  };
}

function createTaskSnapshotSignature(task: Task) {
  return JSON.stringify(serializeTask(task));
}

function buildSupabaseTaskSnapshotRecord(task: Task): SupabaseTaskSnapshotRecord<Task> {
  const serializedTask = serializeTask(task);
  return {
    id: serializedTask.id,
    workflow_id: getTaskWorkflowId(serializedTask),
    sentence: serializedTask.sentence,
    book_name: serializedTask.bookName,
    author: serializedTask.author,
    status: serializedTask.status,
    current_stage: serializedTask.currentStage,
    resume_route: resolveTaskResumeRoute(serializedTask),
    flow_mode: serializedTask.flowMode,
    created_at: serializedTask.createdAt,
    updated_at: serializedTask.updatedAt,
    completed_at: serializedTask.completedAt ?? null,
    task_data: serializedTask,
  };
}

function primeSupabaseTaskSnapshotCache(tasks: Task[]) {
  tasks.forEach((task) => {
    lastSyncedTaskSnapshotSignatures.set(task.id, createTaskSnapshotSignature(task));
  });
}

function clearSupabaseTaskSnapshotCache(taskId: string) {
  if (!taskId) {
    return;
  }

  lastSyncedTaskSnapshotSignatures.delete(taskId);
}

function compareTaskRecordRecency(left: Task, right: Task) {
  const updatedCompare = (left.updatedAt || left.createdAt).localeCompare(right.updatedAt || right.createdAt);
  if (updatedCompare !== 0) {
    return updatedCompare;
  }

  return left.createdAt.localeCompare(right.createdAt);
}

function mergeTaskCollections(localTasks: Task[], remoteTasks: Task[]) {
  const mergedById = new Map<string, Task>();

  [...localTasks, ...remoteTasks].forEach((task) => {
    const current = mergedById.get(task.id);
    if (!current) {
      mergedById.set(task.id, task);
      return;
    }

    if (compareTaskRecordRecency(task, current) >= 0) {
      mergedById.set(task.id, mergeTaskWithHydratedAssets(task, current) ?? task);
      return;
    }

    mergedById.set(task.id, mergeTaskWithHydratedAssets(current, task) ?? current);
  });

  return Array.from(mergedById.values()).sort((left, right) =>
    (right.createdAt || "").localeCompare(left.createdAt || "") || (right.updatedAt || "").localeCompare(left.updatedAt || ""),
  );
}

function createTaskCollectionSignature(tasks: Task[]) {
  return tasks
    .map((task) => `${task.id}:${createTaskSnapshotSignature(task)}`)
    .sort()
    .join("\n");
}

async function syncTasksToSupabase(tasks: Task[]) {
  const payload = tasks.flatMap((task) => {
    const signature = createTaskSnapshotSignature(task);
    if (lastSyncedTaskSnapshotSignatures.get(task.id) === signature) {
      return [];
    }

    return [buildSupabaseTaskSnapshotRecord(task)];
  });

  if (!payload.length) {
    return;
  }

  const result = await upsertSupabaseTaskSnapshots(payload);
  if (!result.success) {
    throw new Error(result.error || "Failed to sync task snapshots to Supabase.");
  }

  primeSupabaseTaskSnapshotCache(tasks);
}

function writeTasksToLocalStorage(tasks: Task[], emitUpdateEvent = true) {
  if (!hasWindow()) return;
  const normalizedTasks = tasks.map((task) =>
    ensureStepConsistency({
      ...task,
      textContent: cloneTextContent(task.textContent),
    }),
  );
  const serializedTasks = normalizedTasks.map((task) => serializeTask(task));
  const jsonString = JSON.stringify(serializedTasks);

  // Check localStorage quota before saving
  const maxLocalStorageSize = 5 * 1024 * 1024; // 5MB typical limit
  const dataSize = new Blob([jsonString]).size;

  if (dataSize > maxLocalStorageSize * 0.9) {
    // Over 90% of quota, try to clean up old tasks
    console.warn(`Task data size (${(dataSize / 1024 / 1024).toFixed(2)}MB) approaching localStorage quota. Attempting cleanup...`);

    // Keep only the most recent tasks
    const sortedTasks = [...normalizedTasks].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    // Try keeping fewer tasks progressively
    const targetSizes = [20, 15, 10, 5];
    for (const targetCount of targetSizes) {
      const trimmedTasks = sortedTasks.slice(0, targetCount);
      const trimmedSerialized = trimmedTasks.map((task) => serializeTask(task));
      const trimmedJson = JSON.stringify(trimmedSerialized);
      const trimmedSize = new Blob([trimmedJson]).size;

      if (trimmedSize < maxLocalStorageSize * 0.8) {
        // Under 80% of quota, safe to save
        try {
          window.localStorage.setItem(TASKS_KEY, trimmedJson);
          console.warn(`Reduced task history to ${targetCount} most recent tasks to stay within storage quota.`);
          if (emitUpdateEvent) {
            emitTaskUpdate();
          }
          return;
        } catch (e) {
          // Continue to next attempt
        }
      }
    }

    // If we get here, even 5 tasks is too much - this shouldn't happen but handle it
    console.error("Unable to save tasks: Storage quota exceeded even with minimal task history.");
    return;
  }

  try {
    window.localStorage.setItem(TASKS_KEY, jsonString);
    if (emitUpdateEvent) {
      emitTaskUpdate();
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      console.error("localStorage quota exceeded. Task data could not be saved.", error);
      // Try emergency cleanup - keep only last 5 tasks
      const sortedTasks = [...normalizedTasks].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      const emergencyTasks = sortedTasks.slice(0, 5);
      const emergencyJson = JSON.stringify(emergencyTasks.map((task) => serializeTask(task)));
      try {
        window.localStorage.setItem(TASKS_KEY, emergencyJson);
        console.warn("Emergency cleanup: reduced to 5 most recent tasks.");
        if (emitUpdateEvent) {
          emitTaskUpdate();
        }
      } catch (e) {
        console.error("Critical: Unable to save even minimal task data.", e);
      }
    } else {
      throw error;
    }
  }
}

async function restoreTasksFromSupabaseIntoLocal() {
  const localTasks = loadTasks();
  const result = await loadSupabaseTaskSnapshots<Task>();
  if (!result.success) {
    return localTasks;
  }

  const remoteTasks = result.tasks
    .filter((task): task is Task => Boolean(task?.id && task?.sentence && task?.createdAt))
    .map((task) =>
      ensureStepConsistency({
        ...task,
        textContent: cloneTextContent(task.textContent),
      }),
    );
  const mergedTasks = mergeTaskCollections(localTasks, remoteTasks);

  primeSupabaseTaskSnapshotCache(remoteTasks);
  if (createTaskCollectionSignature(localTasks) !== createTaskCollectionSignature(mergedTasks)) {
    writeTasksToLocalStorage(mergedTasks);
  }

  if (mergedTasks.length) {
    try {
      await syncTasksToSupabase(mergedTasks);
    } catch (error) {
      console.error("Failed to backfill task snapshots to Supabase.", error);
    }
  }

  return mergedTasks;
}

async function persistReferenceAssetData(images: Record<ModuleId, ReferenceAsset | null>) {
  const entries = Object.values(images)
    .filter((asset): asset is ReferenceAsset => Boolean(asset?.id && asset.dataUrl))
    .map((asset) => ({ key: asset.id, dataUrl: asset.dataUrl }));
  await saveAssetData("reference-assets", entries);
}

async function persistGeneratedImageData(images: Partial<Record<ModuleId, GeneratedImage>>) {
  const entries = Object.values(images)
    .filter((image): image is GeneratedImage => Boolean(image?.id && image.dataUrl))
    .map((image) => ({ key: image.id, dataUrl: image.dataUrl }));
  await saveAssetData("generated-images", entries);
}

function collectSentenceExplanationAudioEntries(
  response: SentenceExplanationTtsResponse | null | undefined,
) {
  if (!response) {
    return [];
  }

  const collectContentEntries = (content: SentenceExplanationTtsAudioContent) => {
    const entries = content.assetId && content.audioDataUrl ? [{ key: content.assetId, dataUrl: content.audioDataUrl }] : [];
    const lineEntries =
      content.lineAudios?.flatMap((lineAudio) =>
        lineAudio.assetId && lineAudio.audioDataUrl ? [{ key: lineAudio.assetId, dataUrl: lineAudio.audioDataUrl }] : [],
      ) ?? [];

    return [...entries, ...lineEntries];
  };

  const entries = [response.introduction, ...response.sections.map((section) => section.content), response.conclusion]
    .flatMap((content) => collectContentEntries(content));

  return entries;
}

async function persistSentenceExplanationTtsData(
  response: SentenceExplanationTtsResponse | null | undefined,
) {
  await saveAssetData("sentence-explanation-audio", collectSentenceExplanationAudioEntries(response));
}

async function persistSentenceExplanationVideoData(
  video: SentenceExplanationVideoAsset | null | undefined,
) {
  if (!video?.id || !video.dataUrl) {
    return;
  }

  await saveAssetData("sentence-explanation-videos", [{ key: video.id, dataUrl: video.dataUrl }]);
}

async function persistTaskAssetData(tasks: Task[]) {
  await Promise.all([
    saveAssetData(
      "reference-assets",
      tasks.flatMap((task) =>
        Object.values(task.referenceImages)
          .filter((asset): asset is ReferenceAsset => Boolean(asset?.id && asset.dataUrl))
          .map((asset) => ({ key: asset.id, dataUrl: asset.dataUrl })),
      ),
    ),
    saveAssetData(
      "generated-images",
      tasks.flatMap((task) =>
        Object.values(task.generatedImages)
          .filter((image): image is GeneratedImage => Boolean(image?.id && image.dataUrl))
          .map((image) => ({ key: image.id, dataUrl: image.dataUrl })),
      ),
    ),
    saveAssetData(
      "sentence-explanation-audio",
      tasks.flatMap((task) => collectSentenceExplanationAudioEntries(task.sentenceExplanation?.tts)),
    ),
    saveAssetData(
      "sentence-explanation-videos",
      tasks
        .map((task) => task.sentenceExplanation?.video)
        .filter((video): video is SentenceExplanationVideoAsset => Boolean(video?.id && video.dataUrl))
        .map((video) => ({ key: video.id, dataUrl: video.dataUrl })),
    ),
  ]);
}

export async function hydrateReferenceImages(images?: Partial<Record<ModuleId, ReferenceAsset | null>> | null) {
  const normalized = normalizeReferenceRecord(images);
  const assetIds = Object.values(normalized)
    .filter((asset): asset is ReferenceAsset => Boolean(asset?.id && !asset.dataUrl))
    .map((asset) => asset.id);

  if (!assetIds.length) {
    return normalized;
  }

  const dataMap = await loadAssetData("reference-assets", assetIds);
  return {
    translation: normalized.translation
      ? {
          ...normalized.translation,
          dataUrl: resolveImageSource(
            "reference",
            normalized.translation.id,
            normalized.translation.fileName,
            normalized.translation.dataUrl,
            dataMap[normalized.translation.id] || "",
            normalized.translation.publicUrl,
          ),
        }
      : null,
    grammar: normalized.grammar
      ? {
          ...normalized.grammar,
          dataUrl: resolveImageSource(
            "reference",
            normalized.grammar.id,
            normalized.grammar.fileName,
            normalized.grammar.dataUrl,
            dataMap[normalized.grammar.id] || "",
            normalized.grammar.publicUrl,
          ),
        }
      : null,
    summary: normalized.summary
      ? {
          ...normalized.summary,
          dataUrl: resolveImageSource(
            "reference",
            normalized.summary.id,
            normalized.summary.fileName,
            normalized.summary.dataUrl,
            dataMap[normalized.summary.id] || "",
            normalized.summary.publicUrl,
          ),
        }
      : null,
    vocabulary: normalized.vocabulary
      ? {
          ...normalized.vocabulary,
          dataUrl: resolveImageSource(
            "reference",
            normalized.vocabulary.id,
            normalized.vocabulary.fileName,
            normalized.vocabulary.dataUrl,
            dataMap[normalized.vocabulary.id] || "",
            normalized.vocabulary.publicUrl,
          ),
        }
      : null,
    ielts: normalized.ielts
      ? {
          ...normalized.ielts,
          dataUrl: resolveImageSource(
            "reference",
            normalized.ielts.id,
            normalized.ielts.fileName,
            normalized.ielts.dataUrl,
            dataMap[normalized.ielts.id] || "",
            normalized.ielts.publicUrl,
          ),
        }
      : null,
  };
}

async function hydrateGeneratedImages(taskId: string, images: Partial<Record<ModuleId, GeneratedImage>>) {
  const normalized = normalizeGeneratedImageRecord(images);
  const imageIds = Object.values(normalized)
    .filter((image): image is GeneratedImage => Boolean(image?.id && !image.dataUrl))
    .map((image) => image.id);

  if (!imageIds.length) {
    return normalized;
  }

  const dataMap = await loadAssetData("generated-images", imageIds);
  return Object.fromEntries(
    Object.entries(normalized).map(([moduleId, image]) => [
      moduleId,
      image
        ? {
            ...image,
            dataUrl: resolveImageSource(
              "generated",
              taskId,
              image.fileName,
              image.dataUrl,
              dataMap[image.id] || "",
              image.publicUrl,
            ),
          }
        : image,
    ]),
  ) as Partial<Record<ModuleId, GeneratedImage>>;
}

async function hydrateSentenceExplanationTts(
  response: SentenceExplanationTtsResponse | null | undefined,
) {
  const normalized = cloneSentenceExplanationTts(response);
  if (!normalized) {
    return null;
  }

  const audioEntries = [normalized.introduction, ...normalized.sections.map((section) => section.content), normalized.conclusion];
  const assetIds = audioEntries.flatMap((content) => [
    ...(content.assetId && !content.audioDataUrl ? [content.assetId] : []),
    ...(
      content.lineAudios
        ?.filter((lineAudio) => Boolean(lineAudio.assetId && !lineAudio.audioDataUrl))
        .map((lineAudio) => lineAudio.assetId as string) ?? []
    ),
  ]);

  if (!assetIds.length) {
    return normalized;
  }

  const dataMap = await loadAssetData("sentence-explanation-audio", assetIds);
  const hydrateAudio = (content: SentenceExplanationTtsAudioContent) => ({
    ...content,
    audioDataUrl: resolveCloudMediaSource(
      content.audioDataUrl ?? (content.assetId ? dataMap[content.assetId] || null : null),
      content.publicUrl,
    ),
    lineAudios:
      content.lineAudios?.map((lineAudio) => ({
        ...lineAudio,
        audioDataUrl: resolveCloudMediaSource(
          lineAudio.audioDataUrl ?? (lineAudio.assetId ? dataMap[lineAudio.assetId] || null : null),
          lineAudio.publicUrl,
        ),
      })) ?? [],
  });

  return {
    ...normalized,
    introduction: hydrateAudio(normalized.introduction),
    sections: normalized.sections.map((section) => ({
      ...section,
      content: hydrateAudio(section.content),
    })),
    conclusion: hydrateAudio(normalized.conclusion),
  };
}

async function hydrateSentenceExplanationVideo(
  video: SentenceExplanationVideoAsset | null | undefined,
) {
  const normalized = normalizeSentenceExplanationVideoAsset(video);
  if (!normalized || normalized.dataUrl || !normalized.id) {
    return normalized;
  }

  const dataMap = await loadAssetData("sentence-explanation-videos", [normalized.id]);
  return {
    ...normalized,
    dataUrl: dataMap[normalized.id] || normalized.publicUrl || "",
  };
}

async function uploadSentenceExplanationAudioContent(
  taskId: string,
  slot: ModuleId | "introduction" | "conclusion",
  content: SentenceExplanationTtsAudioContent,
) {
  const uploadSingleAudio = async (
    audioContent: SentenceExplanationTtsAudioContent | SentenceExplanationTtsLineAudio,
    lineIndex?: number,
  ) => {
    if (!audioContent.audioDataUrl || !isSupabaseConfigured()) {
      return audioContent;
    }

    const mimeType = audioContent.mimeType || extractDataUrlMimeType(audioContent.audioDataUrl) || "audio/mpeg";
    const fileName = audioContent.fileName || buildSentenceExplanationAudioFileName(slot, mimeType, lineIndex);
    const result = await uploadStorageObject("audio", taskId, fileName, audioContent.audioDataUrl);

    if (!result.success || !result.url) {
      console.warn(`Failed to upload sentence explanation audio ${fileName}.`, result.error);
      return {
        ...audioContent,
        fileName,
        mimeType,
      };
    }

    return {
      ...audioContent,
      fileName,
      mimeType,
      publicUrl: result.url,
    };
  };

  const lineAudios = await Promise.all(
    (content.lineAudios ?? []).map((lineAudio, lineIndex) => uploadSingleAudio(lineAudio, lineIndex)),
  );
  const normalizedContent = {
    ...content,
    lineAudios,
  };

  const sectionAudio = await uploadSingleAudio(normalizedContent);
  return {
    ...sectionAudio,
    lineAudios,
  };
}

async function syncSentenceExplanationTtsToCloud(taskId: string, payload: SentenceExplanationTtsResponse) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const introduction = await uploadSentenceExplanationAudioContent(taskId, "introduction", payload.introduction);
  const sections = await Promise.all(
    payload.sections.map(async (section) => ({
      ...section,
      content: await uploadSentenceExplanationAudioContent(taskId, section.moduleId, section.content),
    })),
  );
  const conclusion = await uploadSentenceExplanationAudioContent(taskId, "conclusion", payload.conclusion);

  const nextPayload: SentenceExplanationTtsResponse = {
    ...payload,
    introduction,
    sections,
    conclusion,
  };

  updateTask(taskId, (task) => ({
    ...task,
    sentenceExplanation: {
      ...normalizeSentenceExplanationState(task.sentenceExplanation),
      tts: cloneSentenceExplanationTts(nextPayload),
      updatedAt: createTimestamp(),
    },
    updatedAt: createTimestamp(),
  }));
}

async function syncSentenceExplanationVideoToCloud(
  taskId: string,
  payload: SentenceExplanationVideoAsset,
): Promise<SentenceExplanationVideoAsset | null> {
  const normalizedPayload = normalizeSentenceExplanationVideoAsset(payload);
  if (!normalizedPayload) {
    return null;
  }

  if (!normalizedPayload.dataUrl || !isSupabaseConfigured()) {
    return normalizedPayload;
  }

  const mimeType = normalizedPayload.mimeType || extractDataUrlMimeType(normalizedPayload.dataUrl) || "video/mp4";
  const fileName = buildSentenceExplanationVideoFileName(mimeType);
  const result = await uploadStorageObject("video", taskId, fileName, normalizedPayload.dataUrl);

  if (!result.success || !result.url) {
    console.warn(`Failed to upload sentence explanation video ${fileName}.`, result.error);
    const nextPayload = cloneSentenceExplanationVideo({
      ...normalizedPayload,
      fileName,
      mimeType,
    });
    updateTask(taskId, (task) => ({
      ...task,
      sentenceExplanation: {
        ...normalizeSentenceExplanationState(task.sentenceExplanation),
        video: nextPayload,
        updatedAt: createTimestamp(),
      },
      updatedAt: createTimestamp(),
    }));
    return nextPayload;
  }

  const nextPayload = cloneSentenceExplanationVideo({
    ...normalizedPayload,
    fileName,
    mimeType,
    publicUrl: result.url,
  });
  updateTask(taskId, (task) => ({
    ...task,
    sentenceExplanation: {
      ...normalizeSentenceExplanationState(task.sentenceExplanation),
      video: nextPayload,
      updatedAt: createTimestamp(),
    },
    updatedAt: createTimestamp(),
  }));
  return nextPayload;
}

export async function syncSentenceExplanationVideoToSupabase(taskId: string) {
  const task = loadTasks().find((item) => item.id === taskId);
  if (!task) {
    return { success: false, synced: false, error: "Task not found." };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, synced: false, error: "Supabase is not configured." };
  }

  const video = await hydrateSentenceExplanationVideo(task.sentenceExplanation?.video);
  if (!video) {
    return { success: false, synced: false, error: "Sentence explanation video not found." };
  }

  if (video.publicUrl) {
    return { success: true, synced: false, url: video.publicUrl };
  }

  if (!video.dataUrl) {
    return { success: false, synced: false, error: "Sentence explanation video data is unavailable." };
  }

  const syncedVideo = await syncSentenceExplanationVideoToCloud(taskId, video);
  if (!syncedVideo?.publicUrl) {
    return { success: false, synced: false, error: "Failed to sync sentence explanation video to Supabase." };
  }

  return { success: true, synced: true, url: syncedVideo.publicUrl };
}

async function removeSentenceExplanationCloudAssets(state: TaskSentenceExplanationState | undefined, taskId: string) {
  if (!isSupabaseConfigured() || !state) {
    return;
  }

  const audioFileNames = state.tts
    ? [
        state.tts.introduction.fileName,
        ...(state.tts.introduction.lineAudios?.map((lineAudio) => lineAudio.fileName) ?? []),
        ...state.tts.sections.map((section) => section.content.fileName),
        ...state.tts.sections.flatMap((section) => section.content.lineAudios?.map((lineAudio) => lineAudio.fileName) ?? []),
        state.tts.conclusion.fileName,
        ...(state.tts.conclusion.lineAudios?.map((lineAudio) => lineAudio.fileName) ?? []),
      ].filter((fileName): fileName is string => Boolean(fileName))
    : [];

  await Promise.all([
    ...audioFileNames.map((fileName) => deleteStorageObject("audio", taskId, fileName)),
    ...(state.video?.fileName ? [deleteStorageObject("video", taskId, state.video.fileName)] : []),
  ]);
}

async function hydrateTaskAssetData(tasks: Task[]) {
  return Promise.all(
    tasks.map(async (task) => ({
      ...task,
      referenceImages: await hydrateReferenceImages(task.referenceImages),
      generatedImages: await hydrateGeneratedImages(task.id, task.generatedImages),
      sentenceExplanation: {
        ...normalizeSentenceExplanationState(task.sentenceExplanation),
        tts: await hydrateSentenceExplanationTts(task.sentenceExplanation?.tts),
        video: await hydrateSentenceExplanationVideo(task.sentenceExplanation?.video),
      },
    })),
  );
}

function findTaskPreviewImage(task: Task) {
  for (const moduleId of task.modules) {
    const image = task.generatedImages[moduleId];
    if (image) {
      return { moduleId, image: normalizeGeneratedImage(image) };
    }
  }

  for (const [moduleId, image] of Object.entries(task.generatedImages)) {
    if (image) {
      return {
        moduleId: moduleId as ModuleId,
        image: normalizeGeneratedImage(image as GeneratedImage),
      };
    }
  }

  return null;
}

export async function hydrateHistoryPreviewTasks(tasks: Task[]) {
  return Promise.all(
    tasks.map(async (task) => {
      const preview = findTaskPreviewImage(task);
      if (!preview) {
        return task;
      }

      const { moduleId, image } = preview;
      if (image.dataUrl || image.publicUrl || !image.id) {
        return task;
      }

      const dataMap = await loadAssetData("generated-images", [image.id]);
      const dataUrl = resolveImageSource(
        "generated",
        task.id,
        image.fileName,
        image.dataUrl,
        dataMap[image.id] || "",
        image.publicUrl,
      );

      if (!dataUrl) {
        return task;
      }

      return {
        ...task,
        generatedImages: {
          ...task.generatedImages,
          [moduleId]: {
            ...image,
            dataUrl,
          },
        },
      };
    }),
  );
}

function mergeReferenceAssetWithCurrent(
  nextAsset: ReferenceAsset | null | undefined,
  currentAsset: ReferenceAsset | null | undefined,
) {
  const normalized = normalizeReferenceAsset(nextAsset ?? null);
  const current = normalizeReferenceAsset(currentAsset ?? null);

  if (!normalized) {
    return null;
  }

  if (!current || current.id !== normalized.id) {
    return normalized;
  }

  return {
    ...normalized,
    dataUrl: normalized.dataUrl || current.dataUrl,
    publicUrl: normalized.publicUrl || current.publicUrl,
  };
}

function mergeReferenceRecordWithCurrent(
  nextImages?: Partial<Record<ModuleId, ReferenceAsset | null>> | null,
  currentImages?: Partial<Record<ModuleId, ReferenceAsset | null>> | null,
) {
  const next = normalizeReferenceRecord(nextImages);
  const current = normalizeReferenceRecord(currentImages);

  return {
    translation: mergeReferenceAssetWithCurrent(next.translation, current.translation),
    grammar: mergeReferenceAssetWithCurrent(next.grammar, current.grammar),
    summary: mergeReferenceAssetWithCurrent(next.summary, current.summary),
    vocabulary: mergeReferenceAssetWithCurrent(next.vocabulary, current.vocabulary),
    ielts: mergeReferenceAssetWithCurrent(next.ielts, current.ielts),
  };
}

function mergeGeneratedImageWithCurrent(
  nextImage: GeneratedImage | null | undefined,
  currentImage: GeneratedImage | null | undefined,
) {
  if (!nextImage) {
    return null;
  }

  const normalized = normalizeGeneratedImage(nextImage);
  const current = currentImage ? normalizeGeneratedImage(currentImage) : null;

  if (!current || current.id !== normalized.id) {
    return normalized;
  }

  return {
    ...normalized,
    dataUrl: normalized.dataUrl || current.dataUrl,
    publicUrl: normalized.publicUrl || current.publicUrl,
  };
}

function mergeGeneratedImageRecordWithCurrent(
  nextImages?: Partial<Record<ModuleId, GeneratedImage>> | null,
  currentImages?: Partial<Record<ModuleId, GeneratedImage>> | null,
) {
  const next = normalizeGeneratedImageRecord(nextImages);
  const current = normalizeGeneratedImageRecord(currentImages);

  return Object.fromEntries(
    Object.entries(next).map(([moduleId, image]) => [
      moduleId,
      mergeGeneratedImageWithCurrent(image as GeneratedImage, current[moduleId as ModuleId] ?? null),
    ]),
  ) as Partial<Record<ModuleId, GeneratedImage>>;
}

function mergeSentenceExplanationAudioContentWithCurrent(
  nextContent: SentenceExplanationTtsAudioContent,
  currentContent: SentenceExplanationTtsAudioContent | null | undefined,
) {
  const normalized = normalizeSentenceExplanationAudioContent(nextContent);
  const current = currentContent ? normalizeSentenceExplanationAudioContent(currentContent) : null;

  if (!current) {
    return normalized;
  }

  return {
    ...normalized,
    audioDataUrl: normalized.audioDataUrl ?? current.audioDataUrl ?? null,
    assetId: normalized.assetId ?? current.assetId,
    fileName: normalized.fileName || current.fileName,
    mimeType: normalized.mimeType || current.mimeType,
    publicUrl: normalized.publicUrl || current.publicUrl,
    lineAudios: normalized.lineAudios?.map((lineAudio, lineIndex) => {
      const currentLineAudio = current.lineAudios?.[lineIndex];
      return {
        ...lineAudio,
        audioDataUrl: lineAudio.audioDataUrl ?? currentLineAudio?.audioDataUrl ?? null,
        assetId: lineAudio.assetId ?? currentLineAudio?.assetId,
        fileName: lineAudio.fileName || currentLineAudio?.fileName,
        mimeType: lineAudio.mimeType || currentLineAudio?.mimeType,
        publicUrl: lineAudio.publicUrl || currentLineAudio?.publicUrl,
      };
    }) ?? [],
  };
}

function mergeSentenceExplanationTtsWithCurrent(
  nextResponse: SentenceExplanationTtsResponse | null | undefined,
  currentResponse: SentenceExplanationTtsResponse | null | undefined,
) {
  const next = cloneSentenceExplanationTts(nextResponse);
  const current = cloneSentenceExplanationTts(currentResponse);

  if (!next) {
    return null;
  }

  if (!current) {
    return next;
  }

  const currentSectionsByModule = new Map(current.sections.map((section) => [section.moduleId, section]));

  return {
    ...next,
    introduction: mergeSentenceExplanationAudioContentWithCurrent(next.introduction, current.introduction),
    sections: next.sections.map((section) => ({
      ...section,
      content: mergeSentenceExplanationAudioContentWithCurrent(
        section.content,
        currentSectionsByModule.get(section.moduleId)?.content,
      ),
    })),
    conclusion: mergeSentenceExplanationAudioContentWithCurrent(next.conclusion, current.conclusion),
  };
}

function mergeSentenceExplanationVideoWithCurrent(
  nextVideo: SentenceExplanationVideoAsset | null | undefined,
  currentVideo: SentenceExplanationVideoAsset | null | undefined,
) {
  const normalized = normalizeSentenceExplanationVideoAsset(nextVideo);
  const current = normalizeSentenceExplanationVideoAsset(currentVideo);

  if (!normalized) {
    return null;
  }

  if (!current || current.id !== normalized.id) {
    return normalized;
  }

  return {
    ...normalized,
    dataUrl: normalized.dataUrl || current.dataUrl,
    publicUrl: normalized.publicUrl || current.publicUrl,
  };
}

function mergeSentenceExplanationStateWithCurrent(
  nextState?: TaskSentenceExplanationState | null,
  currentState?: TaskSentenceExplanationState | null,
) {
  const next = normalizeSentenceExplanationState(nextState);
  const current = normalizeSentenceExplanationState(currentState);

  return {
    ...next,
    article: cloneSentenceExplanationResponse(next.article),
    tts: mergeSentenceExplanationTtsWithCurrent(next.tts, current.tts),
    video: mergeSentenceExplanationVideoWithCurrent(next.video, current.video),
  };
}

function mergeTaskWithHydratedAssets(nextTask: Task | null, currentTask: Task | null) {
  if (!nextTask) {
    return null;
  }

  if (!currentTask || currentTask.id !== nextTask.id) {
    return nextTask;
  }

  return {
    ...nextTask,
    referenceImages: mergeReferenceRecordWithCurrent(nextTask.referenceImages, currentTask.referenceImages),
    generatedImages: mergeGeneratedImageRecordWithCurrent(nextTask.generatedImages, currentTask.generatedImages),
    sentenceExplanation: mergeSentenceExplanationStateWithCurrent(
      nextTask.sentenceExplanation,
      currentTask.sentenceExplanation,
    ),
  };
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function summarizeSentence(sentence: string) {
  return sentence.length > 72 ? `${sentence.slice(0, 72)}...` : sentence;
}

function splitByLength(text: string, chunkSize: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= chunkSize) {
      current = next;
      return;
    }

    if (current) {
      lines.push(current);
    }
    current = word;
  });

  if (current) {
    lines.push(current);
  }

  return lines;
}

function pickSplitIndex(sentence: string) {
  const candidates: number[] = [];
  const normalized = sentence.replace(/\s+/g, " ").trim();
  const center = Math.floor(normalized.length / 2);
  const patterns = [
    /,\s+/g,
    /;\s+/g,
    /\band\b\s+/gi,
    /\bbut\b\s+/gi,
    /\bor\b\s+/gi,
    /\bwhile\b\s+/gi,
    /\balthough\b\s+/gi,
    /\bbecause\b\s+/gi,
    /\bwhen\b\s+/gi,
  ];

  patterns.forEach((pattern) => {
    let match = pattern.exec(normalized);
    while (match) {
      candidates.push(match.index + match[0].length);
      match = pattern.exec(normalized);
    }
  });

  if (!candidates.length) {
    [...normalized.matchAll(/\s+/g)].forEach((item) => {
      if (typeof item.index === "number") {
        candidates.push(item.index);
      }
    });
  }

  const safeIndex = candidates.sort((left, right) => Math.abs(left - center) - Math.abs(right - center))[0];
  return safeIndex || center;
}

function splitSentence(sentence: string) {
  const normalized = sentence.replace(/\s+/g, " ").trim();
  const index = pickSplitIndex(normalized);
  const first = normalized.slice(0, index).trim().replace(/[;,]+$/, "");
  const second = normalized.slice(index).trim().replace(/^[,;]+/, "").trim();

  if (!first || !second) {
    const words = normalized.split(" ");
    const midpoint = Math.ceil(words.length / 2);
    return {
      first: words.slice(0, midpoint).join(" "),
      second: words.slice(midpoint).join(" "),
    };
  }

  return { first, second };
}

function extractKeywords(sentence: string) {
  const stopWords = new Set([
    "that",
    "this",
    "with",
    "from",
    "have",
    "were",
    "been",
    "they",
    "them",
    "into",
    "while",
    "where",
    "when",
    "which",
    "there",
    "their",
    "would",
    "could",
    "should",
    "must",
    "single",
    "truth",
  ]);

  const matches = sentence.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [];
  return Array.from(new Set(matches.filter((word) => !stopWords.has(word))));
}

function inferPartOfSpeech(word: string) {
  if (word.endsWith("ly")) return "adv.";
  if (word.endsWith("ing") || word.endsWith("ed")) return "v.";
  if (word.endsWith("tion") || word.endsWith("ment") || word.endsWith("ness")) return "n.";
  if (word.endsWith("ous") || word.endsWith("ful") || word.endsWith("ive")) return "adj.";
  return "n./adj.";
}

function buildPhonetic(word: string) {
  return `/${word}/`;
}

function inferTense(sentence: string) {
  const lower = sentence.toLowerCase();
  if (/\b(has|have|had)\b/.test(lower)) {
    return "全句使用**完成时态**，通过完成体突出动作与结果之间的延续关系。";
  }
  if (/\b(was|were|did|had)\b/.test(lower)) {
    return "全句使用**过去时态**，重点交代叙述背景与事件已经发生的事实。";
  }
  if (/\b(is|are|am|do|does)\b/.test(lower)) {
    return "全句使用**一般现在时**，用于表达稳定判断、客观认知或普遍观点。";
  }
  return "全句使用**陈述性时态**，整体语气稳定，重点放在观点与结构组织上。";
}

function inferVoice(sentence: string) {
  const lower = sentence.toLowerCase();
  if (/\b(is|are|was|were|been|being)\s+\w+ed\b/.test(lower)) {
    return "**被动语态**，强调结论被接受或对象受到动作影响。";
  }
  return "**主动语态**，由主语主动发出判断、陈述事实或承载观点。";
}

function buildStructure(sentence: string, bookName: string) {
  const summary = summarizeSentence(sentence);
  const clauses = splitSentence(summary);

  return [
    `- 主干：句子围绕“${clauses.first}”展开，先建立叙述主轴。`,
    `- 延伸：后半部分“${clauses.second}”承担补充说明或观点推进。`,
    `- 语境：结合《${bookName}》的文学表达，整体更偏书面化、评价性或叙述性语气。`,
    "- **结构总结：主句信息先立住判断，再通过后续成分完成补充、限制或修辞推进。**",
  ].join("\n");
}

function pickUniqueMatches(sentence: string, pattern: RegExp) {
  const matches = sentence.match(pattern) ?? [];
  return Array.from(new Set(matches.map((item) => item.replace(/\s+/g, " ").trim()))).slice(0, 4);
}

function fallbackVerbExamples(sentence: string) {
  const words = sentence.match(/\b[A-Za-z][A-Za-z'-]*\b/g) ?? [];
  const ignore = new Set([
    "the",
    "a",
    "an",
    "this",
    "that",
    "these",
    "those",
    "it",
    "he",
    "she",
    "they",
    "we",
    "i",
    "you",
    "and",
    "or",
    "but",
    "for",
    "with",
    "from",
    "into",
    "upon",
    "of",
    "in",
    "on",
    "at",
    "to",
    "as",
    "by",
  ]);

  return Array.from(new Set(words.filter((word) => !ignore.has(word.toLowerCase())))).slice(0, 4);
}

function joinVerbExamples(examples: string[], separator: string, fallback: string) {
  return examples.length ? examples.join(separator) : fallback;
}

function buildDetailedTense(sentence: string) {
  const lower = sentence.toLowerCase();
  const pastPerfect = pickUniqueMatches(sentence, /\bhad\s+[A-Za-z][A-Za-z'-]*(?:ed|en)\b/gi);
  if (pastPerfect.length) {
    return `全句使用**过去完成时**（${joinVerbExamples(pastPerfect, "，", "had done")}），用于描述在过去某个时间点之前已经完成或发生的动作，强调这些动作是先于后续事件存在的既定事实。`;
  }

  const presentPerfect = pickUniqueMatches(sentence, /\b(?:has|have)\s+[A-Za-z][A-Za-z'-]*(?:ed|en)\b/gi);
  if (presentPerfect.length) {
    return `全句使用**现在完成时**（${joinVerbExamples(presentPerfect, "，", "have done")}），用于强调过去动作对现在状态、结论或语境的持续影响。`;
  }

  const pastContinuous = pickUniqueMatches(sentence, /\b(?:was|were)\s+[A-Za-z][A-Za-z'-]*ing\b/gi);
  if (pastContinuous.length) {
    return `全句使用**过去进行时**（${joinVerbExamples(pastContinuous, "，", "was doing")}），用于描述过去某一时刻正在进行的动作或正在展开的场景。`;
  }

  const presentContinuous = pickUniqueMatches(sentence, /\b(?:is|are|am)\s+[A-Za-z][A-Za-z'-]*ing\b/gi);
  if (presentContinuous.length) {
    return `全句使用**现在进行时**（${joinVerbExamples(presentContinuous, "，", "is doing")}），用于描述当前正在发生的动作或正在推进的过程。`;
  }

  if (/\b(was|were|did)\b/.test(lower)) {
    const examples = pickUniqueMatches(sentence, /\b(?:was|were|did|[A-Za-z][A-Za-z'-]*ed)\b/gi);
    return `全句使用**一般过去时**（${joinVerbExamples(examples, "，", "was / did")}），用于描述过去发生的状态、动作或叙述背景。`;
  }

  if (/\b(is|are|am|do|does)\b/.test(lower)) {
    const examples = pickUniqueMatches(sentence, /\b(?:is|are|am|do|does)\b/gi);
    return `全句使用**一般现在时**（${joinVerbExamples(examples, "，", "is / do")}），用于表达普遍事实、稳定判断或当前成立的观点。`;
  }

  const examples = fallbackVerbExamples(sentence);
  return `全句使用**一般现在时**（${joinVerbExamples(examples, "，", "动词原形")}），用于概括性地表达观点、事实或句中建立的基本判断。`;
}

function buildDetailedVoice(sentence: string) {
  const passiveExamples = pickUniqueMatches(
    sentence,
    /\b(?:is|are|am|was|were|be|been|being|has been|have been|had been)\s+[A-Za-z][A-Za-z'-]*(?:ed|en)\b/gi,
  );
  if (passiveExamples.length) {
    return `**被动语态**（${joinVerbExamples(passiveExamples, " / ", "was written / were made")}）`;
  }

  const activeExamples = [
    ...pickUniqueMatches(
      sentence,
      /\b(?:has|have|had|is|are|am|was|were|do|does|did|must|should|would|could|can|will|shall|may|might)\s+[A-Za-z][A-Za-z'-]*(?:ed|en|ing)?\b/gi,
    ),
    ...fallbackVerbExamples(sentence),
  ];

  return `**主动语态**（${joinVerbExamples(Array.from(new Set(activeExamples)).slice(0, 4), " / ", "the road lay / it lumbered")}）`;
}

function buildDetailedStructure(sentence: string, bookName: string) {
  const summary = summarizeSentence(sentence);
  const clauses = splitSentence(summary);
  const predicate =
    sentence.match(
      /\b(?:is|are|am|was|were|be|been|being|do|does|did|has|have|had|must|should|would|could|can|will|shall|may|might|seems|appears|happens|happened|becomes|became)\b(?:\s+[A-Za-z][A-Za-z'-]*)?/i,
    )?.[0] ?? "谓语";
  const hasThatClause = /\bthat\b/i.test(sentence);
  const hasRelativeClause = /\b(which|who|whom|whose|where|when)\b/i.test(sentence);
  const hasCoordination = /\b(and|or|but)\b/i.test(sentence);
  const hasReason = /\b(because|for|since|as)\b/i.test(sentence);
  const subject =
    sentence
      .replace(/\s+/g, " ")
      .trim()
      .split(/\b(?:is|are|am|was|were|be|been|being|do|does|did|has|have|had|must|should|would|could|can|will|shall|may|might)\b/i)[0]
      ?.trim()
      ?.split(/\s+/)
      ?.slice(0, 6)
      ?.join(" ") || "主语";

  const summaryParts = /^it\b/i.test(sentence.trim())
    ? [
        "形式主语（It）",
        `谓语（${predicate}）`,
        hasThatClause ? "主语从句（that ...）" : "补足成分（...）",
        hasCoordination ? "并列的谓语部分（...）" : null,
        hasRelativeClause ? "定语从句（which / who / whom ...）" : null,
        hasReason ? "原因状语从句或原因成分（for / because / as ...）" : null,
      ].filter(Boolean)
    : [
        `主语（${subject}）`,
        `谓语（${predicate}）`,
        "宾语/表语（...）",
        hasThatClause ? "从句（that ...）" : null,
        hasRelativeClause ? "定语从句（which / who / whom ...）" : null,
        hasCoordination ? "并列成分（...）" : null,
        "修饰成分（介词短语 / 非谓语 / 状语 ...）",
      ].filter(Boolean);

  return [
    `- 前半句先建立主要判断或句法骨架：${clauses.first}`,
    `- 后半句继续补充说明、限制条件或推进叙述：${clauses.second}`,
    `- 结合《${bookName}》的语境，需要重点识别句中的从句、并列成分、介词短语与后置修饰。`,
    `**${summaryParts.join(" + ")}**`,
  ].join("\n");
}

function extractStructureSummaryLine(structure: string) {
  const lines = structure
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.findLast((line) => line.includes("结构总结") || /^\*\*.+\*\*$/.test(line)) ?? lines[lines.length - 1] ?? structure;
}

function extractStructureSummaryLineCompat(structure: string) {
  const lines = structure
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.includes("结构总结") || line.includes("缁撴瀯鎬荤粨") || /^\*\*.+\*\*$/.test(line)) {
      return line;
    }
  }

  return lines[lines.length - 1] ?? structure;
}

function buildVocabulary(sentence: string, bookName: string) {
  const keywords = extractKeywords(sentence);
  const fallbacks = ["acknowledged", "fortune", "context", "structure", "nuance", "rhetoric"];
  const words = Array.from(new Set([...keywords, ...fallbacks])).slice(0, 6);

  return words.map((word, index) => ({
    id: createId(`vocab-${index + 1}`),
    word,
    phonetic: buildPhonetic(word),
    partOfSpeech: inferPartOfSpeech(word),
    meaning: `结合《${bookName}》语境，这个词承担关键信息或语气色彩。`,
    example: `The word "${word}" becomes a useful anchor when explaining the sentence in class.`,
    translation: `在教学讲解中，"${word}" 可以作为拆解整句逻辑的重要抓手。`,
  }));
}

function buildIeltsTips(sentence: string, bookName: string) {
  const sample = summarizeSentence(sentence);

  return {
    listening: `听力训练时，这类长句的难点在于信息出现层次多、停顿不稳定。建议先抓住主干判断，再根据连接词定位补充信息。以《${bookName}》这句为例，先听出核心判断，再回收修饰内容，会更容易稳住理解。`,
    speaking: `口语表达中，可以借这类句式练习“先给判断、再补充理由”的展开方式。把 "${sample}" 这样的句子拆成主观点和补充说明两层，能让回答更有层次。`,
    reading: "阅读时要优先定位主句，再处理插入、修饰或从句边界。遇到文学化表达时，不要被修辞带跑，先确认句子真正的主干，再回头整合细节，速度和准确率都会更稳。",
    writing: "写作中可以模仿这种“主张 + 扩展说明”的结构，用来写论点句或背景句。尤其在 Task 2 中，把判断先立住，再补充限定条件，会比堆砌长句更自然。",
  };
}

function buildDetailedIeltsTips(sentence: string, bookName: string) {
  const sample = summarizeSentence(sentence);
  const markers = pickUniqueMatches(
    sentence,
    /\b(and|or|but|that|which|who|whom|because|for|therefore|as well as|either|neither|not only)\b/gi,
  );
  const actions = pickUniqueMatches(
    sentence,
    /\b(?:has|have|had|is|are|am|was|were|do|does|did|must|should|would|could|can|will|shall|may|might)\s+[A-Za-z][A-Za-z'-]*(?:ed|en|ing)?\b/gi,
  );
  const keywords = extractKeywords(sentence).slice(0, 5);
  const markerText = joinVerbExamples(markers, "、", "and、that、which 等逻辑连接词");
  const actionText = joinVerbExamples(actions, "、", "核心动作链");
  const keywordText = joinVerbExamples(keywords, "、", "关键信息词");
  const coreClause = sentence.replace(/\s+/g, " ").trim().split(/,\s*|\band\b/i)[0]?.trim() || sample;

  return {
    listening: `在听力考试中，此类长句的难点在于信息层次多、动作链长，而且 ${markerText} 这类逻辑信号往往夹在连续语流中出现。考生需要一边听一边先抓主干，再根据连接词判断并列、因果或补充说明关系，同时把 ${actionText} 这样的核心动作快速记成笔记框架。对于 ${keywordText} 这类不一定高频的词汇，也要优先结合上下文推断其角色和大意，这样更容易稳定地还原整句信息。`,
    speaking: `这个句式在口语中适合用于讲述一次准备充分的经历、说明某件事情如何一步步推进，或描述带有背景铺垫的个人故事。考生可以模仿先交代核心事件、再逐步补充动作和细节的表达方式，例如围绕 ${actionText} 这样的动作链去扩展答案，让故事更有条理和画面感。像 "${sample}" 这样的长句如果能拆成“主事件 + 补充说明 + 结果或目的”三层，在 Part 2 和 Part 3 的叙述里会更自然。`,
    reading: `阅读此类长难句时，应首先识别主干 "${coreClause}"，明确句子的核心事件或判断。然后，再顺着 ${markerText} 逐层拆分后续并列成分、修饰语和从句，判断它们分别是在补充人物、动作、目的还是背景信息。最后，把 ${keywordText} 这类关键词放回《${bookName}》的语境中统一理解，就能更快把握整句的主要信息和细节层次。`,
    writing: `这个句式在写作中很适合用于描述一系列相互关联的动作、交代事件背景，或在论述中展示清晰的层次推进。可以借鉴它先立主干、再补充并列动作和修饰信息的写法，并通过 ${markerText} 这类连接手段把逻辑关系写得更清楚。无论是议论文中说明计划和论证步骤，还是流程描述、经历叙述中展现事件展开过程，这种结构都能让表达更严谨，也更能体现复杂句控制能力。`,
  };
}

function formatQuotedWords(values: string[], fallback: string) {
  return values.length ? values.map((value) => `“${value}”`).join("、") : fallback;
}

function detectIeltsSentenceShape(sentence: string, actions: string[], markers: string[]) {
  const features: string[] = [];
  if (actions.length >= 3) {
    features.push("长串并列动作");
  } else if (actions.length >= 2) {
    features.push("连续动作顺序");
  }
  if (/\b(which|who|whom|that|when|where)\b/i.test(sentence)) {
    features.push("多个从句");
  }
  if (/\bfor\b/i.test(sentence)) {
    features.push("目的状语或原因成分");
  }
  if (/\bwith\b/i.test(sentence)) {
    features.push("伴随状态描述");
  }
  if (/;/.test(sentence)) {
    features.push("分号连接的多个意群");
  }
  if (!features.length && markers.length) {
    features.push("多层逻辑连接");
  }

  return features.length ? features.join("和") : "信息层级复杂";
}

function detectSpeakingStarter(sentence: string) {
  const normalized = sentence.replace(/\s+/g, " ").trim();
  if (/\bIt happened that\b/i.test(normalized)) {
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

function detectWritingBorrowPattern(sentence: string) {
  if (/\bwith\s+[A-Za-z][A-Za-z'-]*\s+[A-Za-z][A-Za-z'-]*ed\b/i.test(sentence)) {
    return "with + 宾语 + 补足语";
  }
  if (/;/.test(sentence)) {
    return "分号连接相关意群";
  }
  if (/\b(?:has|have|had)\s+[A-Za-z][A-Za-z'-]*(?:ed|en)\b/i.test(sentence)) {
    return "完成时表达时间先后";
  }
  return "主干先行、细节递进的复杂句结构";
}

function buildExampleStyleIeltsTips(sentence: string, bookName: string) {
  const sample = summarizeSentence(sentence);
  const markers = pickUniqueMatches(
    sentence,
    /\b(and|or|but|that|which|who|whom|because|for|therefore|as well as|either|neither|not only|when|with)\b/gi,
  );
  const actions = pickUniqueMatches(
    sentence,
    /\b(?:has|have|had|is|are|am|was|were|do|does|did|must|should|would|could|can|will|shall|may|might)\s+[A-Za-z][A-Za-z'-]*(?:ed|en|ing)?\b/gi,
  );
  const keywords = extractKeywords(sentence).slice(0, 5);
  const markerText = formatQuotedWords(markers, "“and”、“that”、“which”等逻辑连接词");
  const actionText = formatQuotedWords(actions, "关键动作链");
  const keywordText = formatQuotedWords(keywords, "关键信息词");
  const shapeText = detectIeltsSentenceShape(sentence, actions, markers);
  const coreClause = sentence.replace(/\s+/g, " ").trim().split(/,\s*|\band\b/i)[0]?.trim() || sample;
  const speakingStarter = detectSpeakingStarter(sentence);
  const writingPattern = detectWritingBorrowPattern(sentence);

  return {
    listening: `在听力考试中，这类包含${shapeText}的句子是Section 3或4学术对话或独白的典型难点。考生需要注意${markerText}等连词构建的逻辑关系，以及${keywordText}等关键信息。建议采用预判关键词（如${actionText}）和梳理事件链条的听力策略，忽略个别生僻词，把握整体叙事流。`,
    speaking: `这个句式在口语表达中可以用于描述${shapeText.includes("多从句") || shapeText.includes("插入语") ? "个人经历中一段复杂的、有多步骤和转折的事件" : "一段包含多个动作或细节的事件"}。考生可以模仿"${speakingStarter}"的框架，来清晰、有条理地讲述故事。在Part 2描述事件类话题时，这种能体现时间顺序和细节的句式非常实用，能有效展示语言组织能力。`,
    reading: `阅读此类${shapeText}的长难句时，应首先识别主干（${coreClause}），然后利用${markerText}将长句拆解为几个逻辑部分。关键是理解这些从句和修饰成分的关系，这样便可以快速准确地理解句意，避免在细节中迷失。`,
    writing: `这个句式可以用于写作Task 2举例论证中描述过程。通过使用${writingPattern}的结构，可以在主句之外高效地补充细节状态。模仿其用${markerText}引入转折事件的方法，能够有效提升文章句式的多样性和逻辑层次感，建议在需要叙述事件发展或描述多步骤过程的文章中使用。`,
  };
}

function buildTranslation(first: string, second: string, bookName: string, author: string) {
  return `《${bookName}》中这句话的大意是：前半句先抛出一个带有文学判断色彩的观点，后半句再补充人物处境与叙事意味。整体延续了 ${author} 的书面表达风格。`;
}

function buildSegmentTranslations() {
  return {
    prompt2: "",
    prompt4: "",
  };
}

function buildTextContent(sentence: string, bookName: string, author: string): TextContent {
  const segments = splitSentence(sentence);
  const translation = buildTranslation(segments.first, segments.second, bookName, author);
  const segmentTranslations = buildSegmentTranslations();

  return {
    translation,
    prompt1: segments.first,
    prompt2: segmentTranslations.prompt2,
    prompt3: segments.second,
    prompt4: segmentTranslations.prompt4,
    grammar: {
      tense: buildDetailedTense(sentence),
      voice: buildDetailedVoice(sentence),
      structure: buildDetailedStructure(sentence, bookName),
    },
    vocabulary: buildVocabulary(sentence, bookName),
    ielts: buildExampleStyleIeltsTips(sentence, bookName),
  };
}

function lineGroup(text: string, limit = 26, count = 4) {
  return splitByLength(text, limit).slice(0, count);
}

function buildSourceText(task: Task, moduleId: ModuleId) {
  if (moduleId === "translation") {
    return [task.textContent.prompt1, task.textContent.prompt2, task.textContent.prompt3, task.textContent.prompt4].join("\n");
  }

  if (moduleId === "grammar" || moduleId === "summary") {
    return [task.textContent.grammar.tense, task.textContent.grammar.voice, task.textContent.grammar.structure].join("\n");
  }

  if (moduleId === "vocabulary") {
    return task.textContent.vocabulary
      .map(
        (item, index) =>
          `${index + 1}. ${item.word} ${item.phonetic}\n词性：${item.partOfSpeech}\n释义：${item.meaning}\n例句：${item.example}\n译文：${item.translation}`,
      )
      .join("\n\n");
  }

  return Object.entries(task.textContent.ielts)
    .map(([key, value]) => `${key}\n${value}`)
    .join("\n\n");
}

function createPanelText(task: Task, moduleId: ModuleId) {
  if (moduleId === "translation") {
    return [
      "Prompt 1",
      task.textContent.prompt1,
      "Prompt 2",
      task.textContent.prompt2,
      "Prompt 3",
      task.textContent.prompt3,
      "Prompt 4",
      task.textContent.prompt4,
    ];
  }

  if (moduleId === "summary") {
    const summaryLine = extractStructureSummaryLineCompat(task.textContent.grammar.structure);
    return ["核心主干", task.textContent.grammar.tense, "结构总结", summaryLine];
  }

  if (moduleId === "grammar") {
    return ["时态分析", task.textContent.grammar.tense, "语态识别", task.textContent.grammar.voice, "结构拆解", task.textContent.grammar.structure];
  }

  if (moduleId === "summary") {
    const summaryLine = task.textContent.grammar.structure.split("\n").find((item) => item.includes("结构总结")) ?? task.textContent.grammar.structure;
    return ["核心主干", task.textContent.grammar.tense, "结构总结", summaryLine];
  }

  if (moduleId === "vocabulary") {
    return task.textContent.vocabulary.flatMap((item) => [item.word, item.meaning]);
  }

  return [
    "听力",
    task.textContent.ielts.listening,
    "口语",
    task.textContent.ielts.speaking,
    "阅读",
    task.textContent.ielts.reading,
    "写作",
    task.textContent.ielts.writing,
  ];
}

function createSvgImage(task: Task, moduleId: ModuleId) {
  const moduleMeta = moduleMetaList.find((item) => item.id === moduleId);
  const accentMap: Record<ModuleId, string> = {
    translation: "#1d4ed8",
    grammar: "#0f766e",
    summary: "#8b5cf6",
    vocabulary: "#d97706",
    ielts: "#dc2626",
  };
  const panels = createPanelText(task, moduleId);
  const panelRows: string[] = [];

  for (let index = 0; index < panels.length; index += 2) {
    const y = 248 + (index / 2) * 162;
    const title = panels[index];
    const body = panels[index + 1] ?? "";
    const lines = lineGroup(body.replace(/\n/g, " "), 24, 4);
    const lineMarkup = lines
      .map((line, lineIndex) => `<text x="72" y="${y + 58 + lineIndex * 26}" font-size="20" fill="#334155">${escapeXml(line)}</text>`)
      .join("");

    panelRows.push(
      `<rect x="48" y="${y}" width="864" height="136" rx="24" fill="#ffffff" stroke="#e2e8f0"/>
       <text x="72" y="${y + 30}" font-size="24" font-weight="700" fill="${accentMap[moduleId]}">${escapeXml(title)}</text>
       ${lineMarkup}`,
    );
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="1280" viewBox="0 0 960 1280">
      <rect width="960" height="1280" rx="40" fill="#f8f5ee"/>
      <rect x="32" y="32" width="896" height="1216" rx="34" fill="#fffdf8" stroke="#e7ddcf"/>
      <rect x="48" y="48" width="864" height="152" rx="28" fill="${accentMap[moduleId]}"/>
      <text x="72" y="102" font-size="22" fill="#ffffff" opacity="0.9">English Flow Agent</text>
      <text x="72" y="146" font-size="42" font-weight="700" fill="#ffffff">${escapeXml(moduleMeta?.title ?? "")}</text>
      <text x="72" y="182" font-size="22" fill="#ffffff" opacity="0.9">${escapeXml(task.bookName)} · ${escapeXml(task.author)}</text>
      <text x="72" y="226" font-size="24" fill="#0f172a">${escapeXml(summarizeSentence(task.sentence))}</text>
      ${panelRows.join("")}
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createGeneratedImage(task: Task, moduleId: ModuleId): GeneratedImage {
  const meta = moduleMetaList.find((item) => item.id === moduleId);
  const now = createTimestamp();

  return {
    id: createId(`image-${moduleId}`),
    imageType: moduleId,
    title: meta?.title ?? moduleId,
    subtitle: `基于${meta?.dependsOn ?? "文本内容"}生成`,
    sourceText: buildSourceText(task, moduleId),
    fileName: buildGeneratedImageFileName(task.bookName, moduleId, now.slice(0, 10)),
    dataUrl: createSvgImage(task, moduleId),
    createdAt: now,
  };
}

function parsingSteps(): TaskStep[] {
  return parsingStepsForModules(defaultModules);
}

export function getRequiredTextAnalysisModes(modules: ModuleId[]): TextAnalysisMode[] {
  const orderedModes: TextAnalysisMode[] = [];

  modules.forEach((moduleId) => {
    moduleAnalysisModeMap[moduleId].forEach((mode) => {
      if (!orderedModes.includes(mode)) {
        orderedModes.push(mode);
      }
    });
  });

  return orderedModes;
}

function buildParsingSteps(
  modules: ModuleId[],
  options: {
    completedModes?: TextAnalysisMode[];
    runningMode?: TextAnalysisMode | null;
  } = {},
) {
  const orderedModes = getRequiredTextAnalysisModes(modules);
  const completedModes = options.completedModes ?? orderedModes;
  const completedModeSet = new Set(completedModes);
  const runningMode =
    options.runningMode === undefined
      ? orderedModes.find((mode) => !completedModeSet.has(mode)) ?? null
      : options.runningMode;

  return orderedModes.map((mode) => ({
    id: analysisStepDefinitions[mode].id,
    stage: "parsing",
    label: analysisStepDefinitions[mode].label,
    status: completedModeSet.has(mode) ? "done" : runningMode === mode ? "running" : "pending",
  })) satisfies TaskStep[];
}

function parsingStepsForModules(modules: ModuleId[]): TaskStep[] {
  return buildParsingSteps(modules);
}

function parsingStepsInProgress(modules: ModuleId[], completedModes: TextAnalysisMode[] = []) {
  return buildParsingSteps(modules, {
    completedModes,
  });
}

function generationSteps(modules: ModuleId[]): TaskStep[] {
  return modules.map((moduleId) => ({
    id: `generate-${moduleId}`,
    stage: "generation",
    label: `生成${moduleMetaList.find((item) => item.id === moduleId)?.title ?? moduleId}`,
    status: "pending",
    moduleId,
  }));
}

function computeProgress(steps: TaskStep[]) {
  const total = steps.length;
  const done = steps.filter((step) => step.status === "done").length;
  return total ? Math.round((done / total) * 100) : 0;
}

function normalizeInput(input: TaskInput): TaskInput {
  return {
    ...input,
    sentence: input.sentence.trim(),
    bookName: input.bookName.trim(),
    author: input.author.trim(),
    modules: input.modules.length ? input.modules : [...defaultModules],
  };
}

function normalizeSegmentationPanels(textContent: TextContent): TextContent {
  const panels = prepareTranslationImagePanels({
    originSentence: "",
    prompt1: textContent.prompt1,
    prompt2: textContent.prompt2,
    prompt3: textContent.prompt3,
    prompt4: textContent.prompt4,
  });

  return {
    ...textContent,
    prompt1: panels.prompt1,
    prompt2: panels.prompt2,
    prompt3: panels.prompt3,
    prompt4: panels.prompt4,
  };
}

function cloneTextContent(textContent: TextContent): TextContent {
  const normalized = normalizeSegmentationPanels(textContent);

  return {
    ...normalized,
    grammar: { ...normalized.grammar },
    vocabulary: normalized.vocabulary.map((item) => ({ ...item })),
    ielts: { ...normalized.ielts },
  };
}

function cloneGeneratedImage(image: GeneratedImage): GeneratedImage {
  return {
    ...image,
    id: createId(`generated-${image.imageType}`),
  };
}

function cloneGeneratedImages(
  images: Partial<Record<ModuleId, GeneratedImage>>,
  modules: ModuleId[],
): Partial<Record<ModuleId, GeneratedImage>> {
  return Object.fromEntries(
    modules
      .map((moduleId) => [moduleId, images[moduleId]])
      .filter((entry): entry is [ModuleId, GeneratedImage] => Boolean(entry[1]))
      .map(([moduleId, image]) => [moduleId, cloneGeneratedImage(image)]),
  ) as Partial<Record<ModuleId, GeneratedImage>>;
}

function createStableHash(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
}

function buildLegacyTaskWorkflowId(task: Task) {
  const generatedImageSignature = Object.entries(normalizeGeneratedImageRecord(task.generatedImages))
    .filter((entry): entry is [string, GeneratedImage] => Boolean(entry[1]))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([moduleId, image]) =>
      JSON.stringify({
        moduleId,
        fileName: image.fileName,
        publicUrl: image.publicUrl ?? "",
        createdAt: image.createdAt,
        title: image.title,
        subtitle: image.subtitle,
        sourceText: image.sourceText,
      }),
    );

  if (!generatedImageSignature.length) {
    return `legacy:${task.id}`;
  }

  return `legacy:${createStableHash(
    JSON.stringify({
      sentence: task.sentence,
      bookName: task.bookName,
      author: task.author,
      modules: task.modules,
      flowMode: task.flowMode,
      generatedImageSignature,
    }),
  )}`;
}

export function getTaskWorkflowId(task: Task) {
  return task.workflowId || buildLegacyTaskWorkflowId(task);
}

function hasGeneratedImageData(task: Task) {
  return Object.values(task.generatedImages ?? {}).some((image) => Boolean(image?.dataUrl || image?.publicUrl || image?.id));
}

function compareTaskWorkflowRecency(left: Task, right: Task) {
  const updatedCompare = (right.updatedAt || right.createdAt).localeCompare(left.updatedAt || left.createdAt);
  if (updatedCompare !== 0) {
    return updatedCompare;
  }

  const createdCompare = right.createdAt.localeCompare(left.createdAt);
  if (createdCompare !== 0) {
    return createdCompare;
  }

  const routeRank = (route: TaskResumeRoute) => {
    switch (route) {
      case "video":
        return 4;
      case "explanation":
        return 3;
      case "result":
        return 2;
      case "edit":
        return 1;
      default:
        return 0;
    }
  };

  return routeRank(resolveTaskResumeRoute(right)) - routeRank(resolveTaskResumeRoute(left));
}

export function resolveTaskResumeRoute(task: Task): TaskResumeRoute {
  const sentenceExplanation = normalizeSentenceExplanationState(task.sentenceExplanation);
  const hasSentenceExplanationVideo = Boolean(sentenceExplanation.video) || sentenceExplanation.stage === "video";
  const hasSentenceExplanationContent =
    Boolean(sentenceExplanation.article || sentenceExplanation.tts) ||
    sentenceExplanation.stage === "article" ||
    sentenceExplanation.stage === "tts";

  if (hasSentenceExplanationVideo) {
    return "video";
  }

  if (hasSentenceExplanationContent) {
    return "explanation";
  }

  if (task.resumeRoute === "result" && (task.status === "completed" || hasGeneratedImageData(task))) {
    return "result";
  }

  if (task.resumeRoute === "edit" && (task.status === "parsed" || task.status === "edited")) {
    return "edit";
  }

  if (task.status === "completed" || hasGeneratedImageData(task)) {
    return "result";
  }

  if (task.status === "parsed" || task.status === "edited") {
    return "edit";
  }

  return "task";
}

export function getTaskResumePath(task: Task) {
  const route = resolveTaskResumeRoute(task);

  switch (route) {
    case "edit":
      return `/edit/${task.id}`;
    case "result":
      return `/result/${task.id}`;
    case "explanation":
      return `/explanation/${task.id}`;
    case "video":
      return `/explanation/${task.id}/video`;
    default:
      return `/task/${task.id}`;
  }
}

export function getTaskWorkflowTasks(tasks: Task[], taskOrId: string | Task) {
  const sourceTask =
    typeof taskOrId === "string"
      ? tasks.find((task) => task.id === taskOrId) ?? null
      : taskOrId;

  if (!sourceTask) {
    return [] as Task[];
  }

  const workflowId = getTaskWorkflowId(sourceTask);
  return tasks
    .filter((task) => getTaskWorkflowId(task) === workflowId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.updatedAt.localeCompare(right.updatedAt));
}

export function getLatestTaskInWorkflow(tasks: Task[], taskOrId: string | Task) {
  const workflowTasks = getTaskWorkflowTasks(tasks, taskOrId);
  if (!workflowTasks.length) {
    return null;
  }

  return [...workflowTasks].sort(compareTaskWorkflowRecency)[0] ?? null;
}

export function getHistoryTasks(tasks: Task[]) {
  const latestByWorkflow = new Map<string, Task>();

  for (const task of tasks) {
    const workflowId = getTaskWorkflowId(task);
    const current = latestByWorkflow.get(workflowId);
    if (!current || compareTaskWorkflowRecency(task, current) < 0) {
      latestByWorkflow.set(workflowId, task);
    }
  }

  return Array.from(latestByWorkflow.values()).sort(compareTaskWorkflowRecency);
}

function ensureStepConsistency(task: Task): Task {
  const baseSteps = [...parsingStepsForModules(task.modules), ...generationSteps(task.modules)];
  const stepMap = new Map(task.steps.map((step) => [step.id, step]));
  const steps = baseSteps.map((step) => {
    const saved = stepMap.get(step.id);
    return saved ? { ...step, ...saved } : step;
  });

  return {
    ...task,
    referenceImages: normalizeReferenceRecord({ ...emptyReferenceRecord(), ...task.referenceImages }),
    generatedImages: normalizeGeneratedImageRecord(task.generatedImages ?? {}),
    sentenceExplanation: normalizeSentenceExplanationState(task.sentenceExplanation),
    resumeRoute: resolveTaskResumeRoute(task),
    steps,
    progress: computeProgress(steps),
  };
}

function emitTaskUpdate() {
  if (!hasWindow()) return;
  window.dispatchEvent(new Event(TASKS_UPDATED_EVENT));
}

export function saveTasks(tasks: Task[]) {
  if (!hasWindow()) return;
  const normalizedTasks = tasks.map((task) =>
    ensureStepConsistency({
      ...task,
      textContent: cloneTextContent(task.textContent),
    }),
  );

  writeTasksToLocalStorage(normalizedTasks);

  void persistTaskAssetData(normalizedTasks)
    .then(() => emitTaskUpdate())
    .catch((error) => {
      console.error("Failed to persist task image assets.", error);
    });

  void syncTasksToSupabase(normalizedTasks).catch((error) => {
    console.error("Failed to sync task snapshots to Supabase.", error);
  });
}

export function loadTasks() {
  if (!hasWindow()) return [] as Task[];
  const raw = window.localStorage.getItem(TASKS_KEY);
  if (!raw) return [] as Task[];

  try {
    const parsed = JSON.parse(raw) as Task[];
    return parsed
      .map((task) =>
        ensureStepConsistency({
          ...task,
          textContent: cloneTextContent(task.textContent),
        }),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } catch {
    return [] as Task[];
  }
}

export function loadModulePrefs() {
  if (!hasWindow()) return [...defaultModules];
  const raw = window.localStorage.getItem(MODULE_PREFS_KEY);
  if (!raw) return [...defaultModules];

  try {
    const parsed = JSON.parse(raw) as ModuleId[];
    return parsed.length ? parsed : [...defaultModules];
  } catch {
    return [...defaultModules];
  }
}

export function saveModulePrefs(modules: ModuleId[]) {
  if (!hasWindow()) return;
  window.localStorage.setItem(MODULE_PREFS_KEY, JSON.stringify(modules));
}

export function loadReferenceLibrary() {
  if (!hasWindow()) return emptyReferenceRecord();
  const raw = window.localStorage.getItem(REFERENCES_KEY);
  if (!raw) return emptyReferenceRecord();

  try {
    return normalizeReferenceRecord({ ...emptyReferenceRecord(), ...(JSON.parse(raw) as Record<ModuleId, ReferenceAsset | null>) });
  } catch {
    return emptyReferenceRecord();
  }
}

export function saveReferenceLibrary(images: Record<ModuleId, ReferenceAsset | null>) {
  if (!hasWindow()) return;
  const normalized = normalizeReferenceRecord(images);
  window.localStorage.setItem(REFERENCES_KEY, JSON.stringify(stripReferenceRecordData(normalized)));
  emitTaskUpdate();

  void persistReferenceAssetData(normalized)
    .then(() => emitTaskUpdate())
    .catch((error) => {
      console.error("Failed to persist reference image assets.", error);
    });
}

export async function loadReferenceLibraryWithData() {
  return hydrateReferenceImages(loadReferenceLibrary());
}

export function validateReferenceFile(file: File) {
  const validTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!validTypes.includes(file.type)) {
    return "仅支持 JPG、PNG、WEBP 图片。";
  }
  if (file.size > REFERENCE_IMAGE_SIZE_LIMIT_BYTES) {
    return "单张图片不能超过 20MB。";
  }
  return null;
}

export function fileToReferenceAsset(file: File, moduleId: ModuleId) {
  return new Promise<ReferenceAsset>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: createId(`reference-${moduleId}`),
        imageType: moduleId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        dataUrl: String(reader.result),
        uploadedAt: createTimestamp(),
      });
    };
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks());

  useEffect(() => {
    const handle = () => setTasks(loadTasks());
    let cancelled = false;

    const restore = async () => {
      const restoredTasks = await restoreTasksFromSupabaseIntoLocal();
      if (!cancelled) {
        setTasks(restoredTasks);
      }
    };

    void restore();
    window.addEventListener(TASKS_UPDATED_EVENT, handle);
    return () => {
      cancelled = true;
      window.removeEventListener(TASKS_UPDATED_EVENT, handle);
    };
  }, []);

  return tasks;
}

export function useTask(taskId?: string) {
  const tasks = useTasks();
  return useMemo(() => tasks.find((task) => task.id === taskId) ?? null, [taskId, tasks]);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片解码失败"));
    image.src = dataUrl;
  });
}

async function optimizeReferenceImage(file: File) {
  const originalDataUrl = await readFileAsDataUrl(file);
  if (file.size <= REFERENCE_IMAGE_OPTIMIZE_THRESHOLD_BYTES || typeof document === "undefined") {
    return {
      dataUrl: originalDataUrl,
      fileSize: file.size,
      mimeType: file.type,
    };
  }

  const image = await loadImageElement(originalDataUrl);
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = longestEdge > REFERENCE_IMAGE_MAX_EDGE ? REFERENCE_IMAGE_MAX_EDGE / longestEdge : 1;

  if (scale === 1) {
    return {
      dataUrl: originalDataUrl,
      fileSize: file.size,
      mimeType: file.type,
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");

  if (!context) {
    return {
      dataUrl: originalDataUrl,
      fileSize: file.size,
      mimeType: file.type,
    };
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const mimeType = file.type === "image/png" ? "image/webp" : file.type || "image/webp";
  const dataUrl = canvas.toDataURL(mimeType, 0.92);
  const optimizedBlob = await fetch(dataUrl).then((response) => response.blob());

  return {
    dataUrl,
    fileSize: optimizedBlob.size,
    mimeType,
  };
}

export function fileToReferenceAssetOptimized(file: File, moduleId: ModuleId) {
  return optimizeReferenceImage(file).then((optimized) => ({
    id: createId(`reference-${moduleId}`),
    imageType: moduleId,
    fileName: file.name,
    fileSize: optimized.fileSize,
    mimeType: optimized.mimeType,
    dataUrl: optimized.dataUrl,
    uploadedAt: createTimestamp(),
  }));
}

export function useHydratedTasks() {
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks());

  useEffect(() => {
    let cancelled = false;

    const syncTasks = async () => {
      const nextTasks = loadTasks();
      if (cancelled) return;
      setTasks((current) => {
        const currentById = new Map(current.map((task) => [task.id, task]));
        return nextTasks.map((task) => mergeTaskWithHydratedAssets(task, currentById.get(task.id) ?? null) ?? task);
      });

      const hydratedTasks = await hydrateTaskAssetData(nextTasks);
      if (!cancelled) {
        setTasks((current) => {
          const currentById = new Map(current.map((task) => [task.id, task]));
          return hydratedTasks.map((task) => mergeTaskWithHydratedAssets(task, currentById.get(task.id) ?? null) ?? task);
        });
      }
    };

    const restore = async () => {
      await restoreTasksFromSupabaseIntoLocal();
      if (!cancelled) {
        await syncTasks();
      }
    };

    const handle = () => {
      void syncTasks();
    };

    void syncTasks();
    void restore();
    window.addEventListener(TASKS_UPDATED_EVENT, handle);
    return () => {
      cancelled = true;
      window.removeEventListener(TASKS_UPDATED_EVENT, handle);
    };
  }, []);

  return tasks;
}

export function useHydratedTask(taskId?: string) {
  const [task, setTask] = useState<Task | null>(() => {
    if (!taskId) {
      return null;
    }

    return loadTasks().find((item) => item.id === taskId) ?? null;
  });

  useEffect(() => {
    let cancelled = false;

    const syncTask = async () => {
      if (!taskId) {
        if (!cancelled) {
          setTask(null);
        }
        return;
      }

      const nextTask = loadTasks().find((item) => item.id === taskId) ?? null;
      if (cancelled) {
        return;
      }

      setTask((current) => mergeTaskWithHydratedAssets(nextTask, current));

      if (!nextTask) {
        return;
      }

      const hydratedTask: Task = {
        ...nextTask,
        referenceImages: await hydrateReferenceImages(nextTask.referenceImages),
        generatedImages: await hydrateGeneratedImages(nextTask.id, nextTask.generatedImages),
        sentenceExplanation: {
          ...normalizeSentenceExplanationState(nextTask.sentenceExplanation),
          tts: await hydrateSentenceExplanationTts(nextTask.sentenceExplanation?.tts),
          video: await hydrateSentenceExplanationVideo(nextTask.sentenceExplanation?.video),
        },
      };

      if (!cancelled) {
        setTask((current) => mergeTaskWithHydratedAssets(hydratedTask, current));
      }
    };

    const restore = async () => {
      await restoreTasksFromSupabaseIntoLocal();
      if (!cancelled) {
        await syncTask();
      }
    };

    const handle = () => {
      void syncTask();
    };

    void syncTask();
    void restore();
    window.addEventListener(TASKS_UPDATED_EVENT, handle);

    return () => {
      cancelled = true;
      window.removeEventListener(TASKS_UPDATED_EVENT, handle);
    };
  }, [taskId]);

  return task;
}

function createTaskRecord(input: TaskInput, flowMode: FlowMode, options: TaskCreationOptions = {}): Task {
  const normalized = normalizeInput(input);
  const textContent = cloneTextContent(options.textContent ?? buildTextContent(normalized.sentence, normalized.bookName, normalized.author));
  const taskId = createId("task");
  const createdAt = createTimestamp();
  const steps = [...parsingStepsForModules(normalized.modules), ...generationSteps(normalized.modules)];

  return {
    id: taskId,
    workflowId: taskId,
    sentence: normalized.sentence,
    bookName: normalized.bookName,
    author: normalized.author,
    modules: normalized.modules,
    referenceImages: { ...normalized.referenceImages },
    textContent,
    generatedImages: {},
    steps,
    logs: [
      {
        id: createId("log"),
        level: "success",
        message: "文本解析已完成，可继续编辑或启动图像生成。",
        createdAt,
      },
    ],
    status: flowMode === "text" ? "parsed" : "generating",
    progress: computeProgress(steps),
    currentStage: flowMode === "text" ? "edit" : "generation",
    flowMode,
    analysisSource: options.analysisSource ?? "local-mock",
    analysisModel: options.analysisModel,
    sentenceExplanation: createEmptySentenceExplanationState(),
    resumeRoute: flowMode === "text" ? "edit" : "task",
    createdAt,
    updatedAt: createdAt,
  };
}

function createQueuedTaskRecord(input: TaskInput, flowMode: FlowMode): Task {
  const normalized = normalizeInput(input);
  const taskId = createId("task");
  const createdAt = createTimestamp();
  const steps = [...parsingStepsInProgress(normalized.modules), ...generationSteps(normalized.modules)];

  return {
    id: taskId,
    workflowId: taskId,
    sentence: normalized.sentence,
    bookName: normalized.bookName,
    author: normalized.author,
    modules: normalized.modules,
    referenceImages: { ...normalized.referenceImages },
    textContent: cloneTextContent(buildTextContent(normalized.sentence, normalized.bookName, normalized.author)),
    generatedImages: {},
    steps,
    logs: [
      {
        id: createId("log"),
        level: "info",
        message: "文本解析队列已启动，系统正在进入解析页面并准备生成内容。",
        createdAt,
      },
    ],
    status: "parsing",
    progress: computeProgress(steps),
    currentStage: "parsing",
    flowMode,
    sentenceExplanation: createEmptySentenceExplanationState(),
    resumeRoute: "task",
    createdAt,
    updatedAt: createdAt,
  };
}

function prepareGenerationSteps(task: Task, targetModules: ModuleId[]) {
  const targetSet = new Set(targetModules);
  let started = false;

  return task.steps.map((step) => {
    if (step.stage !== "generation" || !step.moduleId || !targetSet.has(step.moduleId)) {
      return step;
    }

    if (!started) {
      started = true;
      return { ...step, status: "running" as StepStatus };
    }

    return { ...step, status: "pending" as StepStatus };
  });
}

function startGenerationState(task: Task, targetModules: ModuleId[] = task.modules) {
  const updatedSteps = prepareGenerationSteps(task, targetModules);

  return {
    ...task,
    steps: updatedSteps,
    status: "generating" as TaskStatus,
    currentStage: "generation" as const,
    updatedAt: createTimestamp(),
    logs: [
      ...task.logs,
      {
        id: createId("log"),
        level: "info",
        message: "图像生成队列已启动，系统将按模块依次生成条漫。",
        createdAt: createTimestamp(),
      },
    ],
  };
}

function cloneTask(
  task: Task,
  modules: ModuleId[],
  referenceImages: Record<ModuleId, ReferenceAsset | null>,
  textContent: TextContent,
) {
  const taskId = createId("task");
  const createdAt = createTimestamp();
  const steps = [...parsingStepsForModules(modules), ...generationSteps(modules)];

  return {
    ...task,
    id: taskId,
    workflowId: taskId,
    modules,
    referenceImages: { ...referenceImages },
    textContent: cloneTextContent(textContent),
    generatedImages: {},
    steps,
    logs: [
      {
        id: createId("log"),
        level: "info",
        message: "已基于历史任务创建新的生成任务。",
        createdAt,
      },
    ],
    status: "generating" as TaskStatus,
    progress: computeProgress(steps),
    currentStage: "generation" as const,
    flowMode: "all" as FlowMode,
    sentenceExplanation: createEmptySentenceExplanationState(),
    resumeRoute: "task" as TaskResumeRoute,
    createdAt,
    updatedAt: createdAt,
    completedAt: undefined,
  };
}

export async function createParsedTask(input: TaskInput, options: TaskCreationOptions = {}) {
  const task = options.textContent ? createTaskRecord(input, "text", options) : createQueuedTaskRecord(input, "text");
  await persistReferenceAssetData(task.referenceImages);
  saveTasks([task, ...loadTasks()]);
  return task;
}

export function updateTask(taskId: string, updater: (task: Task) => Task) {
  const tasks = loadTasks();
  const updated = tasks.map((task) => (task.id === taskId ? ensureStepConsistency(updater(task)) : task));
  saveTasks(updated);
}

export function saveTaskEdits(taskId: string, textContent: TextContent, modules?: ModuleId[]) {
  updateTask(taskId, (task) => ({
    ...task,
    textContent: cloneTextContent(textContent),
    modules: modules ?? task.modules,
    status: task.status === "completed" ? "completed" : "edited",
    currentStage: task.status === "completed" ? "done" : "edit",
    sentenceExplanation: createEmptySentenceExplanationState(),
    resumeRoute: task.status === "completed" ? "result" : "edit",
    updatedAt: createTimestamp(),
    logs: [
      {
        id: createId("log"),
        level: "success",
        message: "文本草稿已保存。",
        createdAt: createTimestamp(),
      },
      ...task.logs,
    ],
  }));
}

export function syncTaskDraft(taskId: string, textContent: TextContent, modules?: ModuleId[]) {
  updateTask(taskId, (task) => ({
    ...task,
    textContent: cloneTextContent(textContent),
    modules: modules ?? task.modules,
    status: task.status === "completed" ? "completed" : task.status === "generating" ? "generating" : "parsed",
    currentStage: task.status === "completed" ? "done" : task.status === "generating" ? "generation" : "edit",
    sentenceExplanation: createEmptySentenceExplanationState(),
    resumeRoute: task.status === "completed" ? "result" : task.status === "generating" ? "task" : "edit",
    updatedAt: createTimestamp(),
  }));
}

export function replaceTaskText(taskId: string, textContent: TextContent, analysisSource?: AnalysisSource, analysisModel?: string) {
  updateTask(taskId, (task) => ({
    ...task,
    textContent: cloneTextContent(textContent),
    status: "parsed",
    currentStage: "edit",
    analysisSource: analysisSource ?? task.analysisSource,
    analysisModel: analysisModel ?? task.analysisModel,
    sentenceExplanation: createEmptySentenceExplanationState(),
    resumeRoute: "edit",
    updatedAt: createTimestamp(),
    logs: [
      {
        id: createId("log"),
        level: "info",
        message: "文本内容已重新生成。",
        createdAt: createTimestamp(),
      },
      ...task.logs,
    ],
  }));
}

function mergeParsingAndGenerationSteps(task: Task, parsingSteps: TaskStep[]) {
  const savedStepMap = new Map(task.steps.map((step) => [step.id, step]));
  const generationStepList = generationSteps(task.modules).map((step) => {
    const savedStep = savedStepMap.get(step.id);
    return savedStep ? { ...step, ...savedStep } : step;
  });

  return [...parsingSteps, ...generationStepList];
}

export function setTaskParsingProgress(taskId: string, completedModes: TextAnalysisMode[]) {
  updateTask(taskId, (task) => {
    const steps = mergeParsingAndGenerationSteps(task, parsingStepsInProgress(task.modules, completedModes));

    return {
      ...task,
      steps,
      status: "parsing",
      currentStage: "parsing",
      progress: computeProgress(steps),
      sentenceExplanation: createEmptySentenceExplanationState(),
      resumeRoute: "task",
      updatedAt: createTimestamp(),
      completedAt: undefined,
    };
  });
}

export function completeTaskTextAnalysis(
  taskId: string,
  textContent: TextContent,
  analysisSource?: AnalysisSource,
  analysisModel?: string,
) {
  updateTask(taskId, (task) => {
    const steps = mergeParsingAndGenerationSteps(task, parsingStepsForModules(task.modules));
    const parsedTask: Task = {
      ...task,
      textContent: cloneTextContent(textContent),
      steps,
      status: "parsed",
      currentStage: "edit",
      progress: computeProgress(steps),
      analysisSource: analysisSource ?? task.analysisSource,
      analysisModel: analysisModel ?? task.analysisModel,
      sentenceExplanation: createEmptySentenceExplanationState(),
      resumeRoute: "edit",
      updatedAt: createTimestamp(),
      completedAt: undefined,
      logs: [
        createLogEntry("success", "文本解析已完成，可继续编辑或启动图片生成。"),
        ...task.logs,
      ],
    };

    return parsedTask.flowMode === "all" ? startGenerationState(parsedTask) : parsedTask;
  });
}

export function failTaskTextAnalysis(taskId: string, message: string) {
  updateTask(taskId, (task) => {
    let markedError = false;
    const steps = task.steps.map((step) => {
      if (step.stage !== "parsing" || step.status === "done" || markedError) {
        return step;
      }

      markedError = true;
      return {
        ...step,
        status: "error" as StepStatus,
      };
    });

    return {
      ...task,
      steps,
      status: "failed",
      currentStage: "failed",
      progress: computeProgress(steps),
      sentenceExplanation: createEmptySentenceExplanationState(),
      resumeRoute: "task",
      updatedAt: createTimestamp(),
      completedAt: undefined,
      logs: [createLogEntry("error", message), ...task.logs],
    };
  });
}

export function restartTaskTextAnalysis(taskId: string) {
  updateTask(taskId, (task) => {
    const steps = [...parsingStepsInProgress(task.modules), ...generationSteps(task.modules)];

    return {
      ...task,
      steps,
      status: "parsing",
      currentStage: "parsing",
      progress: computeProgress(steps),
      updatedAt: createTimestamp(),
      completedAt: undefined,
      logs: [createLogEntry("info", "文本解析已重新加入队列。"), ...task.logs],
    };
  });
}

export function triggerTaskGeneration(taskId: string, modules?: ModuleId[]) {
  updateTask(taskId, (task) => {
    const targetModules = modules?.length ? modules : task.modules;
    const targetSet = new Set(targetModules);
    const nextSteps = [...parsingStepsForModules(task.modules), ...generationSteps(task.modules)].map((step) => {
      const savedStep = task.steps.find((item) => item.id === step.id);
      if (step.stage !== "generation" || !step.moduleId) {
        return savedStep ? { ...step, ...savedStep } : step;
      }

      if (targetSet.has(step.moduleId)) {
        return { ...step, ...(savedStep ?? {}), status: "pending" as StepStatus };
      }

      if (savedStep) {
        return { ...step, ...savedStep };
      }

      return hasGeneratedImageSource(task.generatedImages[step.moduleId])
        ? { ...step, status: "done" as StepStatus }
        : step;
    });

    return startGenerationState({
      ...task,
      steps: nextSteps,
      status: "edited",
      currentStage: "edit",
      updatedAt: createTimestamp(),
      completedAt: undefined,
    }, targetModules);
  });
}

export async function syncGeneratedImagesToSupabase(taskId: string, modules?: ModuleId[]) {
  const tasks = loadTasks();
  const task = tasks.find((item) => item.id === taskId);
  if (!task) {
    return { success: false, uploaded: 0, failed: 0, error: "Task not found." };
  }

  const { isSupabaseConfigured, saveImage } = await import("./image-store");
  if (!isSupabaseConfigured()) {
    const failedTask = ensureStepConsistency({
      ...task,
      updatedAt: createTimestamp(),
      logs: [createLogEntry("error", "Supabase 未配置，无法同步生成图。"), ...task.logs],
    });
    saveTasks(loadTasks().map((item) => (item.id === taskId ? failedTask : item)));
    return { success: false, uploaded: 0, failed: 0, error: "Supabase is not configured." };
  }

  const hydratedGeneratedImages = await hydrateGeneratedImages(task.id, task.generatedImages);
  const targets = Object.entries(hydratedGeneratedImages).filter(([moduleId, image]) => {
    if (!image?.fileName || !image.dataUrl) {
      return false;
    }

    if (modules?.length) {
      return modules.includes(moduleId as ModuleId);
    }

    return !image.publicUrl;
  }) as Array<[ModuleId, GeneratedImage]>;

  if (!targets.length) {
    return { success: true, uploaded: 0, failed: 0 };
  }

  const nextTask: Task = {
    ...task,
    generatedImages: { ...hydratedGeneratedImages },
    logs: [...task.logs],
  };

  let uploaded = 0;
  let failed = 0;

  for (const [moduleId, image] of targets) {
    const safeFileName = buildGeneratedImageFileName(
      task.bookName,
      moduleId,
      (image.createdAt || createTimestamp()).slice(0, 10),
    );
    const imageToSync: GeneratedImage = {
      ...image,
      fileName: safeFileName,
    };

    nextTask.generatedImages[moduleId] = imageToSync;

    try {
      const result = await saveImage("generated", taskId, imageToSync.fileName, imageToSync.dataUrl);
      if (result.success && !result.localOnly && result.url) {
        nextTask.generatedImages[moduleId] = { ...imageToSync, publicUrl: result.url };
        nextTask.logs.unshift(createLogEntry("success", buildGeneratedImageUploadSuccessMessage(moduleId)));
        uploaded += 1;
      } else {
        nextTask.logs.unshift(createLogEntry("error", buildGeneratedImageUploadErrorMessage(moduleId, result.error)));
        failed += 1;
      }
    } catch (error) {
      nextTask.logs.unshift(
        createLogEntry(
          "error",
          buildGeneratedImageUploadErrorMessage(moduleId, error instanceof Error ? error.message : "未知错误"),
        ),
      );
      failed += 1;
    }
  }

  nextTask.updatedAt = createTimestamp();
  nextTask.logs.unshift(
    createLogEntry(
      failed === 0 ? "success" : "info",
      `生成图同步完成：成功 ${uploaded} 张，失败 ${failed} 张。`,
    ),
  );

  const finalTask = ensureStepConsistency(nextTask);
  saveTasks(tasks.map((item) => (item.id === taskId ? finalTask : item)));

  return {
    success: failed === 0,
    uploaded,
    failed,
    error: failed ? `Failed to sync ${failed} generated images.` : undefined,
  };
}

export async function advanceTaskGeneration(taskId: string) {
  const task = loadTasks().find((item) => item.id === taskId);
  if (!task || task.status !== "generating") {
    return null;
  }

  const runningStep = task.steps.find((step) => step.stage === "generation" && step.status === "running");
  const nextPending = task.steps.find((step) => step.stage === "generation" && step.status === "pending");

  if (!runningStep && !nextPending) {
    return task;
  }

  const nextTask = { ...task, generatedImages: { ...task.generatedImages } };
  const logs = [...task.logs];

  if (runningStep) {
    nextTask.steps = nextTask.steps.map((step) =>
      step.id === runningStep.id ? { ...step, status: "done" as StepStatus } : step,
    );

    if (runningStep.moduleId) {
      const generatedImage = createGeneratedImage(nextTask, runningStep.moduleId);
      nextTask.generatedImages[runningStep.moduleId] = generatedImage;

      // 上传到 Supabase
      try {
        const { saveImage } = await import("./image-store");
        const result = await saveImage("generated", taskId, generatedImage.fileName, generatedImage.dataUrl);
        if (result.success && !result.localOnly && result.url) {
          nextTask.generatedImages[runningStep.moduleId] = { ...generatedImage, publicUrl: result.url };
        }
        if (result.success && !result.localOnly) {
          logs.unshift(createLogEntry("success", buildGeneratedImageUploadSuccessMessage(runningStep.moduleId)));
          console.log(`图片 ${generatedImage.fileName} 已上传到云端`);
        } else if (result.localOnly) {
          logs.unshift(createLogEntry("error", buildGeneratedImageUploadErrorMessage(runningStep.moduleId, result.error)));
          console.log(`图片 ${generatedImage.fileName} 仅保存到本地`);
        } else {
          logs.unshift(createLogEntry("error", buildGeneratedImageUploadErrorMessage(runningStep.moduleId, result.error)));
          console.error(`图片 ${generatedImage.fileName} 上传失败:`, result.error);
        }
      } catch (error) {
        logs.unshift(
          createLogEntry(
            "error",
            buildGeneratedImageUploadErrorMessage(
              runningStep.moduleId,
              error instanceof Error ? error.message : "未知错误",
            ),
          ),
        );
        console.error(`图片 ${generatedImage.fileName} 上传出错:`, error);
      }

      logs.unshift({
        id: createId("log"),
        level: "success",
        message: `${moduleMetaList.find((item) => item.id === runningStep.moduleId)?.title ?? "图片"} 已生成完成。`,
        createdAt: createTimestamp(),
      });
    }
  }

  const nextStep = nextTask.steps.find((step) => step.stage === "generation" && step.status === "pending");
  if (nextStep) {
    nextTask.steps = nextTask.steps.map((step) =>
      step.id === nextStep.id ? { ...step, status: "running" as StepStatus } : step,
    );
    logs.unshift({
      id: createId("log"),
      level: "info",
      message: `${nextStep.label} 已进入执行队列。`,
      createdAt: createTimestamp(),
    });
  }

  const progress = computeProgress(nextTask.steps);
  const completed = nextTask.steps.every((step) => step.status === "done");

  const finalTask: Task = ensureStepConsistency({
    ...nextTask,
    logs,
    progress,
    status: completed ? "completed" : "generating",
    currentStage: completed ? "done" : "generation",
    resumeRoute: completed ? "result" : "task",
    updatedAt: createTimestamp(),
    completedAt: completed ? createTimestamp() : nextTask.completedAt,
  });

  if (completed) {
    finalTask.logs.unshift({
      id: createId("log"),
      level: "success",
      message: "任务全部完成，可以查看图片结果、下载或分享。",
      createdAt: createTimestamp(),
    });
  }

  const tasks = loadTasks().map((item) => (item.id === taskId ? finalTask : item));
  saveTasks(tasks);

  return finalTask;
}

export function retryTask(taskId: string) {
  updateTask(taskId, (task) =>
    startGenerationState({
      ...task,
      generatedImages: {},
      sentenceExplanation: createEmptySentenceExplanationState(),
      steps: [...parsingStepsForModules(task.modules), ...generationSteps(task.modules)],
      status: "edited",
      currentStage: "edit",
      resumeRoute: "task",
      completedAt: undefined,
    }),
  );
}

export async function deleteTask(taskId: string) {
  const existingTasks = loadTasks();
  const removedTask = existingTasks.find((task) => task.id === taskId);
  const tasks = existingTasks.filter((task) => task.id !== taskId);
  clearSupabaseTaskSnapshotCache(taskId);
  saveTasks(tasks);

  if (!removedTask) return;

  const generatedImageIds = Object.values(removedTask.generatedImages)
    .filter((image): image is GeneratedImage => Boolean(image?.id))
    .map((image) => image.id);
  const sentenceExplanationAudioIds = removedTask.sentenceExplanation?.tts
    ? [
        removedTask.sentenceExplanation.tts.introduction,
        ...removedTask.sentenceExplanation.tts.sections.map((section) => section.content),
        removedTask.sentenceExplanation.tts.conclusion,
      ]
        .flatMap((content) => [
          ...(content.assetId ? [content.assetId] : []),
          ...(content.lineAudios?.map((lineAudio) => lineAudio.assetId).filter((assetId): assetId is string => Boolean(assetId)) ?? []),
        ])
        .filter((assetId): assetId is string => Boolean(assetId))
    : [];
  const sentenceExplanationVideoIds = removedTask.sentenceExplanation?.video?.id
    ? [removedTask.sentenceExplanation.video.id]
    : [];

  // 删除本地缓存
  void deleteAssetData("generated-images", generatedImageIds).catch((error) => {
    console.error("Failed to clean up generated image assets.", error);
  });
  void deleteAssetData("sentence-explanation-audio", sentenceExplanationAudioIds).catch((error) => {
    console.error("Failed to clean up sentence explanation audio assets.", error);
  });
  void deleteAssetData("sentence-explanation-videos", sentenceExplanationVideoIds).catch((error) => {
    console.error("Failed to clean up sentence explanation video assets.", error);
  });

  // 删除云端存储的图片
  const { removeTaskImages } = await import("./image-store");
  await removeTaskImages(
    taskId,
    removedTask.referenceImages,
    removedTask.generatedImages
  );
  await removeSentenceExplanationCloudAssets(removedTask.sentenceExplanation, taskId);
  void deleteSupabaseTaskSnapshot(taskId).catch((error) => {
    console.error("Failed to delete task snapshot from Supabase.", error);
  });
}

export async function deleteTaskWorkflow(taskOrId: string | Task) {
  const tasks = loadTasks();
  const workflowTaskIds = getTaskWorkflowTasks(tasks, taskOrId).map((task) => task.id);

  for (const workflowTaskId of workflowTaskIds) {
    await deleteTask(workflowTaskId);
  }
}

export function duplicateTaskForRegeneration(taskId: string, options: RegenerationTaskOptions = {}) {
  const task = loadTasks().find((item) => item.id === taskId);
  if (!task) return null;
  const nextModules = options.modules?.length ? options.modules : task.modules;
  const nextReferenceImages = options.referenceImages ?? task.referenceImages;
  const nextTextContent = options.textContent ?? task.textContent;
  const nextTask = startGenerationState(cloneTask(task, nextModules, nextReferenceImages, nextTextContent));
  saveTasks([nextTask, ...loadTasks()]);
  return nextTask;
}

export async function createRevisionTask(taskOrId: string | Task, options: RevisionTaskOptions) {
  const sourceTask =
    typeof taskOrId === "string"
      ? loadTasks().find((item) => item.id === taskOrId) ?? null
      : taskOrId;

  if (!sourceTask) return null;

  const hydratedTask =
    typeof taskOrId === "string"
      ? {
          ...sourceTask,
          referenceImages: await hydrateReferenceImages(sourceTask.referenceImages),
          generatedImages: await hydrateGeneratedImages(sourceTask.id, sourceTask.generatedImages),
          sentenceExplanation: {
            ...normalizeSentenceExplanationState(sourceTask.sentenceExplanation),
            tts: await hydrateSentenceExplanationTts(sourceTask.sentenceExplanation?.tts),
            video: await hydrateSentenceExplanationVideo(sourceTask.sentenceExplanation?.video),
          },
        }
      : sourceTask;
  const targetModules = options.targetModules.length ? options.targetModules : hydratedTask.modules;
  const displayModules = defaultModules.filter(
    (moduleId) =>
      (options.displayModules?.length ? options.displayModules.includes(moduleId) : hydratedTask.modules.includes(moduleId)) ||
      targetModules.includes(moduleId),
  );
  const targetSet = new Set(targetModules);
  const carriedModules = displayModules.filter((moduleId) => !targetSet.has(moduleId));
  const createdAt = createTimestamp();
  const steps = [...parsingStepsForModules(displayModules), ...generationSteps(displayModules)].map((step) => {
    if (step.stage !== "generation" || !step.moduleId) {
      return step;
    }

    if (targetSet.has(step.moduleId)) {
      return { ...step, status: "pending" as StepStatus };
    }

    return hydratedTask.generatedImages[step.moduleId] ? { ...step, status: "done" as StepStatus } : step;
  });

  const nextTaskId = createId("task");
  const nextTask = startGenerationState(
    {
      ...hydratedTask,
      id: nextTaskId,
      workflowId: nextTaskId,
      modules: displayModules,
      referenceImages: { ...hydratedTask.referenceImages },
      textContent: cloneTextContent(options.textContent ?? hydratedTask.textContent),
      generatedImages: cloneGeneratedImages(hydratedTask.generatedImages, carriedModules),
      sentenceExplanation: createEmptySentenceExplanationState(),
      steps,
      logs: [
        {
          id: createId("log"),
          level: "info",
          message: "已基于历史任务创建新的局部重生成记录。",
          createdAt,
        },
      ],
      status: "edited" as TaskStatus,
      progress: computeProgress(steps),
      currentStage: "edit" as const,
      flowMode: "all" as FlowMode,
      resumeRoute: "task" as TaskResumeRoute,
      createdAt,
      updatedAt: createdAt,
      completedAt: undefined,
    },
    targetModules,
  );

  saveTasks([nextTask, ...loadTasks()]);
  return nextTask;
}

export async function createSentenceExplanationRevisionTask(
  taskOrId: string | Task,
  options: SentenceExplanationRevisionTaskOptions = {},
) {
  const sourceTask =
    typeof taskOrId === "string"
      ? loadTasks().find((item) => item.id === taskOrId) ?? null
      : taskOrId;

  if (!sourceTask) {
    return null;
  }

  const hydratedTask =
    typeof taskOrId === "string"
      ? {
          ...sourceTask,
          referenceImages: await hydrateReferenceImages(sourceTask.referenceImages),
          generatedImages: await hydrateGeneratedImages(sourceTask.id, sourceTask.generatedImages),
          sentenceExplanation: {
            ...normalizeSentenceExplanationState(sourceTask.sentenceExplanation),
            tts: await hydrateSentenceExplanationTts(sourceTask.sentenceExplanation?.tts),
            video: await hydrateSentenceExplanationVideo(sourceTask.sentenceExplanation?.video),
          },
        }
      : sourceTask;

  const createdAt = createTimestamp();
  const clonedGeneratedImages = cloneGeneratedImages(hydratedTask.generatedImages, hydratedTask.modules);
  const steps = [...parsingStepsForModules(hydratedTask.modules), ...generationSteps(hydratedTask.modules)].map((step) => {
    if (step.stage !== "generation" || !step.moduleId) {
      return {
        ...step,
        status: "done" as StepStatus,
      };
    }

    return clonedGeneratedImages[step.moduleId]
      ? { ...step, status: "done" as StepStatus }
      : step;
  });

  const nextSentenceExplanation: TaskSentenceExplanationState = {
    article: cloneSentenceExplanationResponse(options.article ?? hydratedTask.sentenceExplanation?.article),
    tts: cloneSentenceExplanationTts(options.tts, true),
    video: cloneSentenceExplanationVideo(options.video, true),
    stage: options.stage ?? (options.video ? "video" : options.tts ? "tts" : options.article ? "article" : "idle"),
    updatedAt: createdAt,
  };

  const nextTaskId = createId("task");
  const nextTask: Task = ensureStepConsistency({
    ...hydratedTask,
    id: nextTaskId,
    workflowId: nextTaskId,
    generatedImages: clonedGeneratedImages,
    sentenceExplanation: nextSentenceExplanation,
    steps,
    logs: [
      {
        id: createId("log"),
        level: "info",
        message: "已基于历史任务创建新的句子讲解流程记录。",
        createdAt,
      },
    ],
    status: "completed",
    progress: computeProgress(steps),
    currentStage: "done",
    resumeRoute: options.resumeRoute ?? resolveTaskResumeRoute({
      ...hydratedTask,
      sentenceExplanation: nextSentenceExplanation,
    } as Task),
    createdAt,
    updatedAt: createdAt,
    completedAt: createdAt,
  });

  saveTasks([nextTask, ...loadTasks()]);
  return nextTask;
}

export async function createSentenceExplanationArticleTask(
  taskOrId: string | Task,
  payload: SentenceExplanationResponse,
) {
  return createSentenceExplanationRevisionTask(taskOrId, {
    article: payload,
    stage: "article",
    resumeRoute: "explanation",
  });
}

export function setTaskResumeRoute(taskId: string, resumeRoute: TaskResumeRoute) {
  updateTask(taskId, (task) => ({
    ...task,
    resumeRoute,
  }));
}

export function saveSentenceExplanationArticle(taskId: string, payload: SentenceExplanationResponse) {
  updateTask(taskId, (task) => ({
    ...task,
    sentenceExplanation: {
      article: cloneSentenceExplanationResponse(payload),
      tts: null,
      video: null,
      stage: "article",
      updatedAt: createTimestamp(),
    },
    resumeRoute: "explanation",
    updatedAt: createTimestamp(),
    logs: [createLogEntry("success", "句子讲解文章已保存到历史记录。"), ...task.logs],
  }));
}

export function saveSentenceExplanationTts(
  taskId: string,
  article: SentenceExplanationResponse,
  payload: SentenceExplanationTtsResponse,
) {
  const nextArticle = cloneSentenceExplanationResponse(article);
  const nextPayload = cloneSentenceExplanationTts(payload);
  if (!nextArticle || !nextPayload) {
    return;
  }

  updateTask(taskId, (task) => ({
    ...task,
    sentenceExplanation: {
      article: nextArticle,
      tts: nextPayload,
      video: null,
      stage: "tts",
      updatedAt: createTimestamp(),
    },
    resumeRoute: "explanation",
    updatedAt: createTimestamp(),
    logs: [createLogEntry("success", "句子讲解语音已保存到历史记录。"), ...task.logs],
  }));

  void syncSentenceExplanationTtsToCloud(taskId, nextPayload).catch((error) => {
    console.error("Failed to sync sentence explanation audio to Supabase.", error);
  });
}

export async function saveSentenceExplanationVideo(
  taskId: string,
  payload: SentenceExplanationVideoAsset,
) {
  const currentVideoId = loadTasks().find((item) => item.id === taskId)?.sentenceExplanation?.video?.id || "";
  const nextPayload = cloneSentenceExplanationVideo(
    currentVideoId && payload.id === currentVideoId
      ? {
          ...payload,
          id: createId("sentence-explanation-video"),
        }
      : payload,
  );
  if (!nextPayload) {
    return { success: false, synced: false, error: "Sentence explanation video payload is invalid." };
  }

  updateTask(taskId, (task) => ({
    ...task,
    sentenceExplanation: {
      ...normalizeSentenceExplanationState(task.sentenceExplanation),
      video: nextPayload,
      stage: "video",
      updatedAt: createTimestamp(),
    },
    resumeRoute: "video",
    updatedAt: createTimestamp(),
    logs: [createLogEntry("success", "句子讲解视频已保存到历史记录。"), ...task.logs],
  }));

  try {
    const syncedVideo = await syncSentenceExplanationVideoToCloud(taskId, nextPayload);
    const synced = Boolean(syncedVideo?.publicUrl);
    return {
      success: Boolean(syncedVideo),
      synced,
      url: syncedVideo?.publicUrl,
      error: synced || !isSupabaseConfigured() ? undefined : "Failed to sync sentence explanation video to Supabase.",
    };
  } catch (error) {
    console.error("Failed to sync sentence explanation video to Supabase.", error);
    return {
      success: false,
      synced: false,
      error: error instanceof Error ? error.message : "Failed to sync sentence explanation video to Supabase.",
    };
  }
}

export function regenerateTextContent(task: Task) {
  return buildTextContent(task.sentence, task.bookName, task.author);
}

export function regenerateSegmentation(task: Task) {
  const regenerated = buildTextContent(task.sentence, task.bookName, task.author);
  return {
    ...task.textContent,
    prompt1: regenerated.prompt1,
    prompt2: regenerated.prompt2,
    prompt3: regenerated.prompt3,
    prompt4: regenerated.prompt4,
  };
}

export function regenerateTranslation(task: Task) {
  const regenerated = buildTextContent(task.sentence, task.bookName, task.author);
  return {
    ...task.textContent,
    translation: regenerated.translation,
  };
}

export function regenerateGrammar(task: Task) {
  const regenerated = buildTextContent(task.sentence, task.bookName, task.author);
  return {
    ...task.textContent,
    grammar: regenerated.grammar,
  };
}

export function regenerateVocabulary(task: Task) {
  const regenerated = buildTextContent(task.sentence, task.bookName, task.author);
  return {
    ...task.textContent,
    vocabulary: regenerated.vocabulary,
  };
}

export function regenerateIelts(task: Task) {
  const regenerated = buildTextContent(task.sentence, task.bookName, task.author);
  return {
    ...task.textContent,
    ielts: regenerated.ielts,
  };
}

export function formatTaskTime(timestamp: string) {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function taskStatusLabel(status: TaskStatus) {
  switch (status) {
    case "parsing":
      return "解析中";
    case "parsed":
      return "待编辑";
    case "edited":
      return "已确认";
    case "generating":
      return "生成中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    default:
      return "待开始";
  }
}

export function moduleTitle(moduleId: ModuleId) {
  return moduleMetaList.find((item) => item.id === moduleId)?.title ?? moduleId;
}

export function getGeneratedImageSource(
  image?: Pick<GeneratedImage, "dataUrl" | "publicUrl"> | null,
) {
  return image?.dataUrl || image?.publicUrl || "";
}

export function hasGeneratedImageSource(
  image?: Pick<GeneratedImage, "dataUrl" | "publicUrl"> | null,
) {
  return Boolean(getGeneratedImageSource(image));
}

export function defaultReferenceImages() {
  return emptyReferenceRecord();
}

/**
 * 更新任务的生成图像（用于图像生成完成后）
 */
export function updateTaskGeneratedImages(
  taskId: string,
  generatedImages: Partial<Record<ModuleId, GeneratedImage>>
) {
  updateTask(taskId, (task) => {
    const allCompleted = Object.keys(generatedImages).length === task.modules.length;
    return {
      ...task,
      generatedImages: {
        ...task.generatedImages,
        ...generatedImages,
      },
      status: allCompleted ? "completed" : "generating",
      currentStage: allCompleted ? "done" : "generation",
      progress: allCompleted ? 100 : Math.round(
        (Object.keys(generatedImages).length / task.modules.length) * 100
      ),
      updatedAt: createTimestamp(),
      completedAt: allCompleted ? createTimestamp() : task.completedAt,
      logs: [
        {
          id: createId("log"),
          level: allCompleted ? "success" : "info",
          message: allCompleted
            ? "所有图片生成完成"
            : `已生成 ${Object.keys(generatedImages).length}/${task.modules.length} 张图片`,
          createdAt: createTimestamp(),
        },
        ...task.logs,
      ],
    };
  });
}
