import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, CheckSquare, Loader2, RefreshCw, Save, Sparkles, Wand2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { TextAnalysisMode } from "@/lib/text-analysis-contract";
import { analyzeSentenceText } from "@/lib/text-analysis-client";
import { analyzeTaskTextContent, estimateParsingProgressPercentage } from "@/lib/task-text-analysis";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { prepareTranslationImagePanels } from "@/lib/translation-image-prompt";
import {
  completeTaskTextAnalysis,
  createRevisionTask,
  failTaskTextAnalysis,
  hasGeneratedImageSource,
  moduleMetaList,
  replaceTaskText,
  restartTaskTextAnalysis,
  saveTaskEdits,
  setTaskParsingProgress,
  syncTaskDraft,
  triggerTaskGeneration,
  type ModuleId,
  type TextContent,
  useHydratedTask,
} from "@/lib/task-store";

const allModules = moduleMetaList.map((module) => module.id);

function cloneTextContent(textContent: TextContent): TextContent {
  const panels = prepareTranslationImagePanels({
    originSentence: "",
    prompt1: textContent.prompt1,
    prompt2: textContent.prompt2,
    prompt3: textContent.prompt3,
    prompt4: textContent.prompt4,
  });

  return {
    ...textContent,
    prompt1: panels.prompt1,
    prompt2: panels.prompt2,
    prompt3: panels.prompt3,
    prompt4: panels.prompt4,
    grammar: { ...textContent.grammar },
    vocabulary: textContent.vocabulary.map((item) => ({ ...item })),
    ielts: { ...textContent.ielts },
  };
}

function formatElapsedDuration(elapsedMs: number) {
  const totalSeconds = Math.max(1, Math.floor(elapsedMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} 分 ${seconds.toString().padStart(2, "0")} 秒`;
}

export default function EditTaskPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const task = useHydratedTask(taskId);
  const hydratedSnapshotRef = useRef<string | null>(null);
  const startedParsingKeyRef = useRef<string | null>(null);
  const [draft, setDraft] = useState<TextContent | null>(null);
  const [selectedModules, setSelectedModules] = useState<ModuleId[]>([]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [regeneratingSection, setRegeneratingSection] = useState<TextAnalysisMode | null>(null);
  const [activeParsingStep, setActiveParsingStep] = useState<{ mode: TextAnalysisMode; startedAt: number } | null>(null);
  const [parsingClock, setParsingClock] = useState(() => Date.now());

  useEffect(() => {
    if (!task || dirty) return;
    const snapshotKey = `${task.id}:${task.updatedAt}:${task.status}`;
    if (hydratedSnapshotRef.current === snapshotKey) return;
    setDraft(cloneTextContent(task.textContent));
    setSelectedModules(task.modules);
    setDirty(false);
    setSavedAt(task.updatedAt);
    hydratedSnapshotRef.current = snapshotKey;
  }, [dirty, task]);

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
      setError("");
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

        setActiveParsingStep(null);
        const message = analysisError instanceof Error ? analysisError.message : "LLM 文本解析失败，请稍后重试。";
        setError(message);
        failTaskTextAnalysis(taskId, message);
      }
    };

    void runParsing();
    return () => {
      cancelled = true;
    };
  }, [task?.id, task?.status]);

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

  useEffect(() => {
    if (!taskId || !draft) return;
    if (!dirty) return;
    if (Object.values(task?.generatedImages ?? {}).some((image) => hasGeneratedImageSource(image)) || task?.status === "completed") return;

    const timer = window.setTimeout(() => {
      syncTaskDraft(taskId, draft, selectedModules);
      setSavedAt(new Date().toISOString());
    }, 350);

    return () => window.clearTimeout(timer);
  }, [dirty, draft, selectedModules, task?.generatedImages, task?.status, taskId]);

  const hasModuleSelection = selectedModules.length > 0;
  const formattedSavedAt = useMemo(
    () => (savedAt ? new Date(savedAt).toLocaleString("zh-CN") : "未保存"),
    [savedAt],
  );
  const parsingSteps = useMemo(() => task?.steps.filter((step) => step.stage === "parsing") ?? [], [task?.steps]);
  const runningParsingStep = useMemo(
    () => parsingSteps.find((step) => step.status === "running") ?? parsingSteps.find((step) => step.status === "pending") ?? null,
    [parsingSteps],
  );
  const parsingElapsedMs = activeParsingStep ? Math.max(0, parsingClock - activeParsingStep.startedAt) : 0;
  const parsingElapsedLabel = useMemo(
    () => (activeParsingStep ? formatElapsedDuration(parsingElapsedMs) : ""),
    [activeParsingStep, parsingElapsedMs],
  );
  const parsingProgress = useMemo(() => {
    return estimateParsingProgressPercentage({
      totalSteps: parsingSteps.length,
      completedSteps: parsingSteps.filter((step) => step.status === "done").length,
      runningMode: activeParsingStep?.mode,
      elapsedMs: parsingElapsedMs,
    });
  }, [activeParsingStep?.mode, parsingElapsedMs, parsingSteps]);
  const parsingFailed = task?.status === "failed" && parsingSteps.some((step) => step.status === "error");

  if (!task || !draft) {
    return (
      <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
        <div className="container max-w-3xl py-16">
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-elegant">
            <h1 className="font-display text-2xl font-semibold">未找到对应任务</h1>
            <p className="mt-3 text-sm text-muted-foreground">请先从首页发起文本解析，再进入编辑页面。</p>
            <Button asChild className="mt-6">
              <Link to="/">返回首页</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (task.status === "parsing") {
    return (
      <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
        <div className="container max-w-4xl py-10">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
              <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
                返回首页
              </Link>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="font-display text-3xl font-bold">文本解析中</h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{task.sentence}</p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>{task.bookName}</span>
                    <span>{task.author}</span>
                    <span>共 {parsingSteps.length || 1} 个解析步骤</span>
                  </div>
                </div>
                <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-foreground">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{runningParsingStep?.label || "正在准备文本解析任务..."}</span>
                  </div>
                  {parsingElapsedLabel ? (
                    <div className="mt-1 pl-6 text-xs text-muted-foreground">已运行 {parsingElapsedLabel}，长时间无响应会自动超时。</div>
                  ) : null}
                </div>
              </div>

              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">文本解析进度</span>
                  <span className="font-semibold text-foreground">{parsingProgress}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="h-full gradient-gold"
                    initial={{ width: 0 }}
                    animate={{ width: `${parsingProgress}%` }}
                    transition={{ duration: 0.35 }}
                  />
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {parsingSteps.map((step, index) => (
                  <div
                    key={step.id}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                      step.status === "running"
                        ? "border-info/40 bg-info/5"
                        : step.status === "done"
                          ? "border-success/30 bg-success/5"
                          : "border-border bg-secondary/20"
                    }`}
                  >
                    {step.status === "running" ? <Loader2 className="h-4 w-4 animate-spin text-info" /> : <span className="text-sm font-semibold text-accent">{index + 1}</span>}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">{step.label}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {step.status === "done" ? "已完成" : step.status === "running" ? "进行中" : "等待中"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (parsingFailed) {
    return (
      <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
        <div className="container max-w-4xl py-10">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
              <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
                返回首页
              </Link>
              <h1 className="font-display text-3xl font-bold">文本解析失败</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {error || task.logs.find((log) => log.level === "error")?.message || "当前文本解析未能完成。"}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  variant="gold"
                  onClick={() => {
                    startedParsingKeyRef.current = null;
                    setActiveParsingStep(null);
                    restartTaskTextAnalysis(task.id);
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  重新文本解析
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/">返回首页</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  const updateDraft = (updater: (current: TextContent) => TextContent) => {
    setDraft((current) => {
      if (!current) return current;
      setDirty(true);
      return updater(current);
    });
  };

  const updateVocabularyField = (index: number, field: keyof TextContent["vocabulary"][number], value: string) => {
    updateDraft((current) => ({
      ...current,
      vocabulary: current.vocabulary.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    }));
  };

  const toggleModule = (moduleId: ModuleId) => {
    setSelectedModules((current) => {
      const next = current.includes(moduleId) ? current.filter((item) => item !== moduleId) : [...current, moduleId];
      setDirty(true);
      return next;
    });
  };

  const handleSave = () => {
    const hasGeneratedImages = Object.values(task.generatedImages).some((image) => hasGeneratedImageSource(image));
    if (hasGeneratedImages || task.status === "completed") {
      setError("当前任务已有历史结果，点击“下一步：生成图片”会创建新的历史记录，原记录不会被覆盖。");
      return;
    }

    saveTaskEdits(task.id, draft, selectedModules);
    setDirty(false);
    setSavedAt(new Date().toISOString());
    setError("");

  };

  const goNext = async () => {
    if (!selectedModules.length) {
      setError("至少勾选 1 个模块后才能生成图片。");
      return;
    }
    const hasGeneratedImages = Object.values(task.generatedImages).some((image) => hasGeneratedImageSource(image));
    const displayModules = hasGeneratedImages || task.status === "completed"
      ? allModules.filter((moduleId) => task.modules.includes(moduleId) || selectedModules.includes(moduleId))
      : selectedModules;

    if (hasGeneratedImages || task.status === "completed") {
      try {
        const nextTask = await createRevisionTask(task, {
          targetModules: selectedModules,
          displayModules,
          textContent: draft,
        });
        if (!nextTask) {
          setError("无法创建新的重生成历史记录，请稍后重试。");
          return;
        }

        setError("");
        navigate(`/task/${nextTask.id}`);
        return;
      } catch (revisionError) {
        setError(revisionError instanceof Error ? revisionError.message : "无法创建新的重生成历史记录，请稍后重试。");
        return;
      }
    }

    saveTaskEdits(task.id, draft, displayModules);
    triggerTaskGeneration(task.id, selectedModules);
    navigate(`/task/${task.id}`);
  };

  const applyRegenerated = (content: TextContent, analysisSource?: string, analysisModel?: string, message?: string) => {
    setDraft(cloneTextContent(content));
    replaceTaskText(task.id, content, analysisSource === "claude-agent-sdk" || analysisSource === "anthropic-compatible-api" ? analysisSource : undefined, analysisModel);
    setDirty(false);
    setSavedAt(new Date().toISOString());
    if (message) {
      setError(message);
    } else {
      setError("");
    }
  };

  const regenerateSection = async (type: TextAnalysisMode) => {
    setRegeneratingSection(type);
    setError("");

    try {
      const analysis = await analyzeSentenceText({
        sentence: task.sentence,
        bookName: task.bookName,
        author: task.author,
        mode: type,
        currentTextContent: draft,
      });
      applyRegenerated(analysis.textContent, analysis.source, analysis.model);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "LLM 重新生成失败，请稍后重试。");
    } finally {
      setRegeneratingSection(null);
    }
  };

  return (
    <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
      <div className="container max-w-6xl py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-elegant">
            <div>
              <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
                返回首页
              </Link>
              <h1 className="font-display text-3xl font-bold">文本编辑页</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{task.sentence}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>{task.bookName}</span>
                <span>{task.author}</span>
                <span>最后同步：{formattedSavedAt}</span>
                <span>{dirty ? "已修改，草稿自动保存中..." : "草稿已同步到本地"}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={handleSave} disabled={regeneratingSection !== null}>
                <Save className="h-4 w-4" />
                保存修改
              </Button>
              <Button variant="gold" onClick={goNext} disabled={!hasModuleSelection || regeneratingSection !== null}>
                <Sparkles className="h-4 w-4" />
                下一步：生成图片
              </Button>
            </div>
          </div>

          {error ? <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div> : null}
          {regeneratingSection ? (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{regeneratingSection === "all" ? "LLM 正在重新生成整页解析内容..." : `LLM 正在重新生成 ${regeneratingSection} 模块...`}</span>
            </div>
          ) : null}

          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-5 w-5 text-accent" />
                  <div>
                    <h2 className="font-display text-xl font-semibold">分句结果</h2>
                    <p className="text-sm text-muted-foreground">用于生成句译对照图，支持 prompt1-4 单独编辑。</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => void regenerateSection("segmentation")} disabled={regeneratingSection !== null}>
                  <RefreshCw className="h-4 w-4" />
                  重新生成分句
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="prompt1">prompt1 · 英文第一部分</Label>
                  <Textarea
                    id="prompt1"
                    value={draft.prompt1}
                    onChange={(event) => updateDraft((current) => ({ ...current, prompt1: event.target.value }))}
                    className="mt-2 min-h-[120px]"
                  />
                </div>
                <div>
                  <Label htmlFor="prompt2">prompt2 · 中文第一部分</Label>
                  <Textarea
                    id="prompt2"
                    value={draft.prompt2}
                    onChange={(event) => updateDraft((current) => ({ ...current, prompt2: event.target.value }))}
                    className="mt-2 min-h-[120px]"
                  />
                </div>
                <div>
                  <Label htmlFor="prompt3">prompt3 · 英文第二部分</Label>
                  <Textarea
                    id="prompt3"
                    value={draft.prompt3}
                    onChange={(event) => updateDraft((current) => ({ ...current, prompt3: event.target.value }))}
                    className="mt-2 min-h-[120px]"
                  />
                </div>
                <div>
                  <Label htmlFor="prompt4">prompt4 · 中文第二部分</Label>
                  <Textarea
                    id="prompt4"
                    value={draft.prompt4}
                    onChange={(event) => updateDraft((current) => ({ ...current, prompt4: event.target.value }))}
                    className="mt-2 min-h-[120px]"
                  />
                </div>
              </div>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                系统会优先在 and / but / or、分号、从句边界等自然停顿处拆分，方便后续做句译对照图。
              </p>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-semibold">句式分析</h2>
                  <p className="text-sm text-muted-foreground">句式分析图和句式总结图都会读取这里的内容。</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void regenerateSection("grammar")} disabled={regeneratingSection !== null}>
                  <RefreshCw className="h-4 w-4" />
                  重新生成句式分析
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[0.8fr_0.8fr_1.4fr]">
                <div>
                  <Label htmlFor="tense">时态分析</Label>
                  <Textarea
                    id="tense"
                    value={draft.grammar.tense}
                    onChange={(event) => updateDraft((current) => ({ ...current, grammar: { ...current.grammar, tense: event.target.value } }))}
                    className="mt-2 min-h-[140px]"
                  />
                </div>
                <div>
                  <Label htmlFor="voice">语态识别</Label>
                  <Textarea
                    id="voice"
                    value={draft.grammar.voice}
                    onChange={(event) => updateDraft((current) => ({ ...current, grammar: { ...current.grammar, voice: event.target.value } }))}
                    className="mt-2 min-h-[140px]"
                  />
                </div>
                <div>
                  <Label htmlFor="structure">句式分析详细内容</Label>
                  <Textarea
                    id="structure"
                    value={draft.grammar.structure}
                    onChange={(event) => updateDraft((current) => ({ ...current, grammar: { ...current.grammar, structure: event.target.value } }))}
                    className="mt-2 min-h-[140px]"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-semibold">词汇解析</h2>
                  <p className="text-sm text-muted-foreground">默认生成 6 个词汇卡片，可逐项修改词形、词性、释义和例句。</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void regenerateSection("vocabulary")} disabled={regeneratingSection !== null}>
                  <RefreshCw className="h-4 w-4" />
                  重新生成词汇解析
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {draft.vocabulary.map((item, index) => (
                  <div key={item.id} className="rounded-2xl border border-border bg-secondary/25 p-4">
                    <div className="mb-3 text-sm font-semibold text-foreground">词汇 {index + 1}</div>
                    <div className="space-y-3">
                      <div>
                        <Label>单词原形</Label>
                        <Input value={item.word} onChange={(event) => updateVocabularyField(index, "word", event.target.value)} className="mt-2" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label>音标</Label>
                          <Input value={item.phonetic} onChange={(event) => updateVocabularyField(index, "phonetic", event.target.value)} className="mt-2" />
                        </div>
                        <div>
                          <Label>词性</Label>
                          <Input value={item.partOfSpeech} onChange={(event) => updateVocabularyField(index, "partOfSpeech", event.target.value)} className="mt-2" />
                        </div>
                      </div>
                      <div>
                        <Label>中文释义</Label>
                        <Textarea value={item.meaning} onChange={(event) => updateVocabularyField(index, "meaning", event.target.value)} className="mt-2 min-h-[90px]" />
                      </div>
                      <div>
                        <Label>英文例句</Label>
                        <Textarea value={item.example} onChange={(event) => updateVocabularyField(index, "example", event.target.value)} className="mt-2 min-h-[90px]" />
                      </div>
                      <div>
                        <Label>中文译文</Label>
                        <Textarea value={item.translation} onChange={(event) => updateVocabularyField(index, "translation", event.target.value)} className="mt-2 min-h-[90px]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-semibold">雅思备考建议</h2>
                  <p className="text-sm text-muted-foreground">听、说、读、写四项建议分段保存，结果页会直接追溯这些源文本。</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void regenerateSection("ielts")} disabled={regeneratingSection !== null}>
                  <RefreshCw className="h-4 w-4" />
                  重新生成雅思建议
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {(
                  [
                    ["listening", "听力建议"],
                    ["speaking", "口语建议"],
                    ["reading", "阅读建议"],
                    ["writing", "写作建议"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <Label htmlFor={key}>{label}</Label>
                    <Textarea
                      id={key}
                      value={draft.ielts[key]}
                      onChange={(event) => updateDraft((current) => ({ ...current, ielts: { ...current.ielts, [key]: event.target.value } }))}
                      className="mt-2 min-h-[160px]"
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
              <div className="mb-5 flex items-center gap-3">
                <CheckSquare className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-xl font-semibold">选择要生成的模块</h2>
                  <p className="text-sm text-muted-foreground">如果与首页勾选冲突，以这里的勾选结果为准。</p>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-3">
                <Button variant="outline" size="sm" onClick={() => { setSelectedModules([...allModules]); setDirty(true); }}>
                  全选
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setSelectedModules([]); setDirty(true); }}>
                  取消全选
                </Button>
              </div>

              <div className="space-y-3">
                {moduleMetaList.map((module) => {
                  const checked = selectedModules.includes(module.id);
                  return (
                    <label
                      key={module.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
                        checked ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"
                      }`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleModule(module.id)} className="mt-1" />
                      <div>
                        <div className="font-medium text-foreground">
                          {module.title} <span className="text-xs text-muted-foreground">路 {module.panels}</span>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">{module.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
              <div className="flex flex-wrap justify-between gap-3">
                <Button variant="outline" onClick={handleSave} disabled={regeneratingSection !== null}>
                  <Save className="h-4 w-4" />
                  保存修改
                </Button>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => void regenerateSection("all")} disabled={regeneratingSection !== null}>
                    <Wand2 className="h-4 w-4" />
                    全部重新生成
                  </Button>
                  <Button variant="gold" onClick={goNext} disabled={!hasModuleSelection || regeneratingSection !== null}>
                    <Sparkles className="h-4 w-4" />
                    确认并生成图片
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

