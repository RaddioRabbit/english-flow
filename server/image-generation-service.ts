/**
 * Image Generation Service
 * 整合所有 Subagent，提供统一的图像生成接口
 */

import type {
  ModuleId,
  TextContent,
  ReferenceAsset,
} from "../src/lib/task-store";
import {
  generatePage11Image,
  generatePage221Image,
  generatePage222Image,
  generatePage31Image,
  generatePage41Image,
  type Page11ImageAgentInput,
  type Page221ImageAgentInput,
  type Page222ImageAgentInput,
  type Page31ImageAgentInput,
  type Page41ImageAgentInput,
} from "./agents";

export interface ImageGenerationRequest {
  taskId: string;
  moduleId: ModuleId;
  textContent: TextContent;
  bookName: string;
  originSentence: string;
  referenceImage?: string;
}

export interface ImageGenerationResponse {
  success: boolean;
  moduleId: ModuleId;
  imageDataUrl?: string;
  error?: string;
  metadata: {
    promptLength: number;
    generatedAt: string;
  };
}

function buildModuleGenerationError(
  request: ImageGenerationRequest,
  error: unknown,
): ImageGenerationResponse {
  return {
    success: false,
    moduleId: request.moduleId,
    error: error instanceof Error ? error.message : "图片生成失败",
    metadata: {
      promptLength: 0,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * 生成指定模块的图像
 */
export async function generateModuleImage(
  request: ImageGenerationRequest,
): Promise<ImageGenerationResponse> {
  const { moduleId, textContent, bookName, originSentence, referenceImage } =
    request;

  switch (moduleId) {
    case "translation": {
      const input: Page11ImageAgentInput = {
        bookName,
        originSentence,
        prompt1: textContent.prompt1,
        prompt2: textContent.prompt2,
        prompt3: textContent.prompt3,
        prompt4: textContent.prompt4,
        vocabulary: textContent.vocabulary,
        referenceImage,
      };
      const result = await generatePage11Image(input);
      return {
        ...result,
        moduleId,
      };
    }

    case "grammar": {
      const input: Page221ImageAgentInput = {
        originSentence,
        grammarAnalysis: textContent.grammar,
        referenceImage,
      };
      const result = await generatePage221Image(input);
      return {
        ...result,
        moduleId,
      };
    }

    case "summary": {
      const input: Page222ImageAgentInput = {
        originSentence,
        grammarAnalysis: textContent.grammar,
        referenceImage,
      };
      const result = await generatePage222Image(input);
      return {
        ...result,
        moduleId,
      };
    }

    case "vocabulary": {
      const input: Page31ImageAgentInput = {
        vocabulary: textContent.vocabulary,
        referenceImage,
      };
      const result = await generatePage31Image(input);
      return {
        ...result,
        moduleId,
      };
    }

    case "ielts": {
      const input: Page41ImageAgentInput = {
        ieltsTips: textContent.ielts,
        referenceImage,
      };
      const result = await generatePage41Image(input);
      return {
        ...result,
        moduleId,
      };
    }

    default:
      return {
        success: false,
        moduleId,
        error: `未知的模块类型 ${moduleId}`,
        metadata: {
          promptLength: 0,
          generatedAt: new Date().toISOString(),
        },
      };
  }
}

/**
 * 批量生成多个模块的图像
 */
export async function generateMultipleImages(
  requests: ImageGenerationRequest[],
  executor: (request: ImageGenerationRequest) => Promise<ImageGenerationResponse> = generateModuleImage,
): Promise<ImageGenerationResponse[]> {
  return Promise.all(
    requests.map(async (request) => {
      try {
        return await executor(request);
      } catch (error) {
        return buildModuleGenerationError(request, error);
      }
    }),
  );
}

/**
 * 构建图像生成请求
 */
export function buildImageGenerationRequests(
  taskId: string,
  modules: ModuleId[],
  textContent: TextContent,
  bookName: string,
  originSentence: string,
  referenceImages: Record<ModuleId, ReferenceAsset | null>,
): ImageGenerationRequest[] {
  return modules.map((moduleId) => ({
    taskId,
    moduleId,
    textContent,
    bookName,
    originSentence,
    referenceImage: referenceImages[moduleId]?.dataUrl,
  }));
}
