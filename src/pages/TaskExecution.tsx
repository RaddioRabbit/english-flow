import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Share2,
  Upload,
  XCircle,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/image-store";
import { downloadAllImages, sharePage } from "@/lib/media-utils";
import { sentenceExplanationModuleOrder } from "@/lib/sentence-explanation-contract";
import { analyzeTaskTextContent, estimateParsingProgressPercentage } from "@/lib/task-text-analysis";
import {
  completeTaskTextAnalysis,
  failTaskTextAnalysis,
  getGeneratedImageSource,
  hasGeneratedImageSource,
  moduleTitle,
  restartTaskTextAnalysis,
  retryTask,
  setTaskParsingProgress,
  syncGeneratedImagesToSupabase,
  taskStatusLabel,
  useHydratedTask,
} from "@/lib/task-store";
import { useImageGeneration } from "@/lib/use-image-generation";

function StepIcon({ status }: { status: "pending" | "running" | "done" | "error" }) {
  if (status === "done") return <CheckCircle2 className="h-5 w-5 text-success" />;
  if (status === "running") return <Loader2 className="h-5 w-5 animate-spin text-info" />;
  if (status === "error") return <XCircle className="h-5 w-5 text-destructive" />;
  return <div className="h-5 w-5 rounded-full border border-border bg-secondary" />;
}

function buildSyncMessage(result: { uploaded: number; failed: number }) {
  if (result.uploaded || result.failed) {
    return `生成图同步完成：成功 ${result.uploaded} 张，失败 ${result.failed} 张。`;
  }

  return "当前生成图已完成云端同步。";
}

export default function TaskExecutionPage() {
  const { taskId } = useParams();
  const task = useHydratedTask(taskId);
  const [showLogs, setShowLogs] = useState(false);
  const [shareState, setShareState] = useState("");
  const [syncState, setSyncState] = useState<{ syncing: boolean; message: string }>({
    syncing: false,
    message: "",
  });
  const [activeParsingStep, setActiveParsingStep] = useState<{
    mode: "all" | "translation" | "segmentation" | "grammar" | "vocabulary" | "ielts";
    startedAt: number;
  } | null>(null);
  const [parsingClock, setParsingClock] = useState(() => Date.now());
  const startedParsingKeyRef = useRef<string | null>(null);
  const startedGenerationKeyRef = useRef<string | null>(null);
  const autoSyncAttemptKeyRef = useRef<string>("");
  const { state, generateImages, reset } = useImageGeneration();

  useEffect(() => {
    if (!task || task.status !== "parsing") {
      return;
    }

    const taskId = task.id;
    const sentence = task.sentence;
    const bookName = task.bookName;
    const author = task.author;
    const modules = [...task.modules];

    if (startedParsingKeyRef.current === taskId) {
      return;
    }

    startedParsingKeyRef.current = taskId;
    let cancelled = false;

    const runParsing = async () => {
      setActiveParsingStep(null);
      setTaskParsingProgress(taskId, []);

      try {
        const result = await analyzeTaskTextContent(
          {
            sentence,
            bookName,
            author,
            modules,
          },
          {
            onStepStart: ({ mode }) => {
              if (!cancelled) {
                const startedAt = Date.now();
                setActiveParsingStep({ mode, startedAt });
                setParsingClock(startedAt);
              }
            },
            onStepComplete: ({ completedModes }) => {
              if (!cancelled) {
                setTaskParsingProgress(taskId, completedModes);
              }
            },
          },
        );

        if (cancelled) {
          return;
        }

        setActiveParsingStep(null);
        completeTaskTextAnalysis(taskId, result.analysis.textContent, result.analysis.source, result.analysis.model);
      } catch (analysisError) {
        if (cancelled) {
          return;
        }

        const message = analysisError instanceof Error ? analysisError.message : "LLM 文本解析失败，请稍后重试。";
        failTaskTextAnalysis(taskId, message);
      } finally {
        if (!cancelled) {
          setActiveParsingStep(null);
        }
      }
    };

    void runParsing();
    return () => {
      cancelled = true;
    };
  }, [task?.id, task?.status]);

  useEffect(() => {
    if (!task || task.status !== "generating" || state.isGenerating) {
      return;
    }

    const generationKey = `${task.id}:${task.updatedAt}:${task.status}`;
    if (startedGenerationKeyRef.current === generationKey) {
      return;
    }

    startedGenerationKeyRef.current = generationKey;
    void generateImages(task);
  }, [generateImages, state.isGenerating, task]);

  useEffect(() => {
    if (task?.status !== "parsing" || !activeParsingStep) {
      return;
    }

    setParsingClock(Date.now());
    const timer = window.setInterval(() => {
      setParsingClock(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeParsingStep, task?.status]);

  useEffect(() => {
    if (task?.status === "parsing") {
      return;
    }

    startedParsingKeyRef.current = null;
    setActiveParsingStep(null);
  }, [task?.status]);

  const parsingSteps = useMemo(() => task?.steps.filter((step) => step.stage === "parsing") ?? [], [task?.steps]);
  const generationSteps = useMemo(() => task?.steps.filter((step) => step.stage === "generation") ?? [], [task?.steps]);
  const runningParsingStep = useMemo(
    () => parsingSteps.find((step) => step.status === "running") ?? parsingSteps.find((step) => step.status === "pending") ?? null,
    [parsingSteps],
  );
  const parsingElapsedMs = activeParsingStep ? Math.max(0, parsingClock - activeParsingStep.startedAt) : 0;
  const parsingFailed = useMemo(
    () => task?.status === "failed" && parsingSteps.some((step) => step.status === "error"),
    [parsingSteps, task?.status],
  );
  const generatedImages = useMemo(
    () =>
      task?.modules
        .map((moduleId) => task.generatedImages?.[moduleId])
        .filter((image): image is NonNullable<typeof image> => hasGeneratedImageSource(image)) ?? [],
    [task?.generatedImages, task?.modules],
  );
  const unsyncedGeneratedImages = useMemo(
    () => generatedImages.filter((image) => !image.publicUrl),
    [generatedImages],
  );
  const latestCloudErrorLog = useMemo(
    () => task?.logs.find((log) => log.level === "error" && log.message.includes("Supabase")) ?? null,
    [task?.logs],
  );
  const visibleCloudErrorLog = useMemo(
    () => (unsyncedGeneratedImages.length ? latestCloudErrorLog : null),
    [latestCloudErrorLog, unsyncedGeneratedImages.length],
  );
  const unsyncedSyncKey = useMemo(
    () => unsyncedGeneratedImages.map((image) => `${image.id}:${image.fileName}`).sort().join("|"),
    [unsyncedGeneratedImages],
  );
  const hasGeneratedImages = generatedImages.length > 0;
  const explanationReady = useMemo(
    () => sentenceExplanationModuleOrder.every((moduleId) => hasGeneratedImageSource(task?.generatedImages?.[moduleId])),
    [task?.generatedImages],
  );
  const explanationPath = useMemo(() => {
    if (!task) {
      return "";
    }

    return task.sentenceExplanation?.video || task.sentenceExplanation?.stage === "video"
      ? `/explanation/${task.id}/video`
      : `/explanation/${task.id}`;
  }, [task]);
  const displayProgress = useMemo(() => {
    if (!task) {
      return 0;
    }

    if (task.status === "parsing") {
      return estimateParsingProgressPercentage({
        totalSteps: task.steps.length,
        completedSteps: task.steps.filter((step) => step.status === "done").length,
        runningMode: activeParsingStep?.mode,
        elapsedMs: parsingElapsedMs,
      });
    }

    return state.isGenerating ? Math.max(task.progress, state.progress) : task.progress;
  }, [activeParsingStep?.mode, parsingElapsedMs, state.isGenerating, state.progress, task]);
  const syncBannerIsWarning = Boolean(unsyncedGeneratedImages.length || visibleCloudErrorLog);

  useEffect(() => {
    if (!unsyncedSyncKey) {
      autoSyncAttemptKeyRef.current = "";
      return;
    }

    if (!task || !isSupabaseConfigured() || syncState.syncing) {
      return;
    }

    const attemptKey = `${task.id}:${unsyncedSyncKey}`;
    if (autoSyncAttemptKeyRef.current === attemptKey) {
      return;
    }

    autoSyncAttemptKeyRef.current = attemptKey;
    let cancelled = false;

    setSyncState({ syncing: true, message: "" });
    void syncGeneratedImagesToSupabase(task.id)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setSyncState({
          syncing: false,
          message: buildSyncMessage(result),
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setSyncState({
          syncing: false,
          message: error instanceof Error ? `生成图自动同步失败：${error.message}` : "生成图自动同步失败。",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [syncState.syncing, task, unsyncedSyncKey]);

  if (!task) {
    return (
      <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
        <div className="container max-w-3xl py-16">
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-elegant">
            <h1 className="font-display text-2xl font-semibold">任务不存在</h1>
            <p className="mt-3 text-sm text-muted-foreground">请从首页重新发起生成流程。</p>
            <Button asChild className="mt-6">
              <Link to="/">返回首页</Link>
	                </Button>
                {explanationReady ? (
                  <Button variant="outline" asChild>
                    <Link to={explanationPath}>
                      <BookOpen className="h-4 w-4" />
                      句子讲解
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" disabled title="需要五张解析图全部生成完成后才能使用">
                    <BookOpen className="h-4 w-4" />
                    句子讲解
                  </Button>
                )}
	              </div>
        </div>
      </div>
    );
  }

  const handleRetry = () => {
    reset();
    setActiveParsingStep(null);
    startedParsingKeyRef.current = null;
    startedGenerationKeyRef.current = null;

    if (task.status === "parsing" || parsingFailed) {
      restartTaskTextAnalysis(task.id);
      return;
    }

    retryTask(task.id);
  };

  const handleShare = async () => {
    const shared = await sharePage("English Flow 任务详情", window.location.href);
    setShareState(shared ? "已调用系统分享。" : "当前链接已复制到剪贴板。");
    window.setTimeout(() => setShareState(""), 2400);
  };

  const handleSyncGeneratedImages = async () => {
    if (syncState.syncing) {
      return;
    }

    setSyncState({ syncing: true, message: "" });
    const result = await syncGeneratedImagesToSupabase(task.id);
    setSyncState({
      syncing: false,
      message: buildSyncMessage(result),
    });
  };

  return (
    <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
      <div className="container max-w-5xl py-10">
        <Link to={`/edit/${task.id}`} className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          文本编辑页
        </Link>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-3xl font-bold">任务详情 / 生成进度</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{task.sentence}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>{task.bookName}</span>
                  <span>{task.author}</span>
                  <span>任务状态：{taskStatusLabel(task.status)}</span>
                  <span>任务 ID：{task.id}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {hasGeneratedImages ? (
                  <Button variant="outline" onClick={() => void downloadAllImages(generatedImages)}>
                    <Download className="h-4 w-4" />
                    下载全部
                  </Button>
                ) : null}
                {isSupabaseConfigured() && unsyncedGeneratedImages.length ? (
                  <Button variant="outline" onClick={() => void handleSyncGeneratedImages()} disabled={syncState.syncing}>
                    <Upload className={`h-4 w-4 ${syncState.syncing ? "animate-pulse" : ""}`} />
                    {syncState.syncing ? "同步中..." : `同步到 Supabase (${unsyncedGeneratedImages.length})`}
                  </Button>
                ) : null}
                <Button variant="outline" onClick={handleRetry}>
                  <RefreshCw className="h-4 w-4" />
                  重新生成
                </Button>
                <Button variant="gold" asChild>
                  <Link to={`/result/${task.id}`}>
                    <Eye className="h-4 w-4" />
                    查看详情
                  </Link>
                </Button>
                {explanationReady ? (
                  <Button variant="outline" asChild>
                    <Link to={explanationPath}>
                      <BookOpen className="h-4 w-4" />
                      句子讲解
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" disabled title="需要五张解析图全部生成完成后才能使用">
                    <BookOpen className="h-4 w-4" />
                    句子讲解
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">整体进度</span>
                <span className="font-semibold text-foreground">{displayProgress}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-secondary">
                <motion.div
                  className="h-full gradient-gold"
                  initial={{ width: 0 }}
                  animate={{ width: `${displayProgress}%` }}
                  transition={{ duration: 0.45 }}
                />
              </div>
            </div>

            {task.status === "parsing" ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{runningParsingStep?.label || "LLM 正在准备文本解析任务..."}</span>
              </div>
            ) : null}

            {state.isGenerating ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-info/30 bg-info/10 px-4 py-3 text-sm text-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>正在调用图片生成服务，并按模块绑定对应参考图。</span>
              </div>
            ) : null}

            {parsingFailed ? (
              <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {task.logs.find((log) => log.level === "error")?.message || "文本解析失败，请重新重试。"}
              </div>
            ) : null}

            {state.error ? (
              <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {state.error}
              </div>
            ) : null}

            {shareState ? (
              <div className="mt-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-foreground">{shareState}</div>
            ) : null}

            {isSupabaseConfigured() && (unsyncedGeneratedImages.length || syncState.message || visibleCloudErrorLog) ? (
              <div
                className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                  syncBannerIsWarning
                    ? "border border-amber-300/40 bg-amber-50 text-amber-900"
                    : "border border-emerald-300/40 bg-emerald-50 text-emerald-900"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p>
                      {unsyncedGeneratedImages.length
                        ? `检测到 ${unsyncedGeneratedImages.length} 张生成图尚未同步到 Supabase。`
                        : "当前生成图已完成云端同步。"}
                    </p>
                    {visibleCloudErrorLog ? (
                      <p className={`text-xs ${syncBannerIsWarning ? "text-amber-800" : "text-emerald-800"}`}>
                        {visibleCloudErrorLog.message}
                      </p>
                    ) : null}
                    {syncState.message ? (
                      <p className={`text-xs ${syncBannerIsWarning ? "text-amber-800" : "text-emerald-800"}`}>
                        {syncState.message}
                      </p>
                    ) : null}
                  </div>
                  {unsyncedGeneratedImages.length ? (
                    <Button variant="outline" size="sm" onClick={() => void handleSyncGeneratedImages()} disabled={syncState.syncing}>
                      <Upload className={`mr-1 h-3 w-3 ${syncState.syncing ? "animate-pulse" : ""}`} />
                      {syncState.syncing ? "同步中..." : "立即同步"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-6">
              <section className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-xl font-semibold">文本解析阶段</h2>
                    <p className="text-sm text-muted-foreground">文本解析会在图片生成前完成。</p>
                  </div>
                  <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">已完成</span>
                </div>
                <div className="space-y-3">
                  {parsingSteps.map((step) => (
                    <div key={step.id} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/20 px-4 py-3">
                      <StepIcon status={step.status} />
                      <span className="text-sm text-foreground">{step.label}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
                <div className="mb-4">
                  <h2 className="font-display text-xl font-semibold">图片生成阶段</h2>
                  <p className="text-sm text-muted-foreground">每个模块都会使用自己对应的参考图。</p>
                </div>
                <div className="space-y-3">
                  {generationSteps.map((step) => (
                    <div
                      key={step.id}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                        step.status === "running"
                          ? "border-info/40 bg-info/5"
                          : step.status === "done"
                            ? "border-success/30 bg-success/5"
                            : step.status === "error"
                              ? "border-destructive/30 bg-destructive/5"
                              : "border-border bg-secondary/20"
                      }`}
                    >
                      <StepIcon status={step.status} />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-foreground">{step.label}</div>
                        <div className="text-xs text-muted-foreground">{step.moduleId ? moduleTitle(step.moduleId) : "系统步骤"}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {step.status === "running" ? "执行中" : step.status === "done" ? "已完成" : step.status === "error" ? "失败" : "等待中"}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
                <button
                  type="button"
                  onClick={() => setShowLogs((current) => !current)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <div>
                    <h2 className="font-display text-xl font-semibold">实时日志</h2>
                    <p className="text-sm text-muted-foreground">查看各模块生成结果和失败原因。</p>
                  </div>
                  {showLogs ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                </button>
                {showLogs ? (
                  <div className="mt-4 space-y-3 rounded-2xl bg-secondary/20 p-4">
                    {task.logs.map((log) => (
                      <div key={log.id} className="rounded-xl border border-border bg-background px-4 py-3">
                        <div className="flex items-center justify-between gap-4 text-xs">
                          <span
                            className={`font-medium ${
                              log.level === "success" ? "text-success" : log.level === "error" ? "text-destructive" : "text-info"
                            }`}
                          >
                            {log.level.toUpperCase()}
                          </span>
                          <span className="text-muted-foreground">{new Date(log.createdAt).toLocaleTimeString("zh-CN")}</span>
                        </div>
                        <div className="mt-2 text-sm text-foreground">{log.message}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>

            <div className="space-y-6">
              <section className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-xl font-semibold">结果预览</h2>
                    <p className="text-sm text-muted-foreground">生成成功后会自动显示在这里。</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleShare}>
                    <Share2 className="h-4 w-4" />
                    分享
                  </Button>
                </div>

                {generatedImages.length ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {generatedImages.map((image) => (
                      <div key={image.id} className="rounded-2xl border border-border bg-secondary/20 p-3">
                        <img
                          src={getGeneratedImageSource(image)}
                          alt={image.title}
                          className="aspect-[3/4] w-full rounded-xl object-cover"
                        />
                        <div className="mt-3">
                          <div className="font-medium text-foreground">{image.title}</div>
                          <div className="text-xs text-muted-foreground">{image.subtitle}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-secondary/10 px-6 py-14 text-center text-sm text-muted-foreground">
                    {state.isGenerating ? "图片正在生成中，完成后这里会自动刷新。" : "当前还没有可预览的结果。"}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
                <h2 className="font-display text-xl font-semibold">当前任务配置</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {task.modules.map((moduleId) => (
                    <span key={moduleId} className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                      {moduleTitle(moduleId)}
                    </span>
                  ))}
                </div>
                <div className="mt-5 space-y-3">
                  {Object.entries(task.referenceImages).map(([key, asset]) => (
                    <div key={key} className="flex items-center justify-between rounded-xl border border-border bg-secondary/20 px-4 py-3 text-sm">
                      <span>{moduleTitle(key as keyof typeof task.referenceImages)}</span>
                      <span className="text-muted-foreground">{asset ? `${asset.fileName}${asset.dataUrl ? "" : "（载入中）"}` : "未上传参考图"}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
