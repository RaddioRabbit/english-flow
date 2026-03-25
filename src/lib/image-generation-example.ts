/**
 * Image Generation Integration Example
 * 图像生成功能集成示例
 *
 * 这个文件展示了如何使用图像生成功能
 */

import type { Task, ModuleId } from "./task-store";
import { useImageGeneration } from "./use-image-generation";
import {
  generateImage,
  generateImagesBatch,
  convertToGeneratedImage,
} from "./image-generation-client";

// ============================================
// 示例 1: 在 React 组件中使用 Hook
// ============================================

/*
import { useImageGeneration } from "@/lib/use-image-generation";
import { useTask } from "@/lib/task-store";

function TaskExecutionPage({ taskId }: { taskId: string }) {
  const task = useTask(taskId);
  const { state, generateImages, reset } = useImageGeneration((updatedTask) => {
    // 任务更新后的回调
    console.log("任务已更新:", updatedTask);
  });

  const handleGenerate = async () => {
    if (!task) return;
    await generateImages(task);
  };

  return (
    <div>
      <button
        onClick={handleGenerate}
        disabled={state.isGenerating}
      >
        {state.isGenerating ? "生成中..." : "开始生成图片"}
      </button>

      {state.currentModule && (
        <p>正在生成: {state.currentModule}</p>
      )}

      {state.progress > 0 && (
        <progress value={state.progress} max={100} />
      )}

      {state.error && (
        <p style={{ color: "red" }}>错误: {state.error}</p>
      )}
    </div>
  );
}
*/

// ============================================
// 示例 2: 直接调用客户端 API
// ============================================

async function exampleSingleImageGeneration(task: Task) {
  try {
    const result = await generateImage({
      taskId: task.id,
      moduleId: "translation",
      textContent: task.textContent,
      bookName: task.bookName,
      originSentence: task.sentence,
      referenceImage: task.referenceImages.translation?.dataUrl,
    });

    if (result.success && result.imageDataUrl) {
      // 转换为 GeneratedImage 对象
      const generatedImage = convertToGeneratedImage(
        "translation",
        result,
        task.bookName,
        "源文本内容..."
      );

      console.log("图片生成成功:", generatedImage);
      return generatedImage;
    } else {
      console.error("图片生成失败:", result.error);
    }
  } catch (error) {
    console.error("请求失败:", error);
  }
}

// ============================================
// 示例 3: 批量生成图片
// ============================================

async function exampleBatchImageGeneration(task: Task) {
  try {
    const response = await generateImagesBatch({
      taskId: task.id,
      modules: task.modules,
      textContent: task.textContent,
      bookName: task.bookName,
      originSentence: task.sentence,
      referenceImages: task.referenceImages,
    });

    if (response.success) {
      // 处理生成结果
      for (const result of response.results) {
        if (result.success) {
          console.log(`${result.moduleId} 生成成功`);
        } else {
          console.error(`${result.moduleId} 生成失败:`, result.error);
        }
      }
    }
  } catch (error) {
    console.error("批量生成失败:", error);
  }
}

// ============================================
// 示例 4: 模块数据准备
// ============================================

/**
 * 准备图像生成所需的数据
 */
function prepareImageGenerationData(task: Task, moduleId: ModuleId) {
  const { textContent } = task;

  switch (moduleId) {
    case "translation":
      return {
        bookName: task.bookName,
        originSentence: task.sentence,
        prompt1: textContent.prompt1,
        prompt2: textContent.prompt2,
        prompt3: textContent.prompt3,
        prompt4: textContent.prompt4,
        referenceImage: task.referenceImages.translation?.dataUrl,
      };

    case "grammar":
      return {
        originSentence: task.sentence,
        grammarAnalysis: textContent.grammar,
        referenceImage: task.referenceImages.grammar?.dataUrl,
      };

    case "summary":
      return {
        originSentence: task.sentence,
        grammarAnalysis: textContent.grammar,
        referenceImage: task.referenceImages.summary?.dataUrl,
      };

    case "vocabulary":
      return {
        vocabulary: textContent.vocabulary,
        referenceImage: task.referenceImages.vocabulary?.dataUrl,
      };

    case "ielts":
      return {
        ieltsTips: textContent.ielts,
        referenceImage: task.referenceImages.ielts?.dataUrl,
      };

    default:
      throw new Error(`未知的模块类型: ${moduleId}`);
  }
}

// ============================================
// 导出的工具函数
// ============================================

export {
  exampleSingleImageGeneration,
  exampleBatchImageGeneration,
  prepareImageGenerationData,
};
