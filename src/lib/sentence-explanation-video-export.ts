import type {
  SentenceExplanationVideoApiSubtitleCue,
  SentenceExplanationVideoSubtitleStyle,
  SentenceExplanationVideoRequest,
} from "@/lib/sentence-explanation-video-contract";
import {
  createSentenceExplanationVideoPlan,
  type GenerateSentenceExplanationVideoOptions,
  type SentenceExplanationVideoClipPlan,
  type SentenceExplanationVideoProgress,
  type SentenceExplanationVideoResult,
  type SentenceExplanationVideoSubtitleCue,
  type SentenceExplanationVideoSubtitleTrack,
} from "@/lib/sentence-explanation-video";
import { normalizeImageSourceToDataUrl } from "@/lib/media-utils";
import {
  stripSentenceExplanationLineEndingPunctuation,
  type SentenceExplanationArticle,
} from "@/lib/sentence-explanation-contract";
import type { Task } from "@/lib/task-store";

interface PreparedClip extends SentenceExplanationVideoClipPlan {
  exportImageDataUrl: string;
  durationSeconds: number;
  segmentDurations: number[];
  subtitles: SentenceExplanationVideoApiSubtitleCue[];
}

const AUDIO_METADATA_TIMEOUT_MS = 15_000;

function createAbortError() {
  return new DOMException("视频生成已取消。", "AbortError");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function clampProgress(progress: number) {
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function sanitizeFileNamePart(value: string) {
  return value.replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim();
}

function buildVideoFileName(task: Task) {
  const baseName = sanitizeFileNamePart(`${task.bookName || "english-flow"} sentence explanation`);
  return `${baseName || "english-flow sentence explanation"} video.mp4`;
}

function createProgressReporter(
  clipCount: number,
  onProgress?: (progress: SentenceExplanationVideoProgress) => void,
) {
  return (payload: Omit<SentenceExplanationVideoProgress, "clipCount">) => {
    onProgress?.({
      clipCount,
      ...payload,
      progress: clampProgress(payload.progress),
    });
  };
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const cleanup = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", handleAbort);
    };

    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function loadAudioDuration(audioDataUrl: string, signal?: AbortSignal) {
  return new Promise<number>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const audio = new Audio();
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("语音元数据加载超时，请重试。"));
    }, AUDIO_METADATA_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      signal?.removeEventListener("abort", handleAbort);
    };

    const handleAbort = () => {
      cleanup();
      audio.pause();
      audio.src = "";
      reject(createAbortError());
    };

    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 1;
      cleanup();
      resolve(duration);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("语音元数据加载失败，请重试。"));
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
    audio.src = audioDataUrl;
  });
}

async function playAudioPreview(audioDataUrl: string, durationSeconds: number, signal?: AbortSignal) {
  const audio = new Audio(audioDataUrl);
  audio.preload = "auto";

  try {
    await audio.play();
    await Promise.race([
      new Promise<void>((resolve) => {
        audio.onended = () => resolve();
      }),
      wait(durationSeconds * 1000 + 120, signal),
    ]);
  } catch {
    await wait(durationSeconds * 1000, signal);
  } finally {
    audio.pause();
    audio.src = "";
  }
}

function buildClipSubtitleCues(
  clip: SentenceExplanationVideoClipPlan,
  segmentDurations: number[],
): SentenceExplanationVideoApiSubtitleCue[] {
  let cursor = 0;

  return clip.audioSegments.map((segment, index) => {
    const durationSeconds = segmentDurations[index] ?? 1;
    const startSeconds = cursor;
    const endSeconds = startSeconds + durationSeconds;
    cursor = endSeconds;

    const subtitleText = stripSentenceExplanationLineEndingPunctuation(segment.text) || segment.text.trim();

    return {
      role: segment.role,
      text: subtitleText,
      lineIndex: typeof segment.lineIndex === "number" ? segment.lineIndex : index,
      startSeconds,
      endSeconds,
      durationSeconds,
    };
  });
}

function formatSrtTimestamp(seconds: number) {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

function buildSubtitleTrack(preparedClips: PreparedClip[]): SentenceExplanationVideoSubtitleTrack {
  let timelineCursor = 0;
  const cues: SentenceExplanationVideoSubtitleCue[] = [];

  preparedClips.forEach((clip, clipIndex) => {
    clip.subtitles.forEach((subtitle) => {
      const startSeconds = timelineCursor + subtitle.startSeconds;
      const endSeconds = timelineCursor + subtitle.endSeconds;

      cues.push({
        moduleId: clip.moduleId,
        moduleName: clip.moduleName,
        clipIndex,
        role: subtitle.role,
        lineIndex: subtitle.lineIndex,
        text: subtitle.text,
        startSeconds,
        endSeconds,
        durationSeconds: subtitle.durationSeconds,
      });
    });

    timelineCursor += clip.durationSeconds;
  });

  const srtText = cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatSrtTimestamp(cue.startSeconds)} --> ${formatSrtTimestamp(cue.endSeconds)}\n${cue.text}`,
    )
    .join("\n\n");

  return {
    cues,
    srtText,
  };
}

async function prepareClipDurations(
  plan: SentenceExplanationVideoResult["plan"],
  reportProgress: (progress: Omit<SentenceExplanationVideoProgress, "clipCount">) => void,
  signal?: AbortSignal,
) {
  const preparedClips: PreparedClip[] = [];

  for (let index = 0; index < plan.clips.length; index += 1) {
    throwIfAborted(signal);

    const clip = plan.clips[index];
    reportProgress({
      stage: "preparing",
      progress: 14 + ((index + 1) / plan.clips.length) * 14,
      message: `正在准备第 ${index + 1}/${plan.clips.length} 张图片和对应语音...`,
      clipIndex: index,
      moduleId: clip.moduleId,
      moduleName: clip.moduleName,
      imageSrc: clip.imageSrc,
    });

    const exportImageDataUrl = await normalizeImageSourceToDataUrl(clip.imageSrc, signal);
    const segmentDurations: number[] = [];

    for (let audioIndex = 0; audioIndex < clip.audioSegments.length; audioIndex += 1) {
      reportProgress({
        stage: "preparing",
        progress: 14 + ((index + 1) / plan.clips.length) * 14,
        message: `正在准备第 ${index + 1}/${plan.clips.length} 张的语音 ${audioIndex + 1}/${clip.audioSegments.length}...`,
        clipIndex: index,
        moduleId: clip.moduleId,
        moduleName: clip.moduleName,
        imageSrc: clip.imageSrc,
      });

      segmentDurations.push(await loadAudioDuration(clip.audioSegments[audioIndex].audioDataUrl, signal));
    }

    const subtitles = buildClipSubtitleCues(clip, segmentDurations);
    preparedClips.push({
      ...clip,
      exportImageDataUrl,
      durationSeconds: subtitles.reduce((total, subtitle) => total + subtitle.durationSeconds, 0),
      segmentDurations,
      subtitles,
    });
  }

  return preparedClips;
}

function buildRequestBody(
  taskId: string,
  article: SentenceExplanationArticle,
  clips: PreparedClip[],
  subtitleStyle?: SentenceExplanationVideoSubtitleStyle,
) {
  return {
    taskId,
    title: article.title || "sentence explanation",
    clips: clips.map((clip) => ({
      moduleId: clip.moduleId,
      moduleName: clip.moduleName,
      imageDataUrl: clip.exportImageDataUrl,
      durationSeconds: clip.durationSeconds,
      audioSegments: clip.audioSegments.map((segment) => ({
        role: segment.role,
        text: segment.text,
        audioDataUrl: segment.audioDataUrl,
        lineIndex: segment.lineIndex,
      })),
      subtitles: clip.subtitles,
    })),
    subtitleStyle,
  } satisfies SentenceExplanationVideoRequest;
}

async function requestSentenceExplanationVideoMp4(
  taskId: string,
  article: SentenceExplanationArticle,
  clips: PreparedClip[],
  subtitleStyle: SentenceExplanationVideoSubtitleStyle | undefined,
  signal?: AbortSignal,
) {
  const response = await fetch("/api/sentence-explanation-video", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(buildRequestBody(taskId, article, clips, subtitleStyle)),
    signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || "MP4 视频生成失败，请稍后重试。");
  }

  return response.blob();
}

async function simulateClipPlayback(
  preparedClip: PreparedClip,
  totalDurationSeconds: number,
  elapsedSeconds: number,
  clipIndex: number,
  clipCount: number,
  monitorAudio: boolean,
  reportProgress: (progress: Omit<SentenceExplanationVideoProgress, "clipCount">) => void,
  onSubtitleTextChange?: (text: string) => void,
  signal?: AbortSignal,
) {
  reportProgress({
    stage: "recording",
    progress: 30 + (elapsedSeconds / Math.max(totalDurationSeconds, 0.001)) * 62,
    message: `正在合成第 ${clipIndex + 1}/${clipCount} 张：${preparedClip.moduleName}`,
    clipIndex: clipIndex + 1,
    moduleId: preparedClip.moduleId,
    moduleName: preparedClip.moduleName,
    imageSrc: preparedClip.imageSrc,
  });

  for (let segmentIndex = 0; segmentIndex < preparedClip.audioSegments.length; segmentIndex += 1) {
    const durationSeconds = preparedClip.segmentDurations[segmentIndex] ?? 1;
    onSubtitleTextChange?.(preparedClip.subtitles[segmentIndex]?.text || preparedClip.audioSegments[segmentIndex]?.text || "");

    if (monitorAudio) {
      await playAudioPreview(preparedClip.audioSegments[segmentIndex].audioDataUrl, durationSeconds, signal);
    } else {
      await wait(durationSeconds * 1000, signal);
    }

    const clipElapsed = preparedClip.segmentDurations
      .slice(0, segmentIndex + 1)
      .reduce((total, duration) => total + duration, 0);
    const percent = 30 + ((elapsedSeconds + clipElapsed) / Math.max(totalDurationSeconds, 0.001)) * 62;

    reportProgress({
      stage: "recording",
      progress: percent,
      message: `正在合成第 ${clipIndex + 1}/${clipCount} 张：${preparedClip.moduleName}`,
      clipIndex: clipIndex + 1,
      moduleId: preparedClip.moduleId,
      moduleName: preparedClip.moduleName,
      imageSrc: preparedClip.imageSrc,
    });
  }
}

export async function buildSentenceExplanationVideoSubtitleTrack({
  task,
  article,
  tts,
  signal,
}: Pick<GenerateSentenceExplanationVideoOptions, "task" | "article" | "tts" | "signal">) {
  const plan = createSentenceExplanationVideoPlan(task, article, tts);
  const preparedClips = await prepareClipDurations(plan, () => undefined, signal);
  return buildSubtitleTrack(preparedClips);
}

export async function exportSentenceExplanationVideoMp4({
  task,
  article,
  tts,
  subtitleStyle,
  signal,
  onProgress,
  onSubtitleTextChange,
  monitorAudio = false,
}: GenerateSentenceExplanationVideoOptions): Promise<SentenceExplanationVideoResult> {
  const plan = createSentenceExplanationVideoPlan(task, article, tts);
  const reportProgress = createProgressReporter(plan.clips.length, onProgress);

  reportProgress({
    stage: "preparing",
    progress: 6,
    message: "正在初始化 Claude Code 视频任务...",
    clipIndex: 0,
  });

  throwIfAborted(signal);

  reportProgress({
    stage: "invoking-skill",
    progress: 12,
    message: "LLM 正在调用 `sentence-explanation-video` skill...",
    clipIndex: 0,
  });

  const preparedClips = await prepareClipDurations(plan, reportProgress, signal);
  const subtitleTrack = buildSubtitleTrack(preparedClips);
  const totalDurationSeconds = preparedClips.reduce((total, clip) => total + clip.durationSeconds, 0);
  const serverRequest = requestSentenceExplanationVideoMp4(task.id, article, preparedClips, subtitleStyle, signal)
    .then((blob) => ({ blob }))
    .catch((error) => ({ error }));

  let elapsedSeconds = 0;
  for (let index = 0; index < preparedClips.length; index += 1) {
    throwIfAborted(signal);
    await simulateClipPlayback(
      preparedClips[index],
      totalDurationSeconds,
      elapsedSeconds,
      index,
      preparedClips.length,
      monitorAudio,
      reportProgress,
      onSubtitleTextChange,
      signal,
    );
    elapsedSeconds += preparedClips[index].durationSeconds;
  }

  onSubtitleTextChange?.("");

  reportProgress({
    stage: "exporting",
    progress: 95,
    message: "正在导出 MP4 视频文件...",
    clipIndex: preparedClips.length,
    moduleId: preparedClips[preparedClips.length - 1]?.moduleId,
    moduleName: preparedClips[preparedClips.length - 1]?.moduleName,
    imageSrc: preparedClips[preparedClips.length - 1]?.imageSrc,
  });

  const serverResult = await serverRequest;
  if ("error" in serverResult) {
    throw serverResult.error;
  }

  if (!serverResult.blob.size) {
    throw new Error("导出的 MP4 视频为空，请重新生成。");
  }

  const objectUrl = URL.createObjectURL(serverResult.blob);

  reportProgress({
    stage: "completed",
    progress: 100,
    message: "MP4 视频生成完成。",
    clipIndex: preparedClips.length,
    moduleId: preparedClips[preparedClips.length - 1]?.moduleId,
    moduleName: preparedClips[preparedClips.length - 1]?.moduleName,
    imageSrc: preparedClips[preparedClips.length - 1]?.imageSrc,
  });

  return {
    blob: serverResult.blob,
    objectUrl,
    fileName: buildVideoFileName(task),
    mimeType: "video/mp4",
    durationSeconds: totalDurationSeconds,
    plan,
    subtitleTrack,
  };
}
