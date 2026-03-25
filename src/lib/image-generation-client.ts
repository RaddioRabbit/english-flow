/**
 * Image Generation Client
 * 前端调用图像生成 API 的客户端
 */

import type {
  ModuleId,
  TextContent,
  ReferenceAsset,
  GeneratedImage,
} from "./task-store";
import { buildGeneratedImageFileName } from "./image-file-name";

export interface GenerateImageRequest {
  taskId: string;
  moduleId: ModuleId;
  textContent: TextContent;
  bookName: string;
  originSentence: string;
  referenceImage?: string;
}

export interface GenerateImageResponse {
  success: boolean;
  moduleId: ModuleId;
  imageDataUrl?: string;
  error?: string;
  metadata: {
    promptLength: number;
    generatedAt: string;
  };
}

export interface GenerateImagesBatchRequest {
  taskId: string;
  modules: ModuleId[];
  textContent: TextContent;
  bookName: string;
  originSentence: string;
  referenceImages: Record<ModuleId, ReferenceAsset | null>;
}

export interface GenerateImagesBatchResponse {
  success: boolean;
  taskId: string;
  results: GenerateImageResponse[];
  completedAt: string;
}

/**
 * 生成单张图片
 */
export async function generateImage(
  request: GenerateImageRequest
): Promise<GenerateImageResponse> {
  const response = await fetch("/api/image-generation/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "请求失败" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * 批量生成图片
 */
export async function generateImagesBatch(
  request: GenerateImagesBatchRequest
): Promise<GenerateImagesBatchResponse> {
  const response = await fetch("/api/image-generation/batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "请求失败" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * 将 API 响应转换为 GeneratedImage 对象
 */
export function convertToGeneratedImage(
  moduleId: ModuleId,
  response: GenerateImageResponse,
  bookName: string,
  sourceText: string
): GeneratedImage {
  const moduleTitles: Record<ModuleId, string> = {
    translation: "句译对照图",
    grammar: "句式分析图",
    summary: "句式总结图",
    vocabulary: "词汇解析图",
    ielts: "雅思备考图",
  };

  const moduleSubtitles: Record<ModuleId, string> = {
    translation: "基于分句结果生成",
    grammar: "基于句式分析文本生成",
    summary: "基于句式分析文本生成",
    vocabulary: "基于词汇解析文本生成",
    ielts: "基于雅思备考建议文本生成",
  };

  return {
    id: `image-${moduleId}-${Date.now()}`,
    imageType: moduleId,
    title: moduleTitles[moduleId],
    subtitle: moduleSubtitles[moduleId],
    sourceText,
    fileName: buildGeneratedImageFileName(bookName, moduleId, new Date().toISOString().slice(0, 10)),
    dataUrl: response.imageDataUrl || "",
    createdAt: new Date().toISOString(),
  };
}
