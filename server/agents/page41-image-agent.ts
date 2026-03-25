/**
 * Page 4-1 Image Agent - 雅思备考图生成
 * 基于 english_page4_1_agent.js 转换的 Subagent
 * 生成 4 宫格雅思备考教学条漫
 */

import type { ModuleId } from "../../src/lib/task-store";
import type { ImageGenerationResult } from "./page11-image-agent";
import { IMAGE_GENERATION_SKILL_NAME } from "../image-generation-skill";

export interface Page41ImageAgentInput {
  ieltsTips: {
    listening: string;
    speaking: string;
    reading: string;
    writing: string;
  };
  referenceImage?: string;
}

/**
 * 生成雅思备考图片提示词
 */
async function generatePicPrompt(ieltsTips: Page41ImageAgentInput["ieltsTips"]): Promise<string> {
  const systemPrompt = `## 角色：
你是一名提示词工程师

## 目标：
把这些雅思备考建议的文字版解析，用以下Prompt模板表示出来，放到nanobanana里可以直接生成图片版的雅思备考建议图。

## Prompt模板：

**整体设计风格要求：**

- 雅思备考教学信息图（IELTS Infographic）
- 扁平化插画风格，清晰、专业、教育感强
- 明亮高对比配色，适合学习分享
- 外围使用 **亮黄色粗边框**
- 背景为 **浅米色 / 浅黄色纸张质感**
- 版式整洁、信息密集但易读，适合小红书条漫风格

------

**四宫格内容与结构要求如下：**

左上｜听力

- 顶部为 **黑色标题栏**，白色大字「听力」，配 **耳朵图标**
- 内容使用 ✔️ 勾选符号，分析以下句子结构在雅思听力中的难点与应对策略
- 强调：
  - 长句、并列结构、插入成分带来的信息密集问题
  - 如何先抓 **主句主谓结构（Main Clause）**
  - 如何通过连接词（and / when / given / with）跟踪信息
  - 如何在 Section 3 / 4 中避免遗漏细节
- 可加入简洁箭头示意：MAIN CLAUSE → MODIFIERS → DETAILS

------

右上｜口语

- 顶部为 **黑色标题栏**，白色大字「口语」，配 **对话图标**
- 使用 ✔️ 勾选符号说明该句式在 IELTS Speaking 中的运用
- 强调：
  - 如何用句子开头进行模仿（如 I suppose that…, I can remember that…）
  - 如何使用并列结构和时间/目的状语丰富表达
  - 适合 Part 2 描述经历、场景、人物
  - 提升画面感，避免简单句堆砌
- 配合人物讲述、时间线或场景类插画

------

左下｜阅读

- 顶部为 **黑色标题栏**，白色大字「阅读」，配 **书本图标**
- 使用 ✔️ 勾选符号讲解长难句的阅读拆解方法
- 强调：
  - 快速定位 **主干（S + V）**
  - 拆分并列结构与从句
  - 用"括号化"方式暂时忽略插入语
  - 明确修饰对象，避免理解偏差
- 可视化展示：主干高亮，修饰成分虚线框标出

------

右下｜写作

- 顶部为 **黑色标题栏**，白色大字「写作」，配 **笔图标**
- 使用 ✔️ 勾选符号说明该句式在 IELTS Writing Task 2 中的价值
- 强调：
  - 用于举例、论证、描述现象
  - 通过并列 + 插入语提升句式复杂度
  - 有助于 Band 7+ 的句型多样性
  - 提醒控制长度，避免语法失误
- 可配层次分析结构图：观点 → 细节 → 结构`;

  // 返回简化版本，包含实际的雅思建议内容
  return `雅思备考建议：
听力：${ieltsTips.listening.slice(0, 100)}...
口语：${ieltsTips.speaking.slice(0, 100)}...
阅读：${ieltsTips.reading.slice(0, 100)}...
写作：${ieltsTips.writing.slice(0, 100)}...`;
}

/**
 * 组合完整图片提示词
 */
function buildFinalPrompt(picPrompt1: string): string {
  return `仿照图片的设计、排版、布局，垂直布局3:4画板，设计1张【4宫格竖版英语教学条漫】，整体风格严格参考高质量英语学习条漫，用于系统讲解**同一句英语长难句在雅思听力、口语、阅读、写作中的应对策略**。

------

【整体风格】

- 教育类信息图（IELTS Educational Infographic）
- 扁平化插画风格（flat illustration）
- 明亮但不刺眼的高对比配色
- 浅米色 / 浅黄色纸张质感背景
- 整体外框为**亮黄色粗边框**
- 黑色标题栏 + 白色大字，强对比
- 干净、专业、条理清晰，适合长期连载的雅思学习内容
- 无真实人物照片，仅使用卡通人物与功能性图标

------

【画面结构】

- **2×2 四宫格布局（竖版 3:4）**
- 每一个宫格对应一个雅思能力维度：
  - 左上：听力
  - 右上：口语
  - 左下：阅读
  - 右下：写作
- 四个宫格大小一致，间距均匀
- 每个宫格内部使用 ✔️ 勾选列表呈现要点

------

【单个宫格统一结构（必须遵循）】

1️⃣ 顶部标题栏

- 黑色背景
- 白色大字标题（听力 / 口语 / 阅读 / 写作）
- 每个标题搭配对应功能图标
  - 听力：耳朵
  - 口语：对话
  - 阅读：书本
  - 写作： 笔

2️⃣ 内容呈现方式

- 使用 ✔️ 勾选符号分点说明
- 语言为**中文为主，关键语法术语保留英文**
- 表达清晰、教学导向强、适合"扫一眼就懂"

3️⃣ 辅助视觉元素

- 使用箭头、结构框、简单示意图强化理解
- 不添加多余装饰，避免干扰阅读
【内容变量区｜请将以下文字转化为四宫格展示】
${picPrompt1}
【整体效果目标】
- 页面最上方不要有大标题
- 一张**结构清晰、信息密集但易读**的雅思备考四宫格信息图
- 适合用于英语教学、小红书条漫、课程配图或系列化内容输出
- 让学习者一眼理解：**"同一句话，听说读写该怎么用"**

> **注意**：**除了这4个宫格，不要展示其他宫格、标题以及其他内容。**
> **（视觉元素与图表）：**内容要求初中生能够看懂，除了单词和例句，其他都用中文
> **画面充满了信息图表元素：包含[替换：具体元素，例如：箭头流程图]。视觉符号简洁，类似UI图标设计。例句要用每个单词下方的例句，还要把例句的翻译也写上。

> **（艺术风格）：**扁平化矢量插画风格，粗黑色的轮廓线，极简主义，波普艺术感。色彩鲜艳且平整，高饱和度（主要是[替换：具体元素，例如：放大镜箭头流程图]），米黄色纸张背景。无噪点，清晰锐利。

> **（构图）**：
> 分格漫画布局，每张图都用4宫格展示，3:4画板展示，用1张图来展示内容，图片内容为"雅思备考策略"，要求详细阐释。除了这4个宫格，不要展示其他宫格、标题以及其他内容。

> **排除项（非常关键）**
> 页面最上方有大标题，与雅思备考无关的内容，图片模糊，图片的每个宫格互相没有逻辑，字体太小，不按照图片一的排版和布局，非写实、非日漫、非水彩、非油画、非手绘涂鸦、非低幼儿童绘本风。`;
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
 * Page 4-1 Image Agent 主函数
 * 生成雅思备考图（4宫格）
 */
export async function generatePage41Image(
  input: Page41ImageAgentInput
): Promise<ImageGenerationResult> {
  try {
    // 步骤 1: 生成雅思备考图片提示词
    const generatedPrompt = await generatePicPrompt(input.ieltsTips);

    // 步骤 2: 组合最终提示词
    const finalPrompt = buildFinalPrompt(generatedPrompt);

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
          moduleId: "ielts",
          promptLength: finalPrompt.length,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    return {
      success: true,
      imageDataUrl: generationResult.imageDataUrl,
      metadata: {
        moduleId: "ielts",
        promptLength: finalPrompt.length,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
      metadata: {
        moduleId: "ielts",
        promptLength: 0,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
