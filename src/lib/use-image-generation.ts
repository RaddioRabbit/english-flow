import { useCallback, useState } from "react";

import {
  convertToGeneratedImage,
  generateImagesBatch,
  type GenerateImagesBatchRequest,
} from "./image-generation-client";
import { hydrateReferenceImages, loadTasks, moduleTitle, saveTasks } from "./task-store";
import type { GeneratedImage, ModuleId, Task } from "./task-store";

export interface ImageGenerationState {
  isGenerating: boolean;
  currentModule: ModuleId | null;
  progress: number;
  error: string | null;
}

export interface UseImageGenerationReturn {
  state: ImageGenerationState;
  generateImages: (task: Task) => Promise<void>;
  reset: () => void;
}

function getSourceText(task: Task, moduleId: ModuleId): string {
  const { textContent } = task;

  switch (moduleId) {
    case "translation":
      return [textContent.prompt1, textContent.prompt2, textContent.prompt3, textContent.prompt4].join("\n");
    case "grammar":
    case "summary":
      return [textContent.grammar.tense, textContent.grammar.voice, textContent.grammar.structure].join("\n");
    case "vocabulary":
      return textContent.vocabulary
        .map(
          (item, index) =>
            `${index + 1}. ${item.word} ${item.phonetic}\n词性：${item.partOfSpeech}\n释义：${item.meaning}\n例句：${item.example}\n译文：${item.translation}`,
        )
        .join("\n\n");
    case "ielts":
      return Object.entries(textContent.ielts)
        .map(([key, value]) => `${key}\n${value}`)
        .join("\n\n");
    default:
      return "";
  }
}

function updateTaskSteps(task: Task, moduleId: ModuleId, status: "running" | "done" | "error"): Task {
  return {
    ...task,
    steps: task.steps.map((step) => (step.moduleId === moduleId ? { ...step, status } : step)),
  };
}

function addTaskLog(task: Task, level: "info" | "success" | "error", message: string): Task {
  return {
    ...task,
    logs: [
      {
        id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        level,
        message,
        createdAt: new Date().toISOString(),
      },
      ...task.logs,
    ],
  };
}

function computeProgress(task: Task): number {
  const generationSteps = task.steps.filter((step) => step.stage === "generation");
  const doneSteps = generationSteps.filter((step) => step.status === "done");
  return generationSteps.length ? Math.round((doneSteps.length / generationSteps.length) * 100) : 0;
}

function getTargetModules(task: Task): ModuleId[] {
  const runningOrPendingModules = task.steps
    .filter((step) => step.stage === "generation" && step.status !== "done" && step.moduleId)
    .map((step) => step.moduleId as ModuleId);

  return runningOrPendingModules.length ? runningOrPendingModules : task.modules;
}

async function persistGeneratedImage(
  taskId: string,
  image: GeneratedImage,
): Promise<{ image: GeneratedImage; synced: boolean; uploadError?: string }> {
  try {
    const { saveImage } = await import("./image-store");
    const uploadResult = await saveImage("generated", taskId, image.fileName, image.dataUrl);

    if (uploadResult.success && !uploadResult.localOnly) {
      console.log(`图片 ${image.fileName} 已上传到云端`);
      return {
        image: uploadResult.url ? { ...image, publicUrl: uploadResult.url } : image,
        synced: true,
      };
    }

    if (uploadResult.localOnly) {
      console.log(`图片 ${image.fileName} 仅保存在本地`);
      return {
        image,
        synced: false,
        uploadError: uploadResult.error || "仅保存在本地，未成功上传到 Supabase。",
      };
    }

    console.error(`图片 ${image.fileName} 上传失败:`, uploadResult.error);
    return {
      image,
      synced: false,
      uploadError: uploadResult.error || "上传到 Supabase 失败。",
    };
  } catch (uploadError) {
    console.error(`图片 ${image.fileName} 上传出错:`, uploadError);
    return {
      image,
      synced: false,
      uploadError: uploadError instanceof Error ? uploadError.message : "上传到 Supabase 时发生未知错误。",
    };
  }
}

export function useImageGeneration(onTaskUpdate?: (task: Task) => void): UseImageGenerationReturn {
  const [state, setState] = useState<ImageGenerationState>({
    isGenerating: false,
    currentModule: null,
    progress: 0,
    error: null,
  });

  const reset = useCallback(() => {
    setState({
      isGenerating: false,
      currentModule: null,
      progress: 0,
      error: null,
    });
  }, []);

  const generateImages = useCallback(
    async (task: Task) => {
      if (state.isGenerating) return;
      const targetModules = getTargetModules(task);

      setState({
        isGenerating: true,
        currentModule: targetModules[0] ?? null,
        progress: 0,
        error: null,
      });

      try {
        const hydratedReferenceImages = await hydrateReferenceImages(task.referenceImages);
        const request: GenerateImagesBatchRequest = {
          taskId: task.id,
          modules: targetModules,
          textContent: task.textContent,
          bookName: task.bookName,
          originSentence: task.sentence,
          referenceImages: hydratedReferenceImages,
        };

        const response = await generateImagesBatch(request);
        if (!response.success) {
          throw new Error("批量图片生成失败");
        }

        let updatedTask: Task = { ...task, referenceImages: hydratedReferenceImages };
        const generatedImages: Record<ModuleId, GeneratedImage> = {};
        let failedCount = 0;

        for (const result of response.results) {
          if (result.success && result.imageDataUrl) {
            const generatedImage = convertToGeneratedImage(
              result.moduleId,
              result,
              task.bookName,
              getSourceText(task, result.moduleId),
            );
            const persisted = await persistGeneratedImage(task.id, generatedImage);

            generatedImages[result.moduleId] = persisted.image;
            updatedTask = updateTaskSteps(updatedTask, result.moduleId, "done");
            updatedTask = addTaskLog(updatedTask, "success", `${moduleTitle(result.moduleId)}生成完成。`);

            if (persisted.synced) {
              updatedTask = addTaskLog(updatedTask, "info", `${moduleTitle(result.moduleId)}已上传到 Supabase。`);
            } else {
              updatedTask = addTaskLog(
                updatedTask,
                "error",
                `${moduleTitle(result.moduleId)}已生成，但上传到 Supabase 失败：${persisted.uploadError || "未知错误"}。当前仅保存在本地，可稍后手动同步。`,
              );
            }

            continue;
          }

          failedCount += 1;
          updatedTask = updateTaskSteps(updatedTask, result.moduleId, "error");
          updatedTask = addTaskLog(
            updatedTask,
            "error",
            `${moduleTitle(result.moduleId)}生成失败：${result.error || "未知错误"}`,
          );
        }

        const allGenerationStepsCompleted = updatedTask.steps
          .filter((step) => step.stage === "generation")
          .every((step) => step.status === "done");
        const now = new Date().toISOString();
        updatedTask = {
          ...updatedTask,
          generatedImages: {
            ...task.generatedImages,
            ...generatedImages,
          },
          status: failedCount ? "failed" : allGenerationStepsCompleted ? "completed" : "generating",
          currentStage: failedCount ? "failed" : allGenerationStepsCompleted ? "done" : "generation",
          progress: computeProgress(updatedTask),
          updatedAt: now,
          completedAt: allGenerationStepsCompleted ? now : undefined,
        };

        const tasks = loadTasks();
        const taskIndex = tasks.findIndex((item) => item.id === task.id);
        if (taskIndex >= 0) {
          tasks[taskIndex] = updatedTask;
          saveTasks(tasks);
        }

        onTaskUpdate?.(updatedTask);

        setState({
          isGenerating: false,
          currentModule: null,
          progress: Math.round((Object.keys(generatedImages).length / Math.max(targetModules.length, 1)) * 100),
          error: failedCount ? "部分图片生成失败，请查看任务日志并重试。" : null,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "图片生成失败";

        setState({
          isGenerating: false,
          currentModule: null,
          progress: 0,
          error: errorMessage,
        });

        const failedTask: Task = {
          ...addTaskLog(task, "error", `图片生成失败：${errorMessage}`),
          status: "failed",
          currentStage: "failed",
          updatedAt: new Date().toISOString(),
        };

        const tasks = loadTasks();
        const taskIndex = tasks.findIndex((item) => item.id === task.id);
        if (taskIndex >= 0) {
          tasks[taskIndex] = failedTask;
          saveTasks(tasks);
        }

        onTaskUpdate?.(failedTask);
      }
    },
    [onTaskUpdate, state.isGenerating],
  );

  return {
    state,
    generateImages,
    reset,
  };
}
