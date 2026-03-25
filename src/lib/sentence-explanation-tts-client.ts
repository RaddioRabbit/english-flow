import type { Task } from "@/lib/task-store";
import type {
  SentenceExplanationTtsLanguage,
  SentenceExplanationTtsPreviewRequest,
  SentenceExplanationTtsPreviewResponse,
  SentenceExplanationTtsVoice,
  SentenceExplanationTtsRequest,
  SentenceExplanationTtsResponse,
} from "@/lib/sentence-explanation-tts-contract";
import type { SentenceExplanationArticle } from "@/lib/sentence-explanation-contract";

export const SENTENCE_EXPLANATION_TTS_REQUEST_TIMEOUT_MS = 600_000;

export async function generateSentenceExplanationTts(
  task: Task,
  article: SentenceExplanationArticle,
  options: {
    language?: SentenceExplanationTtsLanguage;
    voice?: SentenceExplanationTtsVoice;
    speed?: number;
  } = {},
): Promise<SentenceExplanationTtsResponse> {
  const requestBody: SentenceExplanationTtsRequest = {
    taskId: task.id,
    article,
    language: options.language,
    voice: options.voice,
    speed: options.speed,
  };

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SENTENCE_EXPLANATION_TTS_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/sentence-explanation-tts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    const jsonSource = typeof response.clone === "function" ? response.clone() : response;
    const payload = (await jsonSource.json().catch(() => null)) as
      | (Partial<SentenceExplanationTtsResponse> & { error?: string })
      | null;

    if (!response.ok) {
      throw new Error(payload?.error || `文本转语音失败（HTTP ${response.status}），请稍后重试。`);
    }

    if (
      !payload?.introduction ||
      !payload?.sections ||
      !payload?.conclusion ||
      !payload?.metadata ||
      !payload?.source ||
      !payload?.model
    ) {
      throw new Error("文本转语音接口返回了无效数据。");
    }

    return payload as SentenceExplanationTtsResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("文本转语音超时，请重试。");
    }

    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function previewSentenceExplanationTtsVoice(
  input: SentenceExplanationTtsPreviewRequest,
): Promise<SentenceExplanationTtsPreviewResponse> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SENTENCE_EXPLANATION_TTS_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/sentence-explanation-tts-preview", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    const jsonSource = typeof response.clone === "function" ? response.clone() : response;
    const payload = (await jsonSource.json().catch(() => null)) as
      | (Partial<SentenceExplanationTtsPreviewResponse> & { error?: string })
      | null;

    if (!response.ok) {
      throw new Error(payload?.error || `语音试听失败（HTTP ${response.status}），请稍后重试。`);
    }

    if (
      !payload?.language ||
      !payload?.voice ||
      typeof payload?.text !== "string" ||
      typeof payload?.generatedAt !== "string" ||
      !payload?.source ||
      !payload?.model
    ) {
      throw new Error("语音试听接口返回了无效数据。");
    }

    return payload as SentenceExplanationTtsPreviewResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("语音试听超时，请重试。");
    }

    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
