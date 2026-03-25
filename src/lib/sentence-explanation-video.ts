import {
  sentenceExplanationModuleLabels,
  sentenceExplanationModuleOrder,
  type SentenceExplanationArticle,
} from "@/lib/sentence-explanation-contract";
import type { SentenceExplanationVideoSubtitleStyle } from "@/lib/sentence-explanation-video-contract";
import type { SentenceExplanationTtsResponse } from "@/lib/sentence-explanation-tts-contract";
import type { ModuleId, Task } from "@/lib/task-store";

type VideoAudioRole = "introduction" | "section" | "conclusion";
type VideoProgressStage = "preparing" | "invoking-skill" | "recording" | "exporting" | "completed";

interface SentenceExplanationVideoAudioSegment {
  role: VideoAudioRole;
  text: string;
  audioDataUrl: string;
  lineIndex: number;
  durationSeconds?: number;
}

export interface SentenceExplanationVideoClipPlan {
  moduleId: ModuleId;
  moduleName: string;
  imageSrc: string;
  audioSegments: SentenceExplanationVideoAudioSegment[];
}

export interface SentenceExplanationVideoPlan {
  title: string;
  clips: SentenceExplanationVideoClipPlan[];
  totalAudioSegments: number;
}

export interface SentenceExplanationVideoSubtitleCue {
  moduleId: ModuleId;
  moduleName: string;
  clipIndex: number;
  role: VideoAudioRole;
  lineIndex: number;
  text: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
}

export interface SentenceExplanationVideoSubtitleTrack {
  cues: SentenceExplanationVideoSubtitleCue[];
  srtText: string;
}

export interface SentenceExplanationVideoProgress {
  stage: VideoProgressStage;
  progress: number;
  message: string;
  clipIndex: number;
  clipCount: number;
  moduleId?: ModuleId;
  moduleName?: string;
  imageSrc?: string;
}

export interface SentenceExplanationVideoResult {
  blob: Blob;
  objectUrl: string;
  fileName: string;
  mimeType: string;
  durationSeconds: number;
  plan: SentenceExplanationVideoPlan;
  subtitleTrack?: SentenceExplanationVideoSubtitleTrack;
}

export interface GenerateSentenceExplanationVideoOptions {
  task: Task;
  article: SentenceExplanationArticle;
  tts: SentenceExplanationTtsResponse;
  subtitleStyle?: SentenceExplanationVideoSubtitleStyle;
  monitorAudio?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: SentenceExplanationVideoProgress) => void;
  onSubtitleTextChange?: (text: string) => void;
}

interface PreparedClip extends SentenceExplanationVideoClipPlan {
  image: HTMLImageElement;
  audioBuffers: AudioBuffer[];
  durationSeconds: number;
  subtitles: SentenceExplanationVideoSubtitleCue[];
  clipIndex: number;
}

const VIDEO_WIDTH = 960;
const VIDEO_HEIGHT = 1280;
const VIDEO_FPS = 30;
const IMAGE_LOAD_TIMEOUT_MS = 15_000;
const AUDIO_DECODE_TIMEOUT_MS = 20_000;

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

    if (signal) {
      signal.addEventListener("abort", handleAbort, { once: true });
    }
  });
}

function startRecorder(recorder: MediaRecorder, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();

      if (recorder.state === "recording" || recorder.state === "paused") {
        resolve();
        return;
      }

      reject(new Error("视频录制启动超时，请重试。"));
    }, 3_000);

    const cleanup = () => {
      window.clearTimeout(timer);
      recorder.removeEventListener("start", handleStart);
      recorder.removeEventListener("error", handleError);
      signal?.removeEventListener("abort", handleAbort);
    };

    const handleStart = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error("视频录制启动失败，请稍后重试。"));
    };

    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    recorder.addEventListener("start", handleStart, { once: true });
    recorder.addEventListener("error", handleError, { once: true });
    signal?.addEventListener("abort", handleAbort, { once: true });

    try {
      recorder.start(250);

      if (recorder.state === "recording") {
        cleanup();
        resolve();
      }
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("视频录制启动失败，请稍后重试。"));
    }
  });
}

function sanitizeFileNamePart(value: string) {
  const invalidCharacters = new Set(["<", ">", ":", "\"", "/", "\\", "|", "?", "*"]);
  let sanitized = "";

  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    sanitized += invalidCharacters.has(character) || codePoint < 32 ? " " : character;
  }

  return sanitized.replace(/\s+/g, " ").trim();
}

function buildVideoFileName(task: Task) {
  const baseName = sanitizeFileNamePart(`${task.bookName || "english-flow"} sentence explanation`);
  return `${baseName || "english-flow sentence explanation"} video.webm`;
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

function getSupportedRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }

  const candidates = [
    "video/webm",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null;
}

function createAudioSegment(
  role: VideoAudioRole,
  text: string,
  audioDataUrl: string | null,
  lineIndex: number,
) {
  if (!audioDataUrl) {
    return null;
  }

  return {
    role,
    text,
    audioDataUrl,
    lineIndex,
  } satisfies SentenceExplanationVideoAudioSegment;
}

function createContentAudioSegments(
  role: VideoAudioRole,
  content:
    | SentenceExplanationTtsResponse["introduction"]
    | SentenceExplanationTtsResponse["conclusion"]
    | SentenceExplanationTtsResponse["sections"][number]["content"],
) {
  const lineAudios = Array.isArray(content.lineAudios) ? content.lineAudios : [];
  if (lineAudios.length) {
    return lineAudios
      .map((lineAudio, lineIndex) =>
        createAudioSegment(
          role,
          lineAudio.text || content.text,
          lineAudio.audioDataUrl,
          typeof lineAudio.lineIndex === "number" ? lineAudio.lineIndex : lineIndex,
        ),
      )
      .filter((segment): segment is SentenceExplanationVideoAudioSegment => Boolean(segment));
  }

  const fallback = createAudioSegment(role, content.text, content.audioDataUrl, 0);
  return fallback ? [fallback] : [];
}

function resolveModuleName(
  moduleId: ModuleId,
  article: SentenceExplanationArticle,
  tts: SentenceExplanationTtsResponse,
) {
  return (
    article.sections.find((section) => section.moduleId === moduleId)?.moduleName ||
    tts.sections.find((section) => section.moduleId === moduleId)?.moduleName ||
    sentenceExplanationModuleLabels[moduleId]
  );
}

function resolveImageSrc(task: Task, moduleId: ModuleId) {
  return task.generatedImages?.[moduleId]?.dataUrl || task.generatedImages?.[moduleId]?.publicUrl || "";
}

export function createSentenceExplanationVideoPlan(
  task: Task,
  article: SentenceExplanationArticle,
  tts: SentenceExplanationTtsResponse,
): SentenceExplanationVideoPlan {
  if (!article.sections.length) {
    throw new Error("句子讲解文章为空，无法生成视频。");
  }

  if (!createContentAudioSegments("introduction", tts.introduction).length) {
    throw new Error("缺少开场语音，无法生成视频。");
  }

  if (!createContentAudioSegments("conclusion", tts.conclusion).length) {
    throw new Error("缺少收尾语音，无法生成视频。");
  }

  const clips = sentenceExplanationModuleOrder.map((moduleId, index) => {
    const imageSrc = resolveImageSrc(task, moduleId);
    if (!imageSrc) {
      throw new Error(`缺少${sentenceExplanationModuleLabels[moduleId]}图片，无法生成视频。`);
    }

    const section = tts.sections.find((item) => item.moduleId === moduleId);
    const sectionAudioSegments = section ? createContentAudioSegments("section", section.content) : [];
    if (!sectionAudioSegments.length) {
      throw new Error(`缺少${sentenceExplanationModuleLabels[moduleId]}语音，无法生成视频。`);
    }

    const audioSegments = [
      ...(index === 0 ? createContentAudioSegments("introduction", tts.introduction) : []),
      ...sectionAudioSegments,
      ...(index === sentenceExplanationModuleOrder.length - 1
        ? createContentAudioSegments("conclusion", tts.conclusion)
        : []),
    ];

    return {
      moduleId,
      moduleName: resolveModuleName(moduleId, article, tts),
      imageSrc,
      audioSegments,
    } satisfies SentenceExplanationVideoClipPlan;
  });

  return {
    title: article.title || tts.title || "句子讲解视频",
    clips,
    totalAudioSegments: clips.reduce((total, clip) => total + clip.audioSegments.length, 0),
  };
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("图片加载超时，无法生成视频。"));
    }, IMAGE_LOAD_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
    };
    image.decoding = "async";
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => reject(new Error("图片加载失败，无法生成视频。"));
    image.onerror = () => {
      cleanup();
      reject(new Error("图片加载失败，无法生成视频。"));
    };
    image.src = src;
  });
}

function decodeArrayBuffer(
  audioContext: BaseAudioContext,
  arrayBuffer: ArrayBuffer,
  timeoutMs: number,
) {
  return new Promise<AudioBuffer>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("音频解码超时，请重试。"));
    }, timeoutMs);

    const finishResolve = (buffer: AudioBuffer) => {
      window.clearTimeout(timer);
      resolve(buffer);
    };

    const finishReject = (error: unknown) => {
      window.clearTimeout(timer);
      reject(error instanceof Error ? error : new Error("音频解码失败。"));
    };

    try {
      const maybePromise = audioContext.decodeAudioData(
        arrayBuffer.slice(0),
        (buffer) => finishResolve(buffer),
        (error) => finishReject(error),
      );

      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(finishResolve).catch(finishReject);
      }
    } catch (error) {
      finishReject(error);
    }
  });
}

async function decodeAudioBuffer(audioContext: AudioContext, audioDataUrl: string) {
  const response = await fetch(audioDataUrl);
  const arrayBuffer = await response.arrayBuffer();

  try {
    return await decodeArrayBuffer(audioContext, arrayBuffer, AUDIO_DECODE_TIMEOUT_MS);
  } catch {
    const fallbackContext = new AudioContext();

    try {
      return await decodeArrayBuffer(fallbackContext, arrayBuffer, AUDIO_DECODE_TIMEOUT_MS);
    } finally {
      if (fallbackContext.state !== "closed") {
        await fallbackContext.close().catch(() => undefined);
      }
    }
  }
}

function formatSrtTimestamp(seconds: number) {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

function buildClipSubtitleCues(
  clip: SentenceExplanationVideoClipPlan,
  audioBuffers: AudioBuffer[],
  clipIndex: number,
): SentenceExplanationVideoSubtitleCue[] {
  let cursor = 0;

  return clip.audioSegments.map((segment, index) => {
    const buffer = audioBuffers[index];
    const durationSeconds = buffer?.duration ?? 1;
    const startSeconds = cursor;
    const endSeconds = startSeconds + durationSeconds;
    cursor = endSeconds;

    return {
      moduleId: clip.moduleId,
      moduleName: clip.moduleName,
      clipIndex,
      role: segment.role,
      lineIndex: typeof segment.lineIndex === "number" ? segment.lineIndex : index,
      text: segment.text.trim(),
      startSeconds,
      endSeconds,
      durationSeconds,
    };
  });
}

function buildSubtitleTrack(preparedClips: PreparedClip[]): SentenceExplanationVideoSubtitleTrack {
  let timelineCursor = 0;
  const cues: SentenceExplanationVideoSubtitleCue[] = [];

  preparedClips.forEach((clip) => {
    clip.subtitles.forEach((subtitle) => {
      const startSeconds = timelineCursor + subtitle.startSeconds;
      const endSeconds = timelineCursor + subtitle.endSeconds;

      cues.push({
        moduleId: clip.moduleId,
        moduleName: clip.moduleName,
        clipIndex: clip.clipIndex,
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

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  scale = 1,
) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = VIDEO_WIDTH / VIDEO_HEIGHT;

  let drawWidth = VIDEO_WIDTH;
  let drawHeight = VIDEO_HEIGHT;

  if (imageRatio > canvasRatio) {
    drawHeight = VIDEO_HEIGHT;
    drawWidth = drawHeight * imageRatio;
  } else {
    drawWidth = VIDEO_WIDTH;
    drawHeight = drawWidth / imageRatio;
  }

  drawWidth *= scale;
  drawHeight *= scale;

  const x = (VIDEO_WIDTH - drawWidth) / 2;
  const y = (VIDEO_HEIGHT - drawHeight) / 2;

  context.drawImage(image, x, y, drawWidth, drawHeight);
}

function renderClipFrame(
  context: CanvasRenderingContext2D,
  clip: PreparedClip,
  startedAt: number,
) {
  const elapsedSeconds = Math.max(0, (performance.now() - startedAt) / 1000);
  const scale = 1 + Math.min(0.02, elapsedSeconds * 0.004);

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
  drawImageCover(context, clip.image, scale);
}

async function playAudioBuffers(
  audioContext: AudioContext,
  outputs: AudioNode[],
  buffers: AudioBuffer[],
  signal?: AbortSignal,
) {
  if (!buffers.length) {
    return 0;
  }

  const startAt = audioContext.currentTime + 0.08;
  let cursor = startAt;

  for (const buffer of buffers) {
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    outputs.forEach((output) => source.connect(output));
    source.onended = () => {
      source.disconnect();
    };
    source.start(cursor);
    cursor += buffer.duration;
  }

  const durationSeconds = Math.max(0, cursor - startAt);
  await wait(durationSeconds * 1000 + 120, signal);
  return durationSeconds;
}

export async function generateSentenceExplanationVideo({
  task,
  article,
  tts,
  signal,
  onProgress,
  monitorAudio = false,
}: GenerateSentenceExplanationVideoOptions): Promise<SentenceExplanationVideoResult> {
  if (typeof document === "undefined") {
    throw new Error("当前环境不支持视频生成。");
  }

  if (typeof HTMLCanvasElement === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error("当前浏览器不支持 Canvas 视频录制。");
  }

  const mimeType = getSupportedRecorderMimeType();
  if (!mimeType) {
    throw new Error("当前浏览器不支持导出 WebM 视频。");
  }

  const plan = createSentenceExplanationVideoPlan(task, article, tts);
  const reportProgress = createProgressReporter(plan.clips.length, onProgress);

  reportProgress({
    stage: "preparing",
    progress: 6,
    message: "正在初始化 Claude Code 视频任务...",
    clipIndex: 0,
  });

  throwIfAborted(signal);

  const audioContext = new AudioContext();
  await audioContext.resume();

  reportProgress({
    stage: "invoking-skill",
    progress: 12,
    message: "LLM 正在调用 `sentence-explanation-video` skill...",
    clipIndex: 0,
  });

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

    const image = await loadImageElement(clip.imageSrc);
    const audioBuffers: AudioBuffer[] = [];

    for (let audioIndex = 0; audioIndex < clip.audioSegments.length; audioIndex += 1) {
      const segment = clip.audioSegments[audioIndex];
      reportProgress({
        stage: "preparing",
        progress: 14 + ((index + 1) / plan.clips.length) * 14,
        message: `正在准备第 ${index + 1}/${plan.clips.length} 张的语音 ${audioIndex + 1}/${clip.audioSegments.length}...`,
        clipIndex: index,
        moduleId: clip.moduleId,
        moduleName: clip.moduleName,
        imageSrc: clip.imageSrc,
      });

      audioBuffers.push(await decodeAudioBuffer(audioContext, segment.audioDataUrl));
    }

    const subtitles = buildClipSubtitleCues(clip, audioBuffers, index);

    preparedClips.push({
      ...clip,
      image,
      audioBuffers,
      durationSeconds: audioBuffers.reduce((total, buffer) => total + buffer.duration, 0),
      subtitles,
      clipIndex: index,
    });
  }

  throwIfAborted(signal);

  const totalDurationSeconds = preparedClips.reduce((total, clip) => total + clip.durationSeconds, 0);
  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法创建视频画布。");
  }

  const canvasStream = canvas.captureStream(VIDEO_FPS);
  const audioDestination = audioContext.createMediaStreamDestination();
  const mixedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDestination.stream.getAudioTracks(),
  ]);

  const recorder = new MediaRecorder(mixedStream, { mimeType });
  const chunks: BlobPart[] = [];
  const recorderDone = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) {
        chunks.push(event.data);
      }
    };
    recorder.onerror = () => reject(new Error("视频录制失败，请稍后重试。"));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  let frameTimer: number | null = null;
  let currentClip = preparedClips[0] ?? null;
  let clipStartedAt = performance.now();
  let objectUrl = "";
  const lastPreparedClip = preparedClips[preparedClips.length - 1];

  try {
    if (currentClip) {
      renderClipFrame(context, currentClip, clipStartedAt);
    }

    frameTimer = window.setInterval(() => {
      if (currentClip) {
        renderClipFrame(context, currentClip, clipStartedAt);
      }
    }, Math.round(1000 / VIDEO_FPS));

    await startRecorder(recorder, signal);
    await wait(120, signal);

    let elapsedSeconds = 0;

    for (let index = 0; index < preparedClips.length; index += 1) {
      throwIfAborted(signal);

      const clip = preparedClips[index];
      currentClip = clip;
      clipStartedAt = performance.now();

      reportProgress({
        stage: "recording",
        progress: 30 + (elapsedSeconds / Math.max(totalDurationSeconds, 0.001)) * 62,
        message: `正在合成第 ${index + 1}/${preparedClips.length} 张：${clip.moduleName}`,
        clipIndex: index + 1,
        moduleId: clip.moduleId,
        moduleName: clip.moduleName,
        imageSrc: clip.imageSrc,
      });

      const progressTimer = window.setInterval(() => {
        const clipElapsed = Math.min(clip.durationSeconds, Math.max(0, (performance.now() - clipStartedAt) / 1000));
        const percent = 30 + ((elapsedSeconds + clipElapsed) / Math.max(totalDurationSeconds, 0.001)) * 62;

        reportProgress({
          stage: "recording",
          progress: percent,
          message: `正在合成第 ${index + 1}/${preparedClips.length} 张：${clip.moduleName}`,
          clipIndex: index + 1,
          moduleId: clip.moduleId,
          moduleName: clip.moduleName,
          imageSrc: clip.imageSrc,
        });
      }, 160);

      try {
        const outputs: AudioNode[] = [audioDestination];
        if (monitorAudio) {
          outputs.push(audioContext.destination);
        }

        const durationSeconds = await playAudioBuffers(audioContext, outputs, clip.audioBuffers, signal);
        elapsedSeconds += durationSeconds;
      } finally {
        window.clearInterval(progressTimer);
      }
    }

    reportProgress({
      stage: "exporting",
      progress: 95,
      message: "正在导出视频文件...",
      clipIndex: preparedClips.length,
      moduleId: lastPreparedClip?.moduleId,
      moduleName: lastPreparedClip?.moduleName,
      imageSrc: lastPreparedClip?.imageSrc,
    });

    await wait(180, signal);

    if (recorder.state !== "inactive") {
      if (recorder.state === "recording") {
        try {
          recorder.requestData();
        } catch {
          // Ignore and fall through to recorder.stop().
        }
      }
      recorder.stop();
    }

    const blob = await recorderDone;
    if (!blob.size) {
      throw new Error("导出的视频为空，请重新生成。");
    }

    objectUrl = URL.createObjectURL(blob);

    reportProgress({
      stage: "completed",
      progress: 100,
      message: "视频生成完成。",
      clipIndex: preparedClips.length,
      moduleId: lastPreparedClip?.moduleId,
      moduleName: lastPreparedClip?.moduleName,
      imageSrc: lastPreparedClip?.imageSrc,
    });

    const subtitleTrack = buildSubtitleTrack(preparedClips);

    return {
      blob,
      objectUrl,
      fileName: buildVideoFileName(task),
      mimeType,
      durationSeconds: totalDurationSeconds,
      plan,
      subtitleTrack,
    };
  } catch (error) {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }

    if (recorder.state !== "inactive") {
      recorder.stop();
    }

    throw error;
  } finally {
    if (frameTimer !== null) {
      window.clearInterval(frameTimer);
    }

    canvasStream.getTracks().forEach((track) => track.stop());
    mixedStream.getTracks().forEach((track) => track.stop());

    if (audioContext.state !== "closed") {
      await audioContext.close().catch(() => undefined);
    }
  }
}
