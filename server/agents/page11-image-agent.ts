/**
 * Page 1-1 Image Agent
 * 生成句译对照图（上方 4 格英汉对照 + 下方 1 个合并场景格）
 */

import type { ModuleId } from "../../src/lib/task-store";
import { buildTranslationImagePrompt } from "../../src/lib/translation-image-prompt";
import { IMAGE_GENERATION_SKILL_NAME } from "../image-generation-skill";

export interface Page11ImageAgentInput {
  bookName: string;
  originSentence: string;
  prompt1: string;
  prompt2: string;
  prompt3: string;
  prompt4: string;
  referenceImage?: string;
}

export interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  imageDataUrl?: string;
  error?: string;
  metadata: {
    moduleId: ModuleId;
    promptLength: number;
    generatedAt: string;
  };
}

/**
 * 调用 aifast-image-generation skill 生成图像
 */
async function generateImageWithSkill(
  prompt: string,
  referenceImage?: string,
): Promise<{ success: boolean; imageDataUrl?: string; error?: string }> {
  try {
    const result = await (globalThis as unknown as {
      skill: (name: string, params: Record<string, unknown>) => Promise<unknown>;
    }).skill(IMAGE_GENERATION_SKILL_NAME, {
      prompt,
      reference_image: referenceImage || undefined,
    });

    const typedResult = result as { image_url?: string; image_data_url?: string };

    return {
      success: true,
      imageDataUrl: typedResult.image_data_url || typedResult.image_url,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "图像生成失败",
    };
  }
}

/**
 * Page 1-1 Image Agent 主函数
 * 生成句译对照图
 */
export async function generatePage11Image(
  input: Page11ImageAgentInput,
): Promise<ImageGenerationResult> {
  try {
    const finalPrompt = buildTranslationImagePrompt({
      originSentence: input.originSentence,
      prompt1: input.prompt1,
      prompt2: input.prompt2,
      prompt3: input.prompt3,
      prompt4: input.prompt4,
    });

    const generationResult = await generateImageWithSkill(finalPrompt, input.referenceImage);

    if (!generationResult.success) {
      return {
        success: false,
        error: generationResult.error,
        metadata: {
          moduleId: "translation",
          promptLength: finalPrompt.length,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    return {
      success: true,
      imageDataUrl: generationResult.imageDataUrl,
      metadata: {
        moduleId: "translation",
        promptLength: finalPrompt.length,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
      metadata: {
        moduleId: "translation",
        promptLength: 0,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
