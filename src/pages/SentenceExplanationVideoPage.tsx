import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, FileText, RefreshCw, Video } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  SentenceExplanationVideoFontOption,
  SentenceExplanationVideoSubtitleStyle,
} from "@/lib/sentence-explanation-video-contract";
import {
  buildSentenceExplanationVideoSubtitleTrack,
  exportSentenceExplanationVideoMp4,
} from "@/lib/sentence-explanation-video-export";
import {
  createSentenceExplanationVideoPlan,
  type SentenceExplanationVideoClipPlan,
  type SentenceExplanationVideoProgress,
  type SentenceExplanationVideoSubtitleTrack,
} from "@/lib/sentence-explanation-video";
import {
  saveSentenceExplanationVideo,
  syncSentenceExplanationVideoToSupabase,
  type SentenceExplanationVideoAsset,
  useHydratedTask,
} from "@/lib/task-store";
import { isSupabaseConfigured } from "@/lib/supabase-image-store";

type LogTone = "info" | "success" | "error";
type GenerationStatus = "idle" | "running" | "done" | "error";

interface VideoLogEntry {
  id: string;
  tone: LogTone;
  text: string;
  createdAt: string;
}

interface VideoPayload {
  assetId: string;
  objectUrl: string;
  fileName: string;
  durationSeconds: number;
  subtitleTrack?: SentenceExplanationVideoSubtitleTrack;
}

interface SubtitleStyleFormState {
  fontFileName: string;
  fontSize: string;
  fontColor: string;
  x: string;
  y: string;
  outlineColor: string;
}

const VIDEO_WIDTH = 960;
const VIDEO_HEIGHT = 1280;
const IDLE_MESSAGE = "请先设置字幕参数，再点击生成视频";
const DEFAULT_SUBTITLE_STYLE_FORM: SubtitleStyleFormState = {
  fontFileName: "",
  fontSize: "10",
  fontColor: "#ffffff",
  x: "0",
  y: "0",
  outlineColor: "#000000",
};

function normalizeHexColor(value: string, fallback: string) {
  const normalized = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : fallback;
}

function parseIntegerWithFallback(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildSubtitleStyle(form: SubtitleStyleFormState): SentenceExplanationVideoSubtitleStyle {
  return {
    fontFileName: form.fontFileName || undefined,
    fontSize: Math.max(1, parseIntegerWithFallback(form.fontSize, 10)),
    fontColor: normalizeHexColor(form.fontColor, "#ffffff"),
    x: parseIntegerWithFallback(form.x, 0),
    y: parseIntegerWithFallback(form.y, 0),
    outlineColor: normalizeHexColor(form.outlineColor, "#000000"),
  };
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
    </span>
  );
}

function createLogEntry(text: string, tone: LogTone = "info"): VideoLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tone,
    text,
    createdAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
  };
}

function createVideoAssetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `sentence-explanation-video-${crypto.randomUUID()}`;
  }

  return `sentence-explanation-video-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getLogToneClass(tone: LogTone) {
  switch (tone) {
    case "success":
      return "text-emerald-300";
    case "error":
      return "text-rose-300";
    default:
      return "text-slate-200";
  }
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function convertSrtToVtt(srtText: string) {
  const normalized = srtText.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return "WEBVTT\n";
  }

  return `WEBVTT\n\n${normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}\n`;
}

function downloadSrtSubtitleTrack(subtitleTrack: SentenceExplanationVideoSubtitleTrack | undefined, fileName: string) {
  if (!subtitleTrack) {
    return;
  }

  const baseName = fileName.replace(/\.[^/.]+$/, "");
  const srtBlob = new Blob([subtitleTrack.srtText], { type: "text/plain;charset=utf-8" });
  const srtUrl = URL.createObjectURL(srtBlob);
  const srtLink = document.createElement("a");
  srtLink.href = srtUrl;
  srtLink.download = `${baseName}.srt`;
  document.body.appendChild(srtLink);
  srtLink.click();
  document.body.removeChild(srtLink);
  URL.revokeObjectURL(srtUrl);
}

function buildPersistedVideoSource(video: SentenceExplanationVideoAsset | null | undefined) {
  if (!video) {
    return "";
  }

  if (video.dataUrl) {
    return video.dataUrl;
  }

  if (!video.publicUrl) {
    return "";
  }

  const cacheBustToken = encodeURIComponent(`${video.id}:${video.createdAt}`);
  return `${video.publicUrl}${video.publicUrl.includes("?") ? "&" : "?"}v=${cacheBustToken}`;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("视频数据读取失败。"));
    reader.readAsDataURL(blob);
  });
}

function getClipPlaybackSummary(clip: SentenceExplanationVideoClipPlan, index: number, total: number) {
  if (index === 0) {
    return "欢迎语 + 当前图片讲解";
  }

  if (index === total - 1) {
    return "当前图片讲解 + 结尾收束";
  }

  return `${clip.moduleName} 讲解`;
}

export default function SentenceExplanationVideoPage() {
  const { taskId } = useParams();
  const task = useHydratedTask(taskId);
  const article = task?.sentenceExplanation?.article?.article ?? null;
  const tts = task?.sentenceExplanation?.tts ?? null;
  const persistedVideo = task?.sentenceExplanation?.video ?? null;
  const hasPersistedVideo = Boolean(persistedVideo);
  const persistedVideoSource = buildPersistedVideoSource(persistedVideo);

  const planState = useMemo(() => {
    if (!task || !article || !tts) {
      return {
        plan: null,
        error: "",
      };
    }

    try {
      return {
        plan: createSentenceExplanationVideoPlan(task, article, tts),
        error: "",
      };
    } catch (error) {
      return {
        plan: null,
        error: error instanceof Error ? error.message : "视频生成素材尚未准备完成。",
      };
    }
  }, [article, task, tts]);
  const canGenerateVideo = Boolean(task && article && tts && planState.plan);

  const [logs, setLogs] = useState<VideoLogEntry[]>([]);
  const [fontOptions, setFontOptions] = useState<SentenceExplanationVideoFontOption[]>([]);
  const [fontsLoading, setFontsLoading] = useState(false);
  const [fontsError, setFontsError] = useState("");
  const [subtitleStyleForm, setSubtitleStyleForm] = useState<SubtitleStyleFormState>(DEFAULT_SUBTITLE_STYLE_FORM);
  const [currentSubtitleText, setCurrentSubtitleText] = useState("");
  const [subtitleTrackPreviewUrl, setSubtitleTrackPreviewUrl] = useState("");
  const [generationState, setGenerationState] = useState<{
    status: GenerationStatus;
    progress: number;
    message: string;
    currentClipIndex: number;
    currentModuleName: string;
    currentImageSrc: string;
    error: string;
    payload: VideoPayload | null;
  }>({
    status: "idle",
    progress: 0,
    message: IDLE_MESSAGE,
    currentClipIndex: 0,
    currentModuleName: "",
    currentImageSrc: "",
    error: "",
    payload: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastProgressKeyRef = useRef("");
  const activeObjectUrlRef = useRef("");
  const autoSyncAttemptKeyRef = useRef("");
  const subtitleStyle = useMemo(() => buildSubtitleStyle(subtitleStyleForm), [subtitleStyleForm]);
  const selectedFontLabel =
    fontOptions.find((fontOption) => fontOption.fileName === subtitleStyle.fontFileName)?.label || "自动选择首个字体";

  useEffect(() => {
    abortControllerRef.current?.abort();
    if (activeObjectUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
    }

    lastProgressKeyRef.current = "";
    activeObjectUrlRef.current = "";
    setLogs([]);
    setFontsError("");
    setSubtitleStyleForm(DEFAULT_SUBTITLE_STYLE_FORM);
    setCurrentSubtitleText("");
    setSubtitleTrackPreviewUrl("");
    setGenerationState({
      status: "idle",
      progress: 0,
      message: IDLE_MESSAGE,
      currentClipIndex: 0,
      currentModuleName: "",
      currentImageSrc: "",
      error: "",
      payload: null,
    });
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;

    setFontsLoading(true);
    setFontsError("");

    void fetch("/api/sentence-explanation-video-fonts")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("字幕字体列表加载失败。");
        }

        const payload = (await response.json()) as { fonts?: SentenceExplanationVideoFontOption[] };
        if (cancelled) {
          return;
        }

        setFontOptions(Array.isArray(payload.fonts) ? payload.fonts : []);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setFontOptions([]);
        setFontsError(error instanceof Error ? error.message : "字幕字体列表加载失败。");
      })
      .finally(() => {
        if (!cancelled) {
          setFontsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSubtitleStyleForm((current) => {
      const defaultFontFileName = fontOptions[0]?.fileName || "";
      if (!defaultFontFileName) {
        if (!current.fontFileName) {
          return current;
        }

        return {
          ...current,
          fontFileName: "",
        };
      }

      if (current.fontFileName && fontOptions.some((fontOption) => fontOption.fileName === current.fontFileName)) {
        return current;
      }

      return {
        ...current,
        fontFileName: defaultFontFileName,
      };
    });
  }, [fontOptions]);

  useEffect(() => {
    const srtText = generationState.payload?.subtitleTrack?.srtText || "";
    if (!srtText) {
      setSubtitleTrackPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(
      new Blob([convertSrtToVtt(srtText)], { type: "text/vtt;charset=utf-8" }),
    );
    setSubtitleTrackPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [generationState.payload?.subtitleTrack?.srtText]);

  useEffect(() => {
    if (!persistedVideo) {
      return;
    }

    setCurrentSubtitleText("");
    const videoSource = buildPersistedVideoSource(persistedVideo);
    const lastClip = planState.plan?.clips[planState.plan.clips.length - 1];

    setLogs([
      createLogEntry(videoSource ? "已读取历史视频记录，可直接预览或下载。" : "正在加载历史视频文件...", videoSource ? "success" : "info"),
    ]);
    setGenerationState((current) => {
      const shouldPreserveFreshBlob =
        current.payload?.assetId === persistedVideo.id && current.payload.objectUrl.startsWith("blob:");
      const payload =
        shouldPreserveFreshBlob && current.payload
          ? {
              ...current.payload,
              assetId: persistedVideo.id,
              fileName: persistedVideo.fileName,
              durationSeconds: persistedVideo.durationSeconds,
              subtitleTrack: persistedVideo.subtitleTrack ?? current.payload.subtitleTrack,
            }
          : videoSource
            ? {
                assetId: persistedVideo.id,
                objectUrl: videoSource,
                fileName: persistedVideo.fileName,
                durationSeconds: persistedVideo.durationSeconds,
                subtitleTrack: persistedVideo.subtitleTrack,
              }
            : null;

      return {
        status: payload ? "done" : "idle",
        progress: payload ? 100 : 0,
        message: payload ? "视频生成已完成。" : "正在加载历史视频...",
        currentClipIndex: payload ? planState.plan?.clips.length ?? 0 : 0,
        currentModuleName: payload ? lastClip?.moduleName || "" : "",
        currentImageSrc: payload ? lastClip?.imageSrc || "" : "",
        error: "",
        payload,
      };
    });
  }, [persistedVideo, planState.plan]);

  useEffect(() => {
    if (!persistedVideo || persistedVideo.subtitleTrack || !task || !article || !tts || !planState.plan) {
      return;
    }

    const videoSource = persistedVideo.dataUrl || persistedVideo.publicUrl || "";
    if (!videoSource) {
      return;
    }

    let cancelled = false;
    void buildSentenceExplanationVideoSubtitleTrack({
      task,
      article,
      tts,
    })
      .then((subtitleTrack) => {
        if (cancelled) {
          return;
        }

        setGenerationState((current) => {
          if (
            current.status === "running" ||
            !current.payload ||
            current.payload.objectUrl !== videoSource ||
            current.payload.subtitleTrack
          ) {
            return current;
          }

          return {
            ...current,
            payload: {
              ...current.payload,
              subtitleTrack,
            },
          };
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [article, persistedVideo, planState.plan, task, tts]);

  const appendLog = useCallback((text: string, tone: LogTone = "info") => {
    setLogs((current) => [...current, createLogEntry(text, tone)].slice(-48));
  }, []);

  useEffect(() => {
    if (!task?.id || !persistedVideo?.id || persistedVideo.publicUrl || !isSupabaseConfigured()) {
      autoSyncAttemptKeyRef.current = "";
      return;
    }

    const attemptKey = `${task.id}:${persistedVideo.id}:${persistedVideo.fileName}`;
    if (autoSyncAttemptKeyRef.current === attemptKey) {
      return;
    }

    autoSyncAttemptKeyRef.current = attemptKey;
    void syncSentenceExplanationVideoToSupabase(task.id)
      .then((result) => {
        if (result.success && result.synced) {
          appendLog("视频已同步到 Supabase 的 englishshow bucket，并写入 videos/sentence-explanation 专用目录。", "success");
          return;
        }

        if (!result.success && result.error) {
          appendLog(`视频同步到 Supabase 失败：${result.error}`, "error");
        }
      })
      .catch((error) => {
        appendLog(
          `视频同步到 Supabase 失败：${error instanceof Error ? error.message : "未知错误"}`,
          "error",
        );
      });
  }, [appendLog, persistedVideo?.fileName, persistedVideo?.id, persistedVideo?.publicUrl, task?.id]);

  const handleProgress = useCallback(
    (progress: SentenceExplanationVideoProgress) => {
      setGenerationState((current) => ({
        ...current,
        status: "running",
        progress: progress.progress,
        message: progress.message,
        currentClipIndex: progress.clipIndex,
        currentModuleName: progress.moduleName || "",
        currentImageSrc: progress.imageSrc || current.currentImageSrc,
      }));

      const logKey = `${progress.stage}:${progress.clipIndex}:${progress.moduleId || ""}:${progress.message}`;
      if (lastProgressKeyRef.current !== logKey) {
        lastProgressKeyRef.current = logKey;
        appendLog(progress.message, progress.stage === "completed" ? "success" : "info");
      }
    },
    [appendLog],
  );

  const startGeneration = useCallback(async () => {
    if (!task || !article || !tts || !planState.plan) {
      return;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    lastProgressKeyRef.current = "";

    setGenerationState((current) => {
      if (current.payload?.objectUrl.startsWith("blob:")) {
        URL.revokeObjectURL(current.payload.objectUrl);
      }

      if (activeObjectUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = "";
      }

      return {
        status: "running",
        progress: 2,
        message: "正在建立视频生成任务...",
        currentClipIndex: 0,
        currentModuleName: "",
        currentImageSrc: planState.plan.clips[0]?.imageSrc || "",
        error: "",
        payload: null,
      };
    });
    setCurrentSubtitleText("");

    setLogs([
      createLogEntry("> claude-code run --skill sentence-explanation-video", "info"),
      createLogEntry("正在收集 5 张解析图与整篇讲解语音。", "info"),
      createLogEntry(`字幕样式：${selectedFontLabel} / ${subtitleStyle.fontSize}px / ${subtitleStyle.fontColor}`, "info"),
      createLogEntry("视频导出完成后会自动写回当前任务，并同步到历史记录。", "info"),
    ]);

    try {
      const nextVideoAssetId = createVideoAssetId();
      const result = await exportSentenceExplanationVideoMp4({
        task,
        article,
        tts,
        subtitleStyle,
        signal: abortControllerRef.current.signal,
        monitorAudio: true,
        onProgress: handleProgress,
        onSubtitleTextChange: setCurrentSubtitleText,
      });

      const lastClip = result.plan.clips[result.plan.clips.length - 1];
      activeObjectUrlRef.current = result.objectUrl;
      const dataUrl = await blobToDataUrl(result.blob);

      const syncResult = await saveSentenceExplanationVideo(task.id, {
        id: nextVideoAssetId,
        fileName: result.fileName,
        mimeType: result.mimeType,
        dataUrl,
        durationSeconds: result.durationSeconds,
        createdAt: new Date().toISOString(),
        subtitleTrack: result.subtitleTrack,
      });
      if (syncResult.success && syncResult.synced) {
        appendLog("视频已同步到 Supabase 的 englishshow bucket，并写入 videos/sentence-explanation 专用目录。", "success");
      } else if (!syncResult.success && syncResult.error) {
        appendLog(`视频已生成，但同步到 Supabase 失败：${syncResult.error}`, "error");
      }

      setGenerationState({
        status: "done",
        progress: 100,
        message: "视频生成完成。",
        currentClipIndex: result.plan.clips.length,
        currentModuleName: lastClip?.moduleName || "",
        currentImageSrc: lastClip?.imageSrc || "",
        error: "",
        payload: {
          assetId: nextVideoAssetId,
          objectUrl: result.objectUrl,
          fileName: result.fileName,
          durationSeconds: result.durationSeconds,
          subtitleTrack: result.subtitleTrack,
        },
      });

      appendLog("`sentence-explanation-video` skill 已完成导出。", "success");
      appendLog(`视频时长约 ${formatDuration(result.durationSeconds)}，可以直接预览或下载。`, "success");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      const message = error instanceof Error ? error.message : "视频生成失败，请稍后重试。";

      // Check for localStorage quota exceeded error
      const isQuotaError =
        message.includes("exceeded the quota") ||
        message.includes("QuotaExceededError") ||
        (error instanceof DOMException && error.name === "QuotaExceededError");

      setCurrentSubtitleText("");
      setGenerationState((current) => ({
        ...current,
        status: "error",
        error: message,
        message,
      }));

      if (isQuotaError) {
        appendLog("浏览器存储空间不足。系统已自动清理旧任务数据，请尝试重新生成视频。", "error");
        appendLog("提示：可以在「历史记录」页面删除不需要的旧任务来释放空间。", "info");
      } else {
        appendLog(message, "error");
      }
    }
  }, [appendLog, article, handleProgress, planState.plan, selectedFontLabel, subtitleStyle, task, tts]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (activeObjectUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = "";
      }
    };
  }, []);

  if (!task) {
    return (
      <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
        <div className="container max-w-3xl py-16">
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-elegant">
            <h1 className="font-display text-2xl font-semibold">未找到对应任务</h1>
            <p className="mt-3 text-sm text-muted-foreground">请先回到历史记录或任务详情页，再重新进入视频页面。</p>
            <Button asChild className="mt-6">
              <Link to="/">返回首页</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!hasPersistedVideo && (!article || !tts)) {
    return (
      <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
        <div className="container max-w-3xl py-16">
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-elegant">
            <h1 className="font-display text-2xl font-semibold">缺少视频生成素材</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              需要先在句子讲解页完成文章和语音生成，才能继续导出视频。
            </p>
            <Button asChild className="mt-6">
              <Link to={`/explanation/${task.id}`}>返回句子讲解</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!hasPersistedVideo && !planState.plan) {
    return (
      <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
        <div className="container max-w-3xl py-16">
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-elegant">
            <h1 className="font-display text-2xl font-semibold">视频暂时无法生成</h1>
            <p className="mt-3 text-sm text-muted-foreground">{planState.error || "视频所需素材还没有全部就绪。"}</p>
            <Button asChild className="mt-6">
              <Link to={`/explanation/${task.id}`}>返回句子讲解</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 当正在生成新视频时，强制显示生成状态而不是历史视频
  // 避免用户看到旧视频误以为生成完成
  const isGenerating = generationState.status === "running";
  const hasNewPayload = generationState.payload != null;

  const displayPayload = isGenerating && !hasNewPayload
    ? null // 生成中但还没有新视频时，不显示任何视频
    : (hasNewPayload
      ? generationState.payload
      : (persistedVideoSource
      ? {
            assetId: persistedVideo?.id || "",
            objectUrl: persistedVideoSource,
            fileName: persistedVideo?.fileName || "sentence-explanation-video.mp4",
            durationSeconds: persistedVideo?.durationSeconds || 0,
            subtitleTrack: persistedVideo?.subtitleTrack,
          }
        : null));
  const initialClip = planState.plan?.clips[0] ?? null;
  const displayModuleName = generationState.currentModuleName || initialClip?.moduleName || (hasPersistedVideo ? "历史视频" : "");
  const displayImageSrc = generationState.currentImageSrc || initialClip?.imageSrc || "";
  const clipCountLabel = planState.plan
    ? `当前片段 ${Math.max(1, generationState.currentClipIndex || 1)}/${planState.plan.clips.length}`
    : "历史视频";

  return (
    <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
      <div className="container max-w-7xl py-10">
        <div className="mb-6 flex flex-wrap gap-4">
          <Link
            to={`/explanation/${task.id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            回退到句子讲解
          </Link>
          <Link
            to={`/result/${task.id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            回退到图片结果
          </Link>
        </div>

        <div className="rounded-3xl border border-border bg-card/95 p-6 shadow-elegant">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                <Video className="h-3.5 w-3.5" />
                sentence-explanation-video skill
              </div>
              <h1 className="mt-4 font-display text-3xl font-bold text-foreground">句子讲解视频生成页面</h1>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => void startGeneration()}
                disabled={generationState.status === "running" || !canGenerateVideo || fontsLoading}
              >
                {generationState.status === "running" ? <LoadingDots /> : <RefreshCw className="h-4 w-4" />}
                {displayPayload ? "重新生成视频" : "生成视频"}
              </Button>
              {displayPayload ? (
                <>
                  <Button asChild variant="gold">
                    <a href={displayPayload.objectUrl} download={displayPayload.fileName}>
                      <Download className="h-4 w-4" />
                      下载视频
                    </a>
                  </Button>
                  {displayPayload.subtitleTrack ? (
                    <Button
                      aria-label="Download SRT"
                      variant="outline"
                      onClick={() => downloadSrtSubtitleTrack(displayPayload.subtitleTrack, displayPayload.fileName)}
                    >
                      <FileText className="h-4 w-4" />
                      下载字幕
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          <section className="mt-6 rounded-2xl border border-border bg-background/80 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Subtitle Style</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-foreground">字幕设置</h2>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>视频尺寸 {VIDEO_WIDTH} × {VIDEO_HEIGHT} px</p>
                <p>字幕原点以画面中心为 0, 0</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="subtitle-font">字体</Label>
                <select
                  id="subtitle-font"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={subtitleStyleForm.fontFileName}
                  onChange={(event) =>
                    setSubtitleStyleForm((current) => ({
                      ...current,
                      fontFileName: event.target.value,
                    }))
                  }
                  disabled={generationState.status === "running" || fontsLoading || !fontOptions.length}
                >
                  {fontOptions.length ? (
                    fontOptions.map((fontOption) => (
                      <option key={fontOption.fileName} value={fontOption.fileName}>
                        {fontOption.label}
                      </option>
                    ))
                  ) : (
                    <option value="">暂无可用字体</option>
                  )}
                </select>
                <p className="text-xs text-muted-foreground">
                  {fontsLoading ? "正在读取 font 文件夹..." : "字体文件来自项目根目录的 font 文件夹。"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subtitle-font-size">字号</Label>
                <Input
                  id="subtitle-font-size"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={subtitleStyleForm.fontSize}
                  onChange={(event) =>
                    setSubtitleStyleForm((current) => ({
                      ...current,
                      fontSize: event.target.value,
                    }))
                  }
                  disabled={generationState.status === "running"}
                />
                <p className="text-xs text-muted-foreground">默认 10，服务端会自动兜底为正整数。</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subtitle-font-color">字体颜色</Label>
                <Input
                  id="subtitle-font-color"
                  value={subtitleStyleForm.fontColor}
                  onChange={(event) =>
                    setSubtitleStyleForm((current) => ({
                      ...current,
                      fontColor: event.target.value,
                    }))
                  }
                  disabled={generationState.status === "running"}
                  placeholder="#ffffff"
                />
                <p className="text-xs text-muted-foreground">使用 `#ffffff` 这种 6 位十六进制格式。</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subtitle-x">字幕 x 位置</Label>
                <Input
                  id="subtitle-x"
                  type="number"
                  inputMode="numeric"
                  value={subtitleStyleForm.x}
                  onChange={(event) =>
                    setSubtitleStyleForm((current) => ({
                      ...current,
                      x: event.target.value,
                    }))
                  }
                  disabled={generationState.status === "running"}
                />
                <p className="text-xs text-muted-foreground">以画面中心为 0，正值向右，单位 px。</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subtitle-y">字幕 y 位置</Label>
                <Input
                  id="subtitle-y"
                  type="number"
                  inputMode="numeric"
                  value={subtitleStyleForm.y}
                  onChange={(event) =>
                    setSubtitleStyleForm((current) => ({
                      ...current,
                      y: event.target.value,
                    }))
                  }
                  disabled={generationState.status === "running"}
                />
                <p className="text-xs text-muted-foreground">以画面中心为 0，正值向下，单位 px。</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subtitle-outline-color">描边颜色</Label>
                <Input
                  id="subtitle-outline-color"
                  value={subtitleStyleForm.outlineColor}
                  onChange={(event) =>
                    setSubtitleStyleForm((current) => ({
                      ...current,
                      outlineColor: event.target.value,
                    }))
                  }
                  disabled={generationState.status === "running"}
                  placeholder="#000000"
                />
                <p className="text-xs text-muted-foreground">默认黑色描边，用于提升字幕可读性。</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-foreground">
              <p>
                当前将使用 {selectedFontLabel}，字号 {subtitleStyle.fontSize}px，字体颜色 {subtitleStyle.fontColor}，描边颜色{" "}
                {subtitleStyle.outlineColor}，位置偏移 ({subtitleStyle.x}, {subtitleStyle.y})。
              </p>
              {fontsError ? <p className="mt-2 text-destructive">{fontsError}</p> : null}
            </div>
          </section>

          <div className="mt-6 rounded-2xl border border-accent/20 bg-accent/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Video Progress</p>
                <p className="mt-2 text-base text-foreground">{generationState.message}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold text-foreground">{Math.round(generationState.progress)}%</p>
                <p className="text-xs text-muted-foreground">
                  {generationState.currentModuleName || "等待分配当前片段"}
                </p>
              </div>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-accent/10">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                style={{ width: `${generationState.progress}%` }}
              />
            </div>
            {planState.plan ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {"播放顺序固定为：句译对照图 → 句式分析图 → 句式总结图 → 词汇解析图 → 雅思备考图。"}
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">历史视频已可查看，视频素材会在后台继续补齐用于重新生成。</p>
            )}
          </div>

          {generationState.error ? (
            <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {generationState.error}
            </div>
          ) : null}

          <div className="mt-8 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-3xl border border-slate-700 bg-slate-950 p-5 shadow-lg">
              <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div aria-hidden="true" />
                {generationState.status === "running" ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                    <LoadingDots />
                    RUNNING
                  </span>
                ) : generationState.status === "done" ? (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                    COMPLETED
                  </span>
                ) : generationState.status === "error" ? (
                  <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-300">
                    FAILED
                  </span>
                ) : null}
              </div>
              <div className="mt-4 space-y-3 font-mono text-sm">
                {logs.length ? (
                  logs.map((log) => (
                    <div key={log.id} className="flex gap-3">
                      <span className="min-w-16 text-slate-500">{log.createdAt}</span>
                      <p className={getLogToneClass(log.tone)}>{log.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-400">等待生成任务开始...</p>
                )}
              </div>
            </section>

            <div className="space-y-6">
              <section className="rounded-3xl border border-border bg-secondary/10 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Live Preview</p>
                    <h2 className="mt-2 font-display text-2xl font-semibold text-foreground">{displayModuleName}</h2>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{clipCountLabel}</p>
                    <p>{planState.plan ? "语音来源：整篇 TTS" : "语音素材：使用历史视频成品"}</p>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-background">
                  <div className="aspect-[3/4] w-full bg-secondary/20">
                    {displayImageSrc ? (
                      <img
                        src={displayImageSrc}
                        alt={displayModuleName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                        {hasPersistedVideo ? "历史视频已就绪，封面与片段素材正在后台加载。" : "等待当前片段画面加载。"}
                      </div>
                    )}
                  </div>
                </div>
                {currentSubtitleText ? (
                  <div
                    className="mt-3 rounded-2xl border border-border bg-background/90 px-4 py-3 text-center font-semibold whitespace-pre-line"
                    style={{
                      color: subtitleStyle.fontColor,
                      textShadow: [
                        `0 1px 0 ${subtitleStyle.outlineColor}`,
                        `1px 0 0 ${subtitleStyle.outlineColor}`,
                        `0 -1px 0 ${subtitleStyle.outlineColor}`,
                        `-1px 0 0 ${subtitleStyle.outlineColor}`,
                      ].join(", "),
                    }}
                  >
                    {currentSubtitleText}
                  </div>
                ) : null}

                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  {planState.plan
                    ? "当前页面会同步播放图片和解说语音，导出完成后输出一个可直接下载的 MP4 视频文件。"
                    : "当前页面已进入历史视频查看模式，可以直接预览和下载已经生成好的视频文件。"}
                </p>
              </section>

              {planState.plan ? (
                <section className="rounded-3xl border border-border bg-background/80 p-5">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Sequence</p>
                  <div className="mt-4 space-y-3">
                    {planState.plan.clips.map((clip, index) => {
                      const isCurrent = generationState.status === "running" && generationState.currentClipIndex === index + 1;
                      const isDone = generationState.status === "done" || generationState.currentClipIndex > index + 1;

                      return (
                        <div
                          key={clip.moduleId}
                          className={[
                            "rounded-2xl border p-4 transition-colors",
                            isCurrent
                              ? "border-accent bg-accent/10"
                              : isDone
                                ? "border-emerald-500/30 bg-emerald-500/5"
                                : "border-border bg-secondary/10",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {index + 1}. {clip.moduleName}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {getClipPlaybackSummary(clip, index, planState.plan.clips.length)}
                              </p>
                            </div>
                            <span className="text-xs text-muted-foreground">{clip.audioSegments.length} 段音频</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <section className="rounded-3xl border border-border bg-background/80 p-5">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Sequence</p>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    当前正在查看历史视频成品。等后台把原始图片和语音素材补齐后，才会显示完整的片段顺序并支持重新生成。
                  </p>
                </section>
              )}

              {displayPayload ? (
                <section className="rounded-3xl border border-border bg-background/80 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Result</p>
                      <h2 className="mt-2 font-display text-2xl font-semibold text-foreground">导出视频预览</h2>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      时长约 {formatDuration(displayPayload.durationSeconds)}
                    </p>
                  </div>
                  <video
                    controls
                    preload="metadata"
                    key={`video-${taskId}-${generationState.status}-${displayPayload.objectUrl.slice(-20)}`}
                    className="mt-4 aspect-[3/4] w-full rounded-2xl border border-border bg-black"
                    src={displayPayload.objectUrl}
                  >
                    {subtitleTrackPreviewUrl ? (
                      <track
                        default
                        kind="subtitles"
                        label="English Flow"
                        src={subtitleTrackPreviewUrl}
                        srcLang="en"
                      />
                    ) : null}
                  </video>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
