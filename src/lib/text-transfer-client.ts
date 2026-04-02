import type { TextTransferRequest, TextTransferResponse } from "./text-transfer-contract";

const TIMEOUT_MS = 300_000; // 5 min — align with the python script timeout window

export async function transferTextStyle(request: TextTransferRequest): Promise<TextTransferResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch("/api/text-transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => null)) as TextTransferResponse | null;
    if (!res.ok) {
      return {
        success: false,
        error: data?.success === false ? data.error : `请求失败（HTTP ${res.status}）`,
      };
    }

    return data ?? { success: false, error: "服务端返回了无效响应" };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { success: false, error: "请求超时（超过 5 分钟），请稍后重试" };
    }
    return { success: false, error: err instanceof Error ? err.message : "网络错误" };
  } finally {
    clearTimeout(timeoutId);
  }
}
