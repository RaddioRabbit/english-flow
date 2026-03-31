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

async function playAudioPreview(audioDataUrl: string, durationSeconds: number, onTimeUpdate?: (currentTime: number) => void, signal?: AbortSignal): Promise<number> {
  // 使用 AudioContext 实现精确的时间同步，而不是依赖 setInterval 查询 audio.currentTime
  // 这样可以确保字幕时间与音频播放严格同步
  const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

  try {
    // 解码音频数据
    const response = await fetch(audioDataUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

    // 创建音频源节点
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    const startTime = audioContext.currentTime + 0.05; // 添加小延迟确保准确开始
    const segmentDuration = audioBuffer.duration;

    // 启动时间更新 - 使用 requestAnimationFrame 实现更平滑的字幕更新
    let animationFrameId: number | null = null;
    let isPlaying = true;

    const updateTime = () => {
      if (!isPlaying) return;

      const elapsed = audioContext.currentTime - startTime;
      if (elapsed >= 0 && elapsed <= segmentDuration) {
        onTimeUpdate?.(elapsed);
      }

      if (elapsed < segmentDuration) {
        animationFrameId = requestAnimationFrame(updateTime);
      }
    };

    if (onTimeUpdate) {
      animationFrameId = requestAnimationFrame(updateTime);
    }

    // 播放音频
    source.start(startTime);

    // 等待音频播放完成 - 必须等待 source.onended 确保音频完全播放
    // 使用实际解码后的 audioBuffer.duration 作为最大等待时间，而不是传入的 durationSeconds
    const maxWaitTime = Math.ceil(segmentDuration * 1000) + 2000; // 添加 2 秒缓冲
    await Promise.race([
      new Promise<void>((resolve) => {
        source.onended = () => {
          isPlaying = false;
          if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
          }
          // 最后一次更新时间，确保字幕显示到结束
          onTimeUpdate?.(segmentDuration);
          resolve();
        };
      }),
      wait(maxWaitTime, signal), // 仅作为安全超时，防止音频事件不触发
    ]);

    // 返回实际播放的音频时长，用于校准时间轴
    return segmentDuration;
  } catch {
    // 降级到普通 Audio 元素播放（不同步字幕）
    const audio = new Audio(audioDataUrl);
    audio.preload = "auto";

    try {
      // 先等待音频元数据加载完成，确保 audio.duration 有效
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error("音频元数据加载超时"));
        }, AUDIO_METADATA_TIMEOUT_MS);

        const cleanup = () => {
          window.clearTimeout(timeout);
          audio.onloadedmetadata = null;
          audio.onerror = null;
        };

        if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
          cleanup();
          resolve();
          return;
        }

        audio.onloadedmetadata = () => {
          cleanup();
          resolve();
        };
        audio.onerror = () => {
          cleanup();
          reject(new Error("音频加载失败"));
        };
      });

      const actualDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : durationSeconds;

      await audio.play();
      // 等待音频实际播放完成，使用实际音频时长 + 3秒缓冲作为安全超时
      const maxWaitTime = Math.ceil(actualDuration * 1000) + 3000;
      await Promise.race([
        new Promise<void>((resolve) => {
          audio.onended = () => resolve();
        }),
        wait(maxWaitTime, signal),
      ]);
      // 返回实际音频时长
      return actualDuration;
    } finally {
      audio.pause();
      audio.src = "";
    }
  } finally {
    if (audioContext.state !== "closed") {
      await audioContext.close().catch(() => undefined);
    }
  }
}

async function waitForDuration(
  durationSeconds: number,
  onTimeUpdate?: (currentTime: number) => void,
  signal?: AbortSignal,
) {
  if (!onTimeUpdate) {
    return wait(durationSeconds * 1000, signal);
  }

  // 使用更精细的计时来更新字幕时间
  const startTime = performance.now();
  const intervalMs = 50;
  const durationMs = durationSeconds * 1000;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, durationMs);

    const intervalTimer = window.setInterval(() => {
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed < durationSeconds) {
        onTimeUpdate(elapsed);
      }
    }, intervalMs);

    const cleanup = () => {
      window.clearTimeout(timer);
      window.clearInterval(intervalTimer);
      signal?.removeEventListener("abort", handleAbort);
    };

    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
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

    // 使用实际音频时长总和作为片段时长，确保与语音播放完全同步
    const actualAudioDuration = segmentDurations.reduce((total, duration) => total + duration, 0);
    const subtitles = buildClipSubtitleCues(clip, segmentDurations);
    preparedClips.push({
      ...clip,
      exportImageDataUrl,
      durationSeconds: actualAudioDuration, // 使用实际音频时长总和，而不是字幕时长总和
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
): Promise<number> {
  reportProgress({
    stage: "recording",
    progress: 30 + (elapsedSeconds / Math.max(totalDurationSeconds, 0.001)) * 62,
    message: `正在合成第 ${clipIndex + 1}/${clipCount} 张：${preparedClip.moduleName}`,
    clipIndex: clipIndex + 1,
    moduleId: preparedClip.moduleId,
    moduleName: preparedClip.moduleName,
    imageSrc: preparedClip.imageSrc,
  });

  // 构建字幕时间轴，用于根据当前播放时间查找应显示的字幕
  const subtitleTimeline = preparedClip.subtitles.map((subtitle, index) => ({
    index,
    text: subtitle.text,
    startSeconds: subtitle.startSeconds,
    endSeconds: subtitle.endSeconds,
  }));

  // 根据当前播放时间更新字幕的函数
  const updateSubtitleByTime = (currentTimeSeconds: number) => {
    // 找到当前时间对应的字幕
    const currentSubtitle = subtitleTimeline.find(
      (sub) => currentTimeSeconds >= sub.startSeconds && currentTimeSeconds < sub.endSeconds
    );
    if (currentSubtitle) {
      onSubtitleTextChange?.(currentSubtitle.text);
    }
  };

  // 顺序播放每个音频段，并在播放过程中同步更新字幕
  let actualClipDuration = 0;
  for (let segmentIndex = 0; segmentIndex < preparedClip.audioSegments.length; segmentIndex += 1) {
    const segment = preparedClip.audioSegments[segmentIndex];
    const durationSeconds = preparedClip.segmentDurations[segmentIndex] ?? 1;

    // 计算此段相对于片段开始的时间偏移
    const segmentStartOffset = actualClipDuration;

    // 创建时间更新回调，将相对时间转换为片段内的绝对时间
    const onTimeUpdate = (currentTimeInSegment: number) => {
      const absoluteTimeInClip = segmentStartOffset + currentTimeInSegment;
      updateSubtitleByTime(absoluteTimeInClip);
    };

    if (monitorAudio) {
      // 播放音频并获取实际播放时长
      const actualDuration = await playAudioPreview(segment.audioDataUrl, durationSeconds, onTimeUpdate, signal);
      actualClipDuration += actualDuration;
    } else {
      await waitForDuration(durationSeconds, onTimeUpdate, signal);
      actualClipDuration += durationSeconds;
    }

    const percent = 30 + ((elapsedSeconds + actualClipDuration) / Math.max(totalDurationSeconds, 0.001)) * 62;

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

  // 返回实际播放的片段时长，用于校准总进度
  return actualClipDuration;
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
    // 获取实际播放的片段时长，用于校准总进度
    const actualClipDuration = await simulateClipPlayback(
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
    // 使用实际播放时长累加，确保进度准确
    elapsedSeconds += actualClipDuration;
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
