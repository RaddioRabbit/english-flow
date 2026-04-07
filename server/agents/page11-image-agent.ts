/**
 * Page 1-1 Image Agent
 * 生成句译对照图（上方 4 格英汉对照 + 下方 1 个合并场景格）
 */

import type { ModuleId } from "../../src/lib/task-store";
import type { TextAnalysisVocabularyCard } from "../../src/lib/text-analysis-contract";
import { buildTranslationSceneOnlyPrompt } from "../../src/lib/translation-image-prompt";
import { buildTranslationImageSvgDataUrl, buildTranslationImageSvgDataUrlWithHighlights } from "../../src/lib/translation-image-svg";
import {
  callTranslationHighlightsSkill,
} from "../translation-image-highlights-skill-shim";
import { IMAGE_GENERATION_SKILL_NAME } from "../image-generation-skill";

export interface Page11ImageAgentInput {
  bookName: string;
  author?: string;
  originSentence: string;
  prompt1: string;
  prompt2: string;
  prompt3: string;
  prompt4: string;
  vocabulary?: TextAnalysisVocabularyCard[];
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
    const finalPrompt = buildTranslationSceneOnlyPrompt(input.originSentence);

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

    // 尝试使用 skill 生成标注数据，如果失败则回退到本地实现
    let highlights = undefined;
    try {
      const highlightsResult = await callTranslationHighlightsSkill({
        prompt1: input.prompt1,
        prompt2: input.prompt2,
        prompt3: input.prompt3,
        prompt4: input.prompt4,
        vocabulary: input.vocabulary ?? [],
      });
      highlights = highlightsResult.highlights;
    } catch (error) {
      console.log("Translation highlights skill failed, falling back to local implementation:", error);
    }

    const svgDataUrl = highlights && highlights.length > 0
      ? buildTranslationImageSvgDataUrlWithHighlights({
          bookName: input.bookName,
          author: input.author,
          originSentence: input.originSentence,
          prompt1: input.prompt1,
          prompt2: input.prompt2,
          prompt3: input.prompt3,
          prompt4: input.prompt4,
          highlights,
          sceneImageDataUrl: generationResult.imageDataUrl,
        })
      : buildTranslationImageSvgDataUrl({
      bookName: input.bookName,
      author: input.author,
      originSentence: input.originSentence,
      prompt1: input.prompt1,
      prompt2: input.prompt2,
      prompt3: input.prompt3,
      prompt4: input.prompt4,
      vocabulary: input.vocabulary ?? [],
      sceneImageDataUrl: generationResult.imageDataUrl,
    });

    return {
      success: true,
      imageDataUrl: svgDataUrl,
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
