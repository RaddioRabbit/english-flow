import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TEXT_ANALYSIS_REQUEST_TIMEOUT_MS,
  analyzeSentenceText,
} from "@/lib/text-analysis-client";
import { DEFAULT_TEXT_ANALYSIS_STAGE_TIMEOUT_MS } from "@/lib/text-analysis-contract";
import {
  estimateParsingProgressPercentage,
  estimateRunningParsingStepCompletion,
} from "@/lib/task-text-analysis";

function createAbortError() {
  const error = new Error("Request aborted");
  error.name = "AbortError";
  return error;
}

function createHangingFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<never>((_, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(createAbortError());
        return;
      }

      signal?.addEventListener(
        "abort",
        () => {
          reject(createAbortError());
        },
        { once: true },
      );
    });
  });
}

function createFetchWithHangingJson() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;

    return Promise.resolve({
      ok: true,
      json: () =>
        new Promise<never>((_, reject) => {
          if (signal?.aborted) {
            reject(createAbortError());
            return;
          }

          signal?.addEventListener(
            "abort",
            () => {
              reject(createAbortError());
            },
            { once: true },
          );
        }),
    } satisfies Partial<Response> as Response);
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("text analysis request timeout", () => {
  it("keeps the default parsing timeout aligned with the 5 minute product requirement", () => {
    expect(DEFAULT_TEXT_ANALYSIS_STAGE_TIMEOUT_MS).toBe(300_000);
    expect(TEXT_ANALYSIS_REQUEST_TIMEOUT_MS).toBe(DEFAULT_TEXT_ANALYSIS_STAGE_TIMEOUT_MS + 5_000);
  });

  it("aborts text analysis requests that exceed the client timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = createHangingFetch();
    vi.stubGlobal("fetch", fetchMock);

    const promise = analyzeSentenceText({
      sentence: "However, I said no more to the boy.",
      bookName: "Robinson Crusoe",
      author: "Daniel Defoe",
      mode: "segmentation",
    });
    const expectation = expect(promise).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(TEXT_ANALYSIS_REQUEST_TIMEOUT_MS);

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts text analysis requests that hang while parsing the JSON body", async () => {
    vi.useFakeTimers();
    const fetchMock = createFetchWithHangingJson();
    vi.stubGlobal("fetch", fetchMock);

    const promise = analyzeSentenceText({
      sentence: "However, I said no more to the boy.",
      bookName: "Robinson Crusoe",
      author: "Daniel Defoe",
      mode: "segmentation",
    });
    const expectation = expect(promise).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(TEXT_ANALYSIS_REQUEST_TIMEOUT_MS);

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("parsing progress estimation", () => {
  it("keeps the running step below completion while still moving forward", () => {
    const initial = estimateRunningParsingStepCompletion("segmentation", 0);
    const later = estimateRunningParsingStepCompletion("segmentation", 30_000);
    const muchLater = estimateRunningParsingStepCompletion("segmentation", 240_000);

    expect(initial).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(initial);
    expect(muchLater).toBeLessThan(1);
  });

  it("never reports less than finished work and caps in-flight progress below the max", () => {
    const progress = estimateParsingProgressPercentage({
      totalSteps: 4,
      completedSteps: 1,
      runningMode: "segmentation",
      elapsedMs: 120_000,
    });

    expect(progress).toBeGreaterThanOrEqual(25);
    expect(progress).toBeLessThan(50);
  });
});
