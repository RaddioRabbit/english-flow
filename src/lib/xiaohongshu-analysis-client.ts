import type { XiaohongshuAnalysisRequest, XiaohongshuAnalysisResponse } from "./xiaohongshu-analysis-contract";

export async function generateXiaohongshuAnalysis(request: XiaohongshuAnalysisRequest): Promise<XiaohongshuAnalysisResponse> {
  const response = await fetch("/api/xiaohongshu-analysis", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });

  const data = (await response.json()) as { error?: string } & Partial<XiaohongshuAnalysisResponse>;

  if (!response.ok || data.error) {
    throw new Error(data.error || "小红书文案生成失败，请稍后重试。");
  }

  if (!data.titles || !data.content) {
    throw new Error("小红书文案生成结果不完整，请稍后重试。");
  }

  return {
    titles: data.titles,
    content: data.content,
  };
}
