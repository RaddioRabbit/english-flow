import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  RefreshCw,
  RotateCcw,
  Save,
  Share2,
  Upload,
  X,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isSupabaseConfigured } from "@/lib/image-store";
import { downloadAllImages, downloadGeneratedImage, sharePage } from "@/lib/media-utils";
import { listTranslationHighlightMarkerIndexes } from "@/lib/translation-image-highlights";
import {
  createRevisionTask,
  duplicateTaskForRegeneration,
  getGeneratedImageSource,
  hasGeneratedImageSource,
  moduleTitle,
  syncGeneratedImagesToSupabase,
  type TextContent,
  useHydratedTask,
  type ModuleId,
  type StepStatus,
} from "@/lib/task-store";

function cloneTextContent(textContent: TextContent): TextContent {
  return {
    ...textContent,
    grammar: { ...textContent.grammar },
    vocabulary: textContent.vocabulary.map((item) => ({ ...item })),
    ielts: { ...textContent.ielts },
  };
}

function getModuleTextContent(task: NonNullable<ReturnType<typeof useHydratedTask>>, moduleId: ModuleId): string {
  switch (moduleId) {
    case "translation":
      return `Prompt1: ${task.textContent.prompt1}\n\nPrompt2: ${task.textContent.prompt2}\n\nPrompt3: ${task.textContent.prompt3}\n\nPrompt4: ${task.textContent.prompt4}`;
    case "grammar":
      return `时态：${task.textContent.grammar.tense}\n\n语态：${task.textContent.grammar.voice}\n\n结构：${task.textContent.grammar.structure}`;
    case "summary":
      return `时态：${task.textContent.grammar.tense}\n\n结构总结：${task.textContent.grammar.structure}`;
    case "vocabulary":
      return task.textContent.vocabulary
        .map(
          (item, index) =>
            `${index + 1}. ${item.word} ${item.phonetic} ${item.partOfSpeech}\n释义：${item.meaning}\n例句：${item.example}\n译文：${item.translation}`,
        )
        .join("\n\n");
    case "ielts":
      return `听力：${task.textContent.ielts.listening}\n\n口语：${task.textContent.ielts.speaking}\n\n阅读：${task.textContent.ielts.reading}\n\n写作：${task.textContent.ielts.writing}`;
    default:
      return "";
  }
}

function getModuleSubtitle(moduleId: ModuleId): string {
  switch (moduleId) {
    case "translation":
      return "6 宫格句译对照图";
    case "grammar":
      return "4 宫格句式结构分析图";
    case "summary":
      return "2 宫格句式总结图";
    case "vocabulary":
      return "6 宫格词汇解析图";
    case "ielts":
      return "4 宫格雅思备考图";
    default:
      return "";
  }
}

function getGenerationStatusLabel(status: StepStatus): string {
  switch (status) {
    case "running":
      return "生成中";
    case "done":
      return "已完成";
    case "error":
      return "失败";
    default:
      return "待生成";
  }
}

function getGenerationStatusText(status: StepStatus): string {
  switch (status) {
    case "running":
      return "该模块正在生成图片。";
    case "done":
      return "该模块已生成图片，可下载或查看大图。";
    case "error":
      return "该模块生成失败，可直接在这里查看文本详情并重新生成。";
    default:
      return "该模块还没有生成图片。";
  }
}

function getGenerationStatusClass(status: StepStatus): string {
  switch (status) {
    case "running":
      return "bg-info/10 text-info";
    case "done":
      return "bg-success/10 text-success";
    case "error":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-secondary text-muted-foreground";
  }
}

function buildSyncMessage(result: { uploaded: number; failed: number }) {
  if (result.uploaded || result.failed) {
    return `生成图同步完成：成功 ${result.uploaded} 张，失败 ${result.failed} 张。`;
  }

  return "当前生成图已完成云端同步。";
}

function describeTranslationMarkerIndexes(text: string) {
  const indexes = listTranslationHighlightMarkerIndexes(text);
  return indexes.length ? `已识别手动标注编号：${indexes.join("、")}` : "未识别到手动标注，将继续使用自动高亮。";
}

export default function TaskResultsPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const task = useHydratedTask(taskId);
  const images = useMemo(
    () =>
      task?.modules
        .map((moduleId) => task.generatedImages?.[moduleId])
        .filter((image): image is NonNullable<typeof image> => hasGeneratedImageSource(image)) ?? [],
    [task?.generatedImages, task?.modules],
  );
  const unsyncedGeneratedImages = useMemo(() => images.filter((image) => !image.publicUrl), [images]);
  const latestCloudErrorLog = useMemo(
    () => task?.logs.find((log) => log.level === "error" && log.message.includes("Supabase")) ?? null,
    [task?.logs],
  );
  const visibleCloudErrorLog = useMemo(
    () => (unsyncedGeneratedImages.length ? latestCloudErrorLog : null),
    [latestCloudErrorLog, unsyncedGeneratedImages.length],
  );
  const detailModules = useMemo(() => {
    if (!task) {
      return [];
    }

    return task.modules.map((moduleId) => {
      const image = task.generatedImages?.[moduleId];
      const stepStatus =
        task.steps.find((step) => step.stage === "generation" && step.moduleId === moduleId)?.status ??
        (hasGeneratedImageSource(image) ? "done" : task.status === "failed" ? "error" : task.status === "generating" ? "running" : "pending");

      return {
        moduleId,
        image,
        stepStatus,
      };
    });
  }, [task]);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [shareState, setShareState] = useState("");
  const [syncState, setSyncState] = useState<{ syncing: boolean; message: string }>({
    syncing: false,
    message: "",
  });
  const [editingTexts, setEditingTexts] = useState<Record<string, string>>({});
  const [regeneratingModules, setRegeneratingModules] = useState<Set<string>>(new Set());
  const autoSyncAttemptKeyRef = useRef<string>("");
  const unsyncedSyncKey = useMemo(
    () => unsyncedGeneratedImages.map((image) => `${image.id}:${image.fileName}`).sort().join("|"),
    [unsyncedGeneratedImages],
  );
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
            <h1 className="font-display text-2xl font-semibold">结果不存在</h1>
            <p className="mt-3 text-sm text-muted-foreground">请先完成任务创建，再进入详情页面。</p>
            <Button asChild className="mt-6">
              <Link to="/">返回首页</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleShare = async () => {
    const shared = await sharePage(`${task.bookName} - 图片详情`, window.location.href);
    setShareState(shared ? "已调用系统分享。" : "结果页链接已复制到剪贴板。");
    window.setTimeout(() => setShareState(""), 2400);
  };

  const handleRegenerate = () => {
    const nextTask = duplicateTaskForRegeneration(task.id);
    if (nextTask) {
      navigate(`/task/${nextTask.id}`);
    }
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

  const handleTextChange = (moduleId: ModuleId, value: string) => {
    setEditingTexts((prev) => ({ ...prev, [moduleId]: value }));
  };

  const handleRegenerateModule = async (moduleId: ModuleId) => {
    setRegeneratingModules((prev) => new Set(prev).add(moduleId));

    const editedText = editingTexts[moduleId];
    const nextTextContent = editedText ? cloneTextContent(task.textContent) : task.textContent;

    if (editedText) {
      const newTextContent = nextTextContent;

      switch (moduleId) {
        case "translation": {
          const lines = editedText.split("\n").filter((line) => line.trim());
          lines.forEach((line) => {
            if (line.startsWith("Prompt1:")) {
              newTextContent.prompt1 = line.replace("Prompt1:", "").trim();
            } else if (line.startsWith("Prompt2:")) {
              newTextContent.prompt2 = line.replace("Prompt2:", "").trim();
            } else if (line.startsWith("Prompt3:")) {
              newTextContent.prompt3 = line.replace("Prompt3:", "").trim();
            } else if (line.startsWith("Prompt4:")) {
              newTextContent.prompt4 = line.replace("Prompt4:", "").trim();
            }
          });
          break;
        }
        case "grammar": {
          const lines = editedText.split("\n").filter((line) => line.trim());
          lines.forEach((line) => {
            if (line.startsWith("时态：")) {
              newTextContent.grammar = { ...newTextContent.grammar, tense: line.replace("时态：", "").trim() };
            } else if (line.startsWith("语态：")) {
              newTextContent.grammar = { ...newTextContent.grammar, voice: line.replace("语态：", "").trim() };
            } else if (line.startsWith("结构：")) {
              newTextContent.grammar = { ...newTextContent.grammar, structure: line.replace("结构：", "").trim() };
            }
          });
          break;
        }
        case "summary": {
          const lines = editedText.split("\n").filter((line) => line.trim());
          lines.forEach((line) => {
            if (line.startsWith("时态：")) {
              newTextContent.grammar = { ...newTextContent.grammar, tense: line.replace("时态：", "").trim() };
            } else if (line.startsWith("结构总结：")) {
              newTextContent.grammar = { ...newTextContent.grammar, structure: line.replace("结构总结：", "").trim() };
            }
          });
          break;
        }
        case "ielts": {
          const sections = editedText.split("\n\n").filter((section) => section.trim());
          sections.forEach((section) => {
            if (section.startsWith("听力：")) {
              newTextContent.ielts = { ...newTextContent.ielts, listening: section.replace("听力：", "").trim() };
            } else if (section.startsWith("口语：")) {
              newTextContent.ielts = { ...newTextContent.ielts, speaking: section.replace("口语：", "").trim() };
            } else if (section.startsWith("阅读：")) {
              newTextContent.ielts = { ...newTextContent.ielts, reading: section.replace("阅读：", "").trim() };
            } else if (section.startsWith("写作：")) {
              newTextContent.ielts = { ...newTextContent.ielts, writing: section.replace("写作：", "").trim() };
            }
          });
          break;
        }
        case "vocabulary":
          break;
      }
    }

    try {
      const nextTask = await createRevisionTask(task, {
        targetModules: [moduleId],
        displayModules: task.modules,
        textContent: nextTextContent,
      });
      if (nextTask) {
        navigate(`/task/${nextTask.id}`);
        return;
      }
    } catch (error) {
      console.error("Failed to create revision task.", error);
    }

    setRegeneratingModules((prev) => {
      const next = new Set(prev);
      next.delete(moduleId);
      return next;
    });
  };

  const moveLightbox = (direction: "prev" | "next") => {
    if (lightboxIndex === null || !images.length) {
      return;
    }

    const delta = direction === "prev" ? -1 : 1;
    setLightboxIndex((lightboxIndex + delta + images.length) % images.length);
  };

  const currentLightboxImage = lightboxIndex !== null ? images[lightboxIndex] : null;

  return (
    <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
      <div className="container max-w-5xl py-10">
        <Link to={`/task/${task.id}`} className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          返回任务详情
        </Link>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-3xl font-bold">图片详情</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{task.sentence}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>{task.bookName}</span>
                  <span>{task.author}</span>
                  <span>更新时间：{new Date(task.completedAt ?? task.updatedAt).toLocaleString("zh-CN")}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => void downloadAllImages(images)} disabled={!images.length}>
                  <Download className="h-4 w-4" />
                  下载全部
                </Button>
                {isSupabaseConfigured() && unsyncedGeneratedImages.length ? (
                  <Button variant="outline" onClick={() => void handleSyncGeneratedImages()} disabled={syncState.syncing}>
                    <Upload className={`h-4 w-4 ${syncState.syncing ? "animate-pulse" : ""}`} />
                    {syncState.syncing ? "同步中..." : `同步到 Supabase (${unsyncedGeneratedImages.length})`}
                  </Button>
                ) : null}
                <Button variant="outline" onClick={handleRegenerate}>
                  <RefreshCw className="h-4 w-4" />
                  重新生成
                </Button>
                <Button variant="gold" onClick={handleShare}>
                  <Share2 className="h-4 w-4" />
                  分享
                </Button>
              </div>
            </div>
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

          <div className="mt-6 space-y-6">
            {detailModules.map((detailModule, index) => {
              const moduleText = getModuleTextContent(task, detailModule.moduleId);
              const editedText = editingTexts[detailModule.moduleId] ?? moduleText;
              const isRegenerating = regeneratingModules.has(detailModule.moduleId);
              const hasChanges = editedText !== moduleText;
              const translationMarkerHint =
                detailModule.moduleId === "translation" ? describeTranslationMarkerIndexes(editedText) : "";
              const sectionKey = detailModule.image?.id ?? detailModule.moduleId;
              const previewIndex = detailModule.image ? images.findIndex((image) => image.id === detailModule.image?.id) : -1;
              const title = detailModule.image?.title ?? moduleTitle(detailModule.moduleId);
              const sourceSnapshot = detailModule.image?.sourceText || moduleText;
              const imageSource = getGeneratedImageSource(detailModule.image);
              const hasImageSource = Boolean(detailModule.image && imageSource);

              return (
                <section key={sectionKey} className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10">
                        <span className="text-lg font-bold text-gold">{index + 1}</span>
                      </div>
                      <div>
                        <h2 className="font-display text-xl font-semibold">{title}</h2>
                        <p className="text-xs text-muted-foreground">{getModuleSubtitle(detailModule.moduleId)}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${getGenerationStatusClass(detailModule.stepStatus)}`}>
                      {getGenerationStatusLabel(detailModule.stepStatus)}
                    </span>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div className="rounded-xl border border-border bg-secondary/20 p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">文本解析内容</span>
                          <span className="text-xs text-muted-foreground">可编辑</span>
                        </div>
                        <Textarea
                          value={editedText}
                          onChange={(event) => handleTextChange(detailModule.moduleId, event.target.value)}
                          className="min-h-[220px] resize-y border-border bg-card font-mono text-sm leading-relaxed"
                          placeholder={`在此编辑 ${title} 的文本内容`}
                        />
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs text-muted-foreground">
                            {hasChanges ? (
                              <span className="flex items-center gap-1 text-amber-600">
                                <Save className="h-3 w-3" />
                                内容已修改，可重新生成
                              </span>
                            ) : (
                              <span>{hasImageSource ? "当前内容已与已生成图片一致" : "当前还没有生成图片，可直接发起生成"}</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {hasChanges ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingTexts((prev) => ({ ...prev, [detailModule.moduleId]: moduleText }))}
                              >
                                <RotateCcw className="mr-1 h-3 w-3" />
                                重置
                              </Button>
                            ) : null}
                            <Button
                              variant="gold"
                              size="sm"
                              onClick={() => handleRegenerateModule(detailModule.moduleId)}
                              disabled={isRegenerating}
                            >
                              <RefreshCw className={`mr-1 h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
                              {isRegenerating ? "生成中..." : hasImageSource ? "再次生成" : "立即生成"}
                            </Button>
                          </div>
                        </div>
                        {detailModule.moduleId === "translation" ? (
                          <div className="mt-3 rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs leading-6 text-muted-foreground">
                            <p>高级标注：用 <code>//编号/文本//</code> 手动覆盖句译对照图下划线范围，同编号英中同色。</p>
                            <p>示例：<code>//1/tang//</code> 对应 <code>//1/气息//</code>，只影响当前编号，其余词仍按自动高亮。</p>
                            <p>{translationMarkerHint}</p>
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-xl border border-border/50 bg-secondary/10 p-3">
                        <button
                          type="button"
                          onClick={() => setExpandedSource((current) => (current === sectionKey ? null : sectionKey))}
                          className="flex w-full items-center justify-between text-sm text-muted-foreground hover:text-foreground"
                        >
                          <span className="flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            查看文本快照 · {moduleTitle(detailModule.moduleId)}
                          </span>
                          <ChevronRight className={`h-4 w-4 transition-transform ${expandedSource === sectionKey ? "rotate-90" : ""}`} />
                        </button>
                        {expandedSource === sectionKey ? (
                          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap border-t border-border/50 pt-3 text-xs leading-6 text-muted-foreground">
                            {sourceSnapshot}
                          </pre>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-xl border border-border bg-secondary/20 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">图片结果</span>
                          {hasImageSource ? (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => detailModule.image && void downloadGeneratedImage(detailModule.image)}
                              >
                                <Download className="mr-1 h-3 w-3" />
                                下载
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => previewIndex >= 0 && setLightboxIndex(previewIndex)}>
                                查看大图
                              </Button>
                            </div>
                          ) : null}
                        </div>

                        {hasImageSource ? (
                          <button type="button" onClick={() => previewIndex >= 0 && setLightboxIndex(previewIndex)} className="block w-full">
                            <img
                              src={imageSource}
                              alt={title}
                              className="w-full rounded-lg border border-border object-cover shadow-elegant transition-all hover:shadow-lg"
                            />
                          </button>
                        ) : (
                          <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-border bg-background/70 px-6 text-center text-sm text-muted-foreground">
                            {getGenerationStatusText(detailModule.stepStatus)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </motion.div>
      </div>

      {currentLightboxImage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-4 py-8">
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute right-5 top-5 rounded-full border border-white/20 p-2 text-white transition-colors hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => moveLightbox("prev")}
            className="absolute left-4 rounded-full border border-white/20 p-3 text-white transition-colors hover:bg-white/10"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="max-h-full w-full max-w-3xl">
            <img
              src={getGeneratedImageSource(currentLightboxImage)}
              alt={currentLightboxImage.title}
              className="max-h-[82vh] w-full rounded-2xl object-contain"
            />
            <div className="mt-4 text-center text-white">
              <div className="font-display text-2xl">{currentLightboxImage.title}</div>
              <div className="text-sm text-white/70">{currentLightboxImage.subtitle}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => moveLightbox("next")}
            className="absolute right-4 rounded-full border border-white/20 p-3 text-white transition-colors hover:bg-white/10"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
