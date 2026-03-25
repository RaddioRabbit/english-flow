import {
  DEFAULT_TEXT_ANALYSIS_REQUEST_TIMEOUT_MS,
  type TextAnalysisMode,
  type TextAnalysisRequest,
  type TextAnalysisResponse,
} from "@/lib/text-analysis-contract";
import type { TextContent } from "@/lib/task-store";

export const TEXT_ANALYSIS_REQUEST_TIMEOUT_MS = DEFAULT_TEXT_ANALYSIS_REQUEST_TIMEOUT_MS;

interface AnalyzeSentenceInput {
  sentence: string;
  bookName: string;
  author: string;
  mode: TextAnalysisMode;
  currentTextContent?: TextContent;
}

export async function analyzeSentenceText(input: AnalyzeSentenceInput): Promise<TextAnalysisResponse> {
  const requestBody: TextAnalysisRequest = {
    sentence: input.sentence,
    bookName: input.bookName,
    author: input.author,
    mode: input.mode,
    currentTextContent: input.currentTextContent,
  };

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TEXT_ANALYSIS_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/text-analysis", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as
      | (Partial<TextAnalysisResponse> & { error?: string })
      | null;

    if (!response.ok) {
      throw new Error(payload?.error || "鏂囨湰瑙ｆ瀽澶辫触锛岃绋嶅悗閲嶈瘯銆?");
    }

    if (!payload?.textContent || !payload.source || !payload.model) {
      throw new Error("鏂囨湰瑙ｆ瀽鎺ュ彛杩斿洖浜嗘棤鏁堟暟鎹€?");
    }

    return payload as TextAnalysisResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("鏂囨湰瑙ｆ瀽瓒呮椂锛岃閲嶈瘯銆?");
    }

    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
