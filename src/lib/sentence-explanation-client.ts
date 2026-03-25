import type { Task } from "@/lib/task-store";
import type { ModuleId } from "@/lib/task-store";
import {
  sentenceExplanationModuleOrder,
  type SentenceExplanationArticle,
  type SentenceExplanationRegenerationTarget,
  type SentenceExplanationRequest,
  type SentenceExplanationResponse,
} from "@/lib/sentence-explanation-contract";

export const SENTENCE_EXPLANATION_REQUEST_TIMEOUT_MS = 360_000;

export interface GenerateSentenceExplanationOptions {
  currentArticle?: SentenceExplanationArticle;
  regenerationTarget?: SentenceExplanationRegenerationTarget;
}

function pickBestImageSource(task: Task, moduleId: ModuleId) {
  const image = task.generatedImages?.[moduleId];
  if (!image) {
    return "";
  }

  return image.dataUrl || image.publicUrl || "";
}

export async function generateSentenceExplanation(
  task: Task,
  options: GenerateSentenceExplanationOptions = {},
): Promise<SentenceExplanationResponse> {
  const requestBody: SentenceExplanationRequest = {
    taskId: task.id,
    originalSentence: task.sentence,
    bookName: task.bookName,
    author: task.author,
    textContent: task.textContent,
    images: Object.fromEntries(
      sentenceExplanationModuleOrder
        .map((moduleId) => [moduleId, pickBestImageSource(task, moduleId)])
        .filter((entry): entry is [ModuleId, string] => Boolean(entry[1])),
    ) as Partial<Record<ModuleId, string>>,
    currentArticle: options.currentArticle,
    regenerationTarget: options.regenerationTarget,
  };

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SENTENCE_EXPLANATION_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/sentence-explanation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    const jsonSource = typeof response.clone === "function" ? response.clone() : response;
    const payload = (await jsonSource.json().catch(() => null)) as
      | (Partial<SentenceExplanationResponse> & { error?: string })
      | null;

    if (!response.ok) {
      throw new Error(payload?.error || `句子讲解生成失败（HTTP ${response.status}），请稍后重试。`);
    }

    if (!payload?.article || !payload?.orderedModules || !payload?.source || !payload?.model) {
      throw new Error("句子讲解接口返回了无效数据。");
    }

    return payload as SentenceExplanationResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("句子讲解生成超时，请重试。");
    }

    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
