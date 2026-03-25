/**
 * Page 3-1 Image Agent - 词汇解析图生成
 * 基于 english_page3_1_agent.js 转换的 Subagent
 * 生成 6 宫格词汇解析教学条漫
 */

import type { ModuleId } from "../../src/lib/task-store";
import type { ImageGenerationResult } from "./page11-image-agent";
import { IMAGE_GENERATION_SKILL_NAME } from "../image-generation-skill";

export interface Page31ImageAgentInput {
  vocabulary: Array<{
    word: string;
    phonetic: string;
    partOfSpeech: string;
    meaning: string;
    example: string;
    translation: string;
  }>;
  referenceImage?: string;
}

/**
 * 格式化单词解析为字符串
 */
function formatWordAnalysis(word: typeof Page31ImageAgentInput.prototype.vocabulary[0], index: number): string {
  return `词汇解析 ${index + 1}

**${word.word}** ${word.phonetic}
词性：${word.partOfSpeech}
释义：${word.meaning}
例句：${word.example}
译文：${word.translation}`;
}

/**
 * 组合完整图片提示词
 */
function buildFinalPrompt(
  word1: string,
  word2: string,
  word3: string,
  word4: string,
  word5: string,
  word6: string
): string {
  return `仿照图片的设计、排版、布局，垂直布局3:4画板，设计1张【6宫格竖版英语教学条漫】，整体风格严格参考高质量英语学习条漫，用于系统、清晰地讲解英语单词。

请生成一张【英语词汇解析教学信息图】，整体风格严格参考高质量英语学习条漫，用于系统、清晰地讲解英语单词。

【整体风格】

- 教育类信息图（Educational Infographic）
- 扁平化插画风格（flat illustration）
- 明亮柔和配色，高对比但不刺眼
- 浅黄色 / 米白色背景
- 圆角卡片设计，粗描边
- 干净、可爱、专业，适合长期连载
- 无真实人物照片，全部为卡通图标

【画面结构】

- 多宫格布局（根据单词数量自动排布）
- 每一个宫格 = 一个英语单词
- 宫格大小一致，间距均匀
- 建议 2×2 四宫格布局

【单个宫格固定结构（必须全部包含）】

1️⃣ 顶部模块标题
格式：
词汇解析 X + 对应语义 emoji

2️⃣ 单词本体（最大字号，加粗）

- 英文单词突出显示

3️⃣ 音标

- 使用国际音标

4️⃣ 词性标签

- 使用彩色圆角标签
- 标注词性：名词 / 动词 / 形容词

5️⃣ 中文释义

- 1–3 个核心义项
- 中文简洁、教学友好

6️⃣ 英文例句

- 自然、易理解
- 与释义高度匹配

7️⃣ 中文译文

- 与例句一一对应
- 表达自然

8️⃣ 语义插画图标

- 与单词意义强相关
- 用于辅助记忆

【内容变量区：请将以下文字版单词解析转化为宫格展示】

【单词解析内容开始】

${word1}

${word2}

${word3}

${word4}

${word5}

${word6}

【单词解析内容结束】

【排版要求】
- 页面上不要有大标题
- 信息层级清晰
- 单词字号最大，其余依次递减
- 所有文字清晰可读，适合手机端学习
- 整体风格统一，适合系列化发布

> **（视觉元素与图表）：**内容要求初中生能够看懂，除了单词和例句，其他都用中文
> **画面充满了信息图表元素：包含[替换：具体元素，例如：箭头流程图]。视觉符号简洁，类似UI图标设计。例句要用每个单词下方的例句，还要把例句的翻译也写上。

> **（艺术风格）：**扁平化矢量插画风格，粗黑色的轮廓线，极简主义，波普艺术感。色彩鲜艳且平整，高饱和度（主要是[替换：具体元素，例如：放大镜箭头流程图]），米黄色纸张背景。无噪点，清晰锐利。

> **（构图）**：
> 分格漫画布局，每张图都用6宫格展示，3:4画板展示，用1张图来展示内容，图片内容为"词汇解析"，要求详细阐释。

> **排除项（非常关键）**
> 页面最上方有大标题，与词汇解析无关的内容，图片模糊，除了词汇解析的其他内容，图片的每个宫格互相没有逻辑，字体太小，不按照图片一的排版和布局，非写实、非日漫、非水彩、非油画、非手绘涂鸦、非低幼儿童绘本风`;
}

/**
 * 调用 aifast-image-generation skill 生成图像
 */
async function generateImageWithSkill(
  prompt: string,
  referenceImage?: string
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
 * Page 3-1 Image Agent 主函数
 * 生成词汇解析图（6宫格）
 */
export async function generatePage31Image(
  input: Page31ImageAgentInput
): Promise<ImageGenerationResult> {
  try {
    // 验证词汇数据
    if (!input.vocabulary || input.vocabulary.length < 6) {
      return {
        success: false,
        error: "词汇数据不足，需要至少6个单词",
        metadata: {
          moduleId: "vocabulary",
          promptLength: 0,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    // 步骤 1: 格式化6个单词
    const wordTexts = input.vocabulary.slice(0, 6).map((word, index) =>
      formatWordAnalysis(word, index)
    );

    // 步骤 2: 组合最终提示词
    const finalPrompt = buildFinalPrompt(
      wordTexts[0],
      wordTexts[1],
      wordTexts[2],
      wordTexts[3],
      wordTexts[4],
      wordTexts[5]
    );

    // 步骤 3: 调用 Skill 生成图像
    const generationResult = await generateImageWithSkill(
      finalPrompt,
      input.referenceImage
    );

    if (!generationResult.success) {
      return {
        success: false,
        error: generationResult.error,
        metadata: {
          moduleId: "vocabulary",
          promptLength: finalPrompt.length,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    return {
      success: true,
      imageDataUrl: generationResult.imageDataUrl,
      metadata: {
        moduleId: "vocabulary",
        promptLength: finalPrompt.length,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
      metadata: {
        moduleId: "vocabulary",
        promptLength: 0,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
