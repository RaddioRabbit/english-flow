import type { SentenceExplanationResponse } from "@/lib/sentence-explanation-contract";
import type { SentenceExplanationTtsResponse } from "@/lib/sentence-explanation-tts-contract";

export interface SentenceExplanationRuntimeState {
  explanation: SentenceExplanationResponse | null;
  tts: SentenceExplanationTtsResponse | null;
  updatedAt: string;
}

const runtimeStore = new Map<string, SentenceExplanationRuntimeState>();

function createEmptyState(): SentenceExplanationRuntimeState {
  return {
    explanation: null,
    tts: null,
    updatedAt: new Date().toISOString(),
  };
}

export function getSentenceExplanationRuntimeState(taskId?: string) {
  if (!taskId) {
    return null;
  }

  return runtimeStore.get(taskId) ?? null;
}

export function saveSentenceExplanationRuntimeState(
  taskId: string,
  patch: Partial<Omit<SentenceExplanationRuntimeState, "updatedAt">>,
) {
  const current = runtimeStore.get(taskId) ?? createEmptyState();
  const nextState: SentenceExplanationRuntimeState = {
    explanation: patch.explanation === undefined ? current.explanation : patch.explanation,
    tts: patch.tts === undefined ? current.tts : patch.tts,
    updatedAt: new Date().toISOString(),
  };

  runtimeStore.set(taskId, nextState);
  return nextState;
}

export function clearSentenceExplanationRuntimeState(taskId?: string) {
  if (!taskId) {
    return;
  }

  runtimeStore.delete(taskId);
}
