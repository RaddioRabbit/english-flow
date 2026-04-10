import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, Check, Headphones, Languages, PencilLine, PlayCircle, RefreshCw, Save, Video, Volume2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateSentenceExplanation } from "@/lib/sentence-explanation-client";
import {
  replaceSentenceExplanationSection,
  updateSentenceExplanationArticleText,
  updateSentenceExplanationSectionContent,
} from "@/lib/sentence-explanation-article-edit";
import {
  joinSentenceExplanationLines,
  normalizeSentenceExplanationLines,
  getSentenceExplanationRegenerationTargetKey,
  sentenceExplanationModuleLabels,
  sentenceExplanationModuleOrder,
  type SentenceExplanationRegenerationTarget,
  type SentenceExplanationResponse,
} from "@/lib/sentence-explanation-contract";
import {
  generateSentenceExplanationTts,
  previewSentenceExplanationTtsVoice,
} from "@/lib/sentence-explanation-tts-client";
import {
  DEFAULT_TTS_MODEL,
  getSentenceExplanationTtsLanguageOption,
  getSentenceExplanationTtsVoiceOption,
  resolveSentenceExplanationTtsSelection,
  sentenceExplanationTtsLanguageOptions,
  sentenceExplanationTtsModelOptions,
  sentenceExplanationTtsGenderLabels,
  sentenceExplanationTtsVoiceLabels,
  type SentenceExplanationTtsVoiceGender,
} from "@/lib/sentence-explanation-tts-options";
import type {
  SentenceExplanationTtsLanguage,
  SentenceExplanationTtsModel,
  SentenceExplanationTtsPreviewResponse,
  SentenceExplanationTtsResponse,
  SentenceExplanationTtsVoice,
} from "@/lib/sentence-explanation-tts-contract";
import {
  createSentenceExplanationArticleTask,
  createSentenceExplanationRevisionTask,
  getGeneratedImageSource,
  hasGeneratedImageSource,
  saveSentenceExplanationArticle,
  saveSentenceExplanationTts,
  useHydratedTask,
} from "@/lib/task-store";
import { createSentenceExplanationVideoPlan } from "@/lib/sentence-explanation-video";

function formatSourceLabel(source: SentenceExplanationResponse["source"]) {
  return source === "anthropic-compatible-api" ? "Anthropic Compatible API" : "OpenAI Compatible API";
}

function estimateLoadingProgress(elapsedMs: number) {
  const progress = 8 + 86 * (1 - Math.exp(-elapsedMs / 20_000));
  return Math.min(94, Math.max(8, Math.round(progress)));
}

function formatLoadingStage(progress: number) {
  if (progress < 35) {
    return "正在整理五张解析图和文本解析内容...";
  }

  if (progress < 70) {
    return "正在按图片顺序生成句子讲解文章...";
  }

  return "正在润色段落并整理最终内容...";
}

function estimateTtsLoadingProgress(elapsedMs: number) {
  const estimatedDurationMs = 48_000;
  const ratio = elapsedMs / estimatedDurationMs;
  const progress = 8 + 86 * (1 - Math.exp(-ratio * 2.2));
  return Math.min(99, Math.max(8, Math.round(progress)));
}

const LONG_FORM_TTS_SEGMENT_THRESHOLD = 60;

function formatTtsLoadingStage(progress: number, segmentCount: number) {
  if (segmentCount >= LONG_FORM_TTS_SEGMENT_THRESHOLD) {
    if (progress < 35) {
      return "正在整理长文讲解并准备语音参数...";
    }

    if (progress < 70) {
      return `正在分批生成 ${segmentCount} 段语音...`;
    }

    if (progress < 90) {
      return `长文共有 ${segmentCount} 段语音，正在继续生成剩余片段...`;
    }

    return `长文共有 ${segmentCount} 段语音，正在汇总音频结果并回写页面...`;
  }

  if (progress < 35) {
    return "正在整理讲解文章并准备语音参数...";
  }

  if (progress < 70) {
    return "正在按讲解顺序逐段生成语音...";
  }

  return "正在汇总音频结果并回写页面...";
}

function formatTtsLoadingHint(segmentCount: number) {
  if (segmentCount >= LONG_FORM_TTS_SEGMENT_THRESHOLD) {
    return `当前文章共 ${segmentCount} 段语音。长文 TTS 会明显比普通文章慢，页面会在全部音频就绪后自动回写。`;
  }

  return "当前会按讲解文章的顺序逐段生成音频，生成完成后可直接在对应模块中播放。";
}

function LoadingDots({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="h-2 w-2 rounded-full bg-accent"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
          transition={{
            duration: 0.95,
            repeat: Infinity,
            ease: "easeInOut",
            delay: index * 0.14,
          }}
        />
      ))}
    </div>
  );
}

const DEFAULT_TTS_LANGUAGE: SentenceExplanationTtsLanguage = "zh";
const DEFAULT_TTS_VOICE: SentenceExplanationTtsVoice =
  getSentenceExplanationTtsLanguageOption(DEFAULT_TTS_LANGUAGE).defaultVoice;
const DEFAULT_TTS_SELECTION = resolveSentenceExplanationTtsSelection({
  language: DEFAULT_TTS_LANGUAGE,
  voice: DEFAULT_TTS_VOICE,
});

function getSectionEditorKey(moduleId: string) {
  return `section:${moduleId}`;
}

function isSameSnapshot(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

const VOCABULARY_NUMBER_LABELS: Record<string, number> = {
  "一": 1,
  "二": 2,
  "三": 3,
  "四": 4,
  "五": 5,
  "六": 6,
  "七": 7,
  "八": 8,
  "九": 9,
  "十": 10,
};

function parseVocabularyEntryNumber(line: string) {
  const match = line.replace(/\s+/g, " ").match(/第\s*([0-9]+|[一二三四五六七八九十]+)\s*个词/u);
  if (!match) {
    return null;
  }

  const token = match[1] || "";
  if (/^\d+$/.test(token)) {
    return Number.parseInt(token, 10);
  }

  return VOCABULARY_NUMBER_LABELS[token] ?? null;
}

function sanitizeSentenceExplanationPayload(payload: SentenceExplanationResponse | null) {
  if (!payload) {
    return payload;
  }

  const vocabularySection = payload.article.sections.find((section) => section.moduleId === "vocabulary");
  if (!vocabularySection) {
    return payload;
  }

  const lines = normalizeSentenceExplanationLines(vocabularySection.lines, vocabularySection.content);
  if (lines.length < 2) {
    return payload;
  }

  const seenNumbers = new Set<number>();
  let duplicateStartIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const number = parseVocabularyEntryNumber(lines[index] || "");
    if (number === null) {
      continue;
    }

    if (number === 1 && seenNumbers.size >= 2) {
      duplicateStartIndex = index;
      break;
    }

    seenNumbers.add(number);
  }

  if (duplicateStartIndex < 0) {
    return payload;
  }

  const dedupedLines = lines.slice(0, duplicateStartIndex);
  const nextArticle = replaceSentenceExplanationSection(payload.article, "vocabulary", {
    moduleName: vocabularySection.moduleName,
    imageRef: vocabularySection.imageRef,
    content: joinSentenceExplanationLines(dedupedLines),
    lines: dedupedLines,
  });

  return isSameSnapshot(nextArticle, payload.article)
    ? payload
    : {
        ...payload,
        article: nextArticle,
      };
}

function countResolvedTtsSegments(payload: SentenceExplanationTtsResponse | null | undefined) {
  if (!payload) {
    return 0;
  }

  return [
    payload.introduction,
    ...payload.sections.map((section) => section.content),
    payload.conclusion,
  ].reduce((total, content) => {
    const lineCount =
      content.lineAudios?.filter((lineAudio) => Boolean(lineAudio.audioDataUrl || lineAudio.publicUrl)).length ?? 0;
    if (lineCount) {
      return total + lineCount;
    }

    return total + (content.audioDataUrl || content.publicUrl ? 1 : 0);
  }, 0);
}

function countSentenceExplanationTtsSegments(article: SentenceExplanationResponse["article"] | null | undefined) {
  if (!article) {
    return 0;
  }

  const introductionCount = normalizeSentenceExplanationLines(
    article.introductionLines,
    article.introduction,
  ).length;
  const sectionCount = article.sections.reduce((total, section) => {
    return total + normalizeSentenceExplanationLines(section.lines, section.content).length;
  }, 0);
  const conclusionCount = normalizeSentenceExplanationLines(
    article.conclusionLines,
    article.conclusion,
  ).length;

  return introductionCount + sectionCount + conclusionCount;
}

function pickStableTtsPayload(
  current: SentenceExplanationTtsResponse | null,
  incoming: SentenceExplanationTtsResponse | null | undefined,
) {
  const nextPayload = incoming ?? null;

  if (!current) {
    return nextPayload;
  }

  if (!nextPayload) {
    return null;
  }

  return countResolvedTtsSegments(nextPayload) < countResolvedTtsSegments(current) ? current : nextPayload;
}

function renderAudioContent(
  content: SentenceExplanationTtsResponse["introduction"] | SentenceExplanationTtsResponse["sections"][number]["content"],
  emptyText: string,
) {
  if (content.lineAudios?.length) {
    return (
      <div className="mt-3 space-y-3">
        {content.lineAudios.map((lineAudio) => (
          <div key={`${lineAudio.lineIndex}-${lineAudio.text}`} className="space-y-2">
            <p className="text-sm text-foreground">{lineAudio.text}</p>
            {lineAudio.audioDataUrl || lineAudio.publicUrl ? (
              <audio controls preload="none" className="w-full" src={lineAudio.audioDataUrl || lineAudio.publicUrl || ""} />
            ) : (
              <p className="text-xs text-muted-foreground">{emptyText}</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (content.audioDataUrl || content.publicUrl) {
    return <audio controls preload="none" className="mt-3 w-full" src={content.audioDataUrl || content.publicUrl || ""} />;
  }

  return <p className="mt-3 text-sm text-muted-foreground">{emptyText}</p>;
}

export default function SentenceExplanationPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const task = useHydratedTask(taskId);
  const autoLoadTaskKeyRef = useRef<string>("");
  const initializedTaskIdRef = useRef<string>("");
  const ttsRequestInFlightRef = useRef(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [ttsLoadingProgress, setTtsLoadingProgress] = useState(0);
  const [state, setState] = useState<{
    loading: boolean;
    error: string;
    payload: SentenceExplanationResponse | null;
  }>({
    loading: false,
    error: "",
    payload: null,
  });
  const [selectedLanguage, setSelectedLanguage] = useState<SentenceExplanationTtsLanguage>(DEFAULT_TTS_LANGUAGE);
  const [selectedAccent, setSelectedAccent] = useState<string>(DEFAULT_TTS_SELECTION.accent);
  const [selectedGender, setSelectedGender] = useState<SentenceExplanationTtsVoiceGender>(DEFAULT_TTS_SELECTION.gender);
  const [selectedVoice, setSelectedVoice] = useState<SentenceExplanationTtsVoice>(DEFAULT_TTS_VOICE);
  const [selectedModel, setSelectedModel] = useState<SentenceExplanationTtsModel>(DEFAULT_TTS_MODEL);
  const [previewState, setPreviewState] = useState<{
    loading: boolean;
    error: string;
    payload: SentenceExplanationTtsPreviewResponse | null;
  }>({
    loading: false,
    error: "",
    payload: null,
  });
  const [ttsState, setTtsState] = useState<{
    loading: boolean;
    error: string;
    payload: SentenceExplanationTtsResponse | null;
  }>({
    loading: false,
    error: "",
    payload: null,
  });
  const [regeneratingBlockKey, setRegeneratingBlockKey] = useState<string | null>(null);
  const [editingBlocks, setEditingBlocks] = useState<Record<string, boolean>>({});
  const [articleEditedSinceTts, setArticleEditedSinceTts] = useState(false);
  const article = state.payload?.article ?? null;
  const ttsSegmentCount = useMemo(() => countSentenceExplanationTtsSegments(article), [article]);
  const hasArticleDraftChanges = useMemo(
    () => Boolean(task && state.payload && !isSameSnapshot(state.payload, task.sentenceExplanation?.article ?? null)),
    [state.payload, task],
  );
  const taskHasSavedExplanation = useMemo(() => {
    if (!task?.sentenceExplanation) {
      return false;
    }

    return Boolean(
      task.sentenceExplanation.article ||
        task.sentenceExplanation.tts ||
        task.sentenceExplanation.video ||
        task.sentenceExplanation.stage === "article" ||
        task.sentenceExplanation.stage === "tts" ||
        task.sentenceExplanation.stage === "video",
    );
  }, [task]);

  const explanationReady = useMemo(
    () => sentenceExplanationModuleOrder.every((moduleId) => hasGeneratedImageSource(task?.generatedImages?.[moduleId])),
    [task?.generatedImages],
  );
  const voiceSelection = useMemo(
    () =>
      resolveSentenceExplanationTtsSelection({
        language: selectedLanguage,
        accent: selectedAccent,
        gender: selectedGender,
        voice: selectedVoice,
      }),
    [selectedAccent, selectedGender, selectedLanguage, selectedVoice],
  );
  const selectedLanguageOption = voiceSelection.languageOption;
  const accentOptions = voiceSelection.accentOptions;
  const genderOptions = voiceSelection.genderOptions;
  const voiceOptions = voiceSelection.voiceOptions;
  const selectedVoiceOption = voiceSelection.voiceOption;

  useEffect(() => {
    if (!task?.id) {
      initializedTaskIdRef.current = "";
      autoLoadTaskKeyRef.current = "";
      ttsRequestInFlightRef.current = false;
      setLoadingProgress(0);
      setTtsLoadingProgress(0);
      setSelectedLanguage(DEFAULT_TTS_LANGUAGE);
      setSelectedAccent(DEFAULT_TTS_SELECTION.accent);
      setSelectedGender(DEFAULT_TTS_SELECTION.gender);
      setSelectedVoice(DEFAULT_TTS_SELECTION.voice);
      setSelectedModel(DEFAULT_TTS_MODEL);
      setRegeneratingBlockKey(null);
      setEditingBlocks({});
      setArticleEditedSinceTts(false);
      setState({
        loading: false,
        error: "",
        payload: null,
      });
      setTtsState({
        loading: false,
        error: "",
        payload: null,
      });
      setPreviewState({
        loading: false,
        error: "",
        payload: null,
      });
      return;
    }

    if (initializedTaskIdRef.current === task.id) {
      return;
    }

    initializedTaskIdRef.current = task.id;

    const savedLanguage = task.sentenceExplanation?.tts?.metadata.language ?? DEFAULT_TTS_LANGUAGE;
    const savedVoice =
      task.sentenceExplanation?.tts?.metadata.voice ??
      getSentenceExplanationTtsLanguageOption(savedLanguage).defaultVoice;
    const savedModel = task.sentenceExplanation?.tts?.metadata.model ?? DEFAULT_TTS_MODEL;
    const savedSelection = resolveSentenceExplanationTtsSelection({
      language: savedLanguage,
      voice: savedVoice,
    });

    autoLoadTaskKeyRef.current = "";
    setLoadingProgress(0);
    setTtsLoadingProgress(0);
    setSelectedLanguage(savedSelection.languageOption.value);
    setSelectedAccent(savedSelection.accent);
    setSelectedGender(savedSelection.gender);
    setSelectedVoice(savedSelection.voice);
    setSelectedModel(savedModel);
    setRegeneratingBlockKey(null);
    setEditingBlocks({});
    setArticleEditedSinceTts(false);
    setState({
      loading: false,
      error: "",
      payload: sanitizeSentenceExplanationPayload(task.sentenceExplanation?.article ?? null),
    });
    setTtsState({
      loading: false,
      error: "",
      payload: task.sentenceExplanation?.tts ?? null,
    });
    setPreviewState({
      loading: false,
      error: "",
      payload: null,
    });
  }, [task?.id]);

  useEffect(() => {
    if (!task) {
      return;
    }

    setTtsState((current) => {
      if (current.loading) {
        return current;
      }

      const nextPayload = pickStableTtsPayload(current.payload, task.sentenceExplanation?.tts);
      if (isSameSnapshot(current.payload, nextPayload) && !current.error) {
        return current;
      }

      return {
        loading: false,
        error: "",
        payload: nextPayload,
      };
    });
  }, [task?.id, task?.sentenceExplanation?.tts]);

  useEffect(() => {
    if (
      voiceSelection.accent === selectedAccent &&
      voiceSelection.gender === selectedGender &&
      voiceSelection.voice === selectedVoice
    ) {
      return;
    }

    if (voiceSelection.accent !== selectedAccent) {
      setSelectedAccent(voiceSelection.accent);
    }

    if (voiceSelection.gender !== selectedGender) {
      setSelectedGender(voiceSelection.gender);
    }

    if (voiceSelection.voice !== selectedVoice) {
      setSelectedVoice(voiceSelection.voice);
    }
  }, [selectedAccent, selectedGender, selectedVoice, voiceSelection]);

  useEffect(() => {
    setPreviewState({
      loading: false,
      error: "",
      payload: null,
    });
  }, [selectedAccent, selectedGender, selectedLanguage, selectedVoice, selectedModel]);

  const loadExplanation = useCallback(async (options?: { branchIfExisting?: boolean }) => {
    if (!task || !explanationReady) {
      return;
    }

    let targetTask = task;
    const shouldBranch = Boolean(options?.branchIfExisting && task.sentenceExplanation?.article);
    if (shouldBranch) {
      const nextTask = await createSentenceExplanationRevisionTask(task, {
        resumeRoute: "explanation",
      });
      if (!nextTask) {
        return;
      }
      targetTask = nextTask;
    }

    setLoadingProgress(8);
    setTtsState({
      loading: false,
      error: "",
      payload: null,
    });
    setState((current) => ({ ...current, loading: true, error: "" }));

    try {
      const payload = sanitizeSentenceExplanationPayload(await generateSentenceExplanation(targetTask));
      const shouldCreateArticleHistoryTask = Boolean(
        !task.sentenceExplanation?.article && !task.sentenceExplanation?.tts && !task.sentenceExplanation?.video,
      );

      if (shouldCreateArticleHistoryTask) {
        const nextTask = await createSentenceExplanationArticleTask(task, payload);
        if (nextTask) {
          setLoadingProgress(100);
          setEditingBlocks({});
          setArticleEditedSinceTts(false);
          setState({
            loading: false,
            error: "",
            payload,
          });
          navigate(`/explanation/${nextTask.id}`, { replace: true });
          return;
        }
      }

      saveSentenceExplanationArticle(targetTask.id, payload);
      setLoadingProgress(100);
      setEditingBlocks({});
      setArticleEditedSinceTts(false);
      setState({
        loading: false,
        error: "",
        payload,
      });
      if (targetTask.id !== task.id) {
        navigate(`/explanation/${targetTask.id}`);
      }
    } catch (error) {
      setLoadingProgress(0);
      setState({
        loading: false,
        error: error instanceof Error ? error.message : "句子讲解生成失败，请稍后重试。",
        payload: null,
      });
    }
  }, [createSentenceExplanationArticleTask, createSentenceExplanationRevisionTask, explanationReady, navigate, task]);

  const setBlockEditing = useCallback((blockKey: string, editing: boolean) => {
    setEditingBlocks((current) => {
      if (editing) {
        if (current[blockKey]) {
          return current;
        }

        return {
          ...current,
          [blockKey]: true,
        };
      }

      if (!current[blockKey]) {
        return current;
      }

      const next = { ...current };
      delete next[blockKey];
      return next;
    });
  }, []);

  const applyEditedArticle = useCallback(
    (nextArticle: typeof article) => {
      if (!article || !nextArticle || nextArticle === article) {
        return;
      }

      setState((current) => {
        if (!current.payload) {
          return current;
        }

        return {
          ...current,
          payload: {
            ...current.payload,
            article: nextArticle,
          },
        };
      });
      setTtsState({
        loading: false,
        error: "",
        payload: null,
      });
      setArticleEditedSinceTts(true);
    },
    [article],
  );

  const handleArticleTextChange = useCallback(
    (field: "introduction" | "conclusion", value: string) => {
      if (!article) {
        return;
      }

      applyEditedArticle(updateSentenceExplanationArticleText(article, field, value));
    },
    [applyEditedArticle, article],
  );

  const handleSectionContentChange = useCallback(
    (moduleId: (typeof sentenceExplanationModuleOrder)[number], value: string) => {
      if (!article) {
        return;
      }

      applyEditedArticle(updateSentenceExplanationSectionContent(article, moduleId, value));
    },
    [applyEditedArticle, article],
  );

  const regenerateExplanationBlock = useCallback(
    async (target: SentenceExplanationRegenerationTarget) => {
      if (!task || !state.payload) {
        return;
      }

      const blockKey = getSentenceExplanationRegenerationTargetKey(target);
      setRegeneratingBlockKey(blockKey);
      setState((current) => ({
        ...current,
        error: "",
      }));

      try {
        const payload = sanitizeSentenceExplanationPayload(await generateSentenceExplanation(task, {
          currentArticle: state.payload.article,
          regenerationTarget: target,
        }));

        setState({
          loading: false,
          error: "",
          payload,
        });
        setTtsState({
          loading: false,
          error: "",
          payload: null,
        });
        setArticleEditedSinceTts(true);
        setEditingBlocks((current) => {
          const next = { ...current };
          delete next[blockKey];
          return next;
        });
      } catch (error) {
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : "局部讲解重新生成失败，请稍后重试。",
        }));
      } finally {
        setRegeneratingBlockKey(null);
      }
    },
    [state.payload, task],
  );

  const loadTts = async () => {
    if (ttsRequestInFlightRef.current || ttsState.loading || !task || !article || !state.payload) {
      return;
    }

    ttsRequestInFlightRef.current = true;
    setTtsLoadingProgress(8);

    try {
      const articleChanged = !isSameSnapshot(state.payload, task.sentenceExplanation?.article ?? null);
      const shouldBranch = Boolean(task.sentenceExplanation?.tts || task.sentenceExplanation?.video || articleChanged);
      let targetTask = task;

      if (shouldBranch) {
        const nextTask = await createSentenceExplanationRevisionTask(task, {
          article: state.payload,
          stage: "article",
          resumeRoute: "explanation",
        });
        if (!nextTask) {
          ttsRequestInFlightRef.current = false;
          return;
        }
        targetTask = nextTask;
      }

      setTtsState((current) => ({
        loading: true,
        error: "",
        payload: current.payload,
      }));

      const payload = await generateSentenceExplanationTts(targetTask, article, {
        language: selectedLanguage,
        voice: voiceSelection.voice,
        model: selectedModel,
      });
      saveSentenceExplanationTts(targetTask.id, state.payload, payload);
      setTtsLoadingProgress(100);
      setTtsState({
        loading: false,
        error: "",
        payload,
      });
      setArticleEditedSinceTts(false);
      if (targetTask.id !== task.id) {
        navigate(`/explanation/${targetTask.id}`);
      }
    } catch (error) {
      setTtsLoadingProgress(0);
      setTtsState({
        loading: false,
        error: error instanceof Error ? error.message : "文本转语音失败，请稍后重试。",
        payload: null,
      });
    } finally {
      ttsRequestInFlightRef.current = false;
    }
  };

  const loadPreview = async () => {
    setPreviewState({
      loading: true,
      error: "",
      payload: null,
    });

    try {
      const payload = await previewSentenceExplanationTtsVoice({
        language: selectedLanguage,
        voice: voiceSelection.voice,
        model: selectedModel,
      });
      setPreviewState({
        loading: false,
        error: "",
        payload,
      });
    } catch (error) {
      setPreviewState({
        loading: false,
        error: error instanceof Error ? error.message : "语音试听失败，请稍后重试。",
        payload: null,
      });
    }
  };

  useEffect(() => {
    if (!task || !explanationReady || taskHasSavedExplanation || state.payload || state.loading || state.error) {
      return;
    }

    const autoLoadKey = `${task.id}:${task.updatedAt}`;
    if (autoLoadTaskKeyRef.current === autoLoadKey) {
      return;
    }

    autoLoadTaskKeyRef.current = autoLoadKey;
    void loadExplanation({ branchIfExisting: false });
  }, [explanationReady, loadExplanation, state.error, state.loading, state.payload, task, taskHasSavedExplanation]);

  useEffect(() => {
    if (!state.loading) {
      if (!state.payload) {
        setLoadingProgress(0);
      }
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const nextProgress = estimateLoadingProgress(Date.now() - startedAt);
      setLoadingProgress((current) => (current >= nextProgress ? current : nextProgress));
    }, 240);

    return () => {
      window.clearInterval(timer);
    };
  }, [state.loading, state.payload]);

  useEffect(() => {
    if (!ttsState.loading) {
      if (!ttsState.payload) {
        setTtsLoadingProgress(0);
      }
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const estimatedDurationMs = Math.max(48_000, Math.min(240_000, 18_000 + ttsSegmentCount * 1_800));
      const elapsedMs = Date.now() - startedAt;
      const ratio = elapsedMs / (estimatedDurationMs * 0.85);
      const nextProgress =
        ratio < 1
          ? Math.min(90, estimateTtsLoadingProgress(Math.round(ratio * 48_000)))
          : Math.min(99, Math.max(90, Math.round(90 + 9 * (1 - Math.exp(-(elapsedMs - estimatedDurationMs * 0.85) / 45_000)))));
      setTtsLoadingProgress((current) => (current >= nextProgress ? current : nextProgress));
    }, 240);

    return () => {
      window.clearInterval(timer);
    };
  }, [ttsSegmentCount, ttsState.loading, ttsState.payload]);

  const isEditingIntroduction = Boolean(editingBlocks.introduction);
  const isEditingConclusion = Boolean(editingBlocks.conclusion);
  const ttsSectionsByModule = useMemo(
    () => new Map((ttsState.payload?.sections ?? []).map((section) => [section.moduleId, section])),
    [ttsState.payload?.sections],
  );
  const generatedVoiceOption = useMemo(
    () =>
      ttsState.payload
        ? getSentenceExplanationTtsVoiceOption(ttsState.payload.metadata.voice)
        : null,
    [ttsState.payload],
  );
  const videoPlanState = useMemo(() => {
    if (!task || !article || !ttsState.payload) {
      return {
        plan: null,
        error: "",
      };
    }

    try {
      return {
        plan: createSentenceExplanationVideoPlan(task, article, ttsState.payload),
        error: "",
      };
    } catch (error) {
      return {
        plan: null,
        error: error instanceof Error ? error.message : "视频生成素材尚未准备完成。",
      };
    }
  }, [article, task, ttsState.payload]);

  const handleOpenVideoPage = async () => {
    if (!task || !state.payload || !ttsState.payload || !videoPlanState.plan) {
      return;
    }

    const articleChanged = !isSameSnapshot(state.payload, task.sentenceExplanation?.article ?? null);
    const ttsChanged = !isSameSnapshot(ttsState.payload, task.sentenceExplanation?.tts ?? null);

    if (task.sentenceExplanation?.video || articleChanged || ttsChanged) {
      const nextTask = await createSentenceExplanationRevisionTask(task, {
        article: state.payload,
        tts: ttsState.payload,
        stage: "tts",
      });
      if (!nextTask) {
        return;
      }
      navigate(`/explanation/${nextTask.id}/video`);
      return;
    }

    saveSentenceExplanationTts(task.id, state.payload, ttsState.payload);
    navigate(`/explanation/${task.id}/video`);
  };

  const handleSaveExplanation = async () => {
    if (!task || !state.payload || !hasArticleDraftChanges) {
      return;
    }

    if (task.sentenceExplanation?.article) {
      const nextTask = await createSentenceExplanationRevisionTask(task, {
        article: state.payload,
        stage: "article",
        resumeRoute: "explanation",
      });
      if (!nextTask) {
        return;
      }
      navigate(`/explanation/${nextTask.id}`);
      return;
    }

    saveSentenceExplanationArticle(task.id, state.payload);
  };

  if (!task) {
    return (
      <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
        <div className="container max-w-3xl py-16">
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-elegant">
            <h1 className="font-display text-2xl font-semibold">未找到对应任务</h1>
            <p className="mt-3 text-sm text-muted-foreground">请先从任务详情页进入句子讲解。</p>
            <Button asChild className="mt-6">
              <Link to="/">返回首页</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!explanationReady) {
    return (
      <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
        <div className="container max-w-3xl py-16">
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-elegant">
            <h1 className="font-display text-2xl font-semibold">句子讲解暂不可用</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              需要五张解析图全部生成完成后，才能生成按图讲解的文章。
            </p>
            <Button asChild className="mt-6">
              <Link to={`/task/${task.id}`}>返回任务详情</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
      <div className="container max-w-6xl py-10">
        <Link
          to={`/result/${task.id}`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          回退到图片结果
        </Link>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="rounded-3xl border border-border bg-card/95 p-6 shadow-elegant">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                  <BookOpen className="h-3.5 w-3.5" />
                  句子讲解
                </div>
                <h1 className="mt-4 font-display text-3xl font-bold text-foreground">
                  {article?.title || "正在生成句子讲解文章"}
                </h1>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{task.sentence}</p>
                <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>{task.bookName}</span>
                  <span>{task.author}</span>
                  {state.payload ? <span>生成来源：{formatSourceLabel(state.payload.source)}</span> : null}
                  {state.payload ? <span>模型：{state.payload.model}</span> : null}
                  {ttsState.payload ? (
                    <span>语言：{getSentenceExplanationTtsLanguageOption(ttsState.payload.metadata.language).label}</span>
                  ) : null}
                  {ttsState.payload ? (
                    <span>语音：{generatedVoiceOption?.label ?? sentenceExplanationTtsVoiceLabels[ttsState.payload.metadata.voice]}</span>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/result/${task.id}`}>回退到图片结果</Link>
                  </Button>
                  {task.sentenceExplanation?.video ? (
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/explanation/${task.id}/video`}>前往讲解视频</Link>
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                  <Button
                    className="order-4"
                    variant="outline"
                    onClick={() => void handleSaveExplanation()}
                    disabled={state.loading || ttsState.loading || Boolean(regeneratingBlockKey) || !hasArticleDraftChanges}
                  >
                    <Save className="h-4 w-4" />
                    保存讲解
                </Button>
                  <Button
                    className="order-3"
                    variant="gold"
                    onClick={handleOpenVideoPage}
                    disabled={state.loading || ttsState.loading || Boolean(regeneratingBlockKey) || !videoPlanState.plan}
                  >
                    <Video className="h-4 w-4" />
                    生成视频
                </Button>
                  <Button
                    className="order-2"
                    variant="outline"
                    onClick={() => void loadTts()}
                    disabled={state.loading || ttsState.loading || Boolean(regeneratingBlockKey) || !article}
                  >
                    {ttsState.loading ? <LoadingDots /> : <Volume2 className="h-4 w-4" />}
                    文本转语音
                </Button>
                  <Button
                    className="order-1"
                    variant="outline"
                    onClick={() => void loadExplanation({ branchIfExisting: true })}
                    disabled={state.loading || ttsState.loading || Boolean(regeneratingBlockKey)}
                  >
                    {state.loading ? <LoadingDots /> : <RefreshCw className="h-4 w-4" />}
                    重新生成讲解
                </Button>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-secondary/10 p-4">
              <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_1fr_1.2fr_auto]">
                <div className="space-y-2">
                  <Label htmlFor="tts-model" className="text-sm font-medium text-foreground">
                    语音模型
                  </Label>
                  <Select
                    value={selectedModel}
                    onValueChange={(value) => setSelectedModel(value as SentenceExplanationTtsModel)}
                    disabled={state.loading || ttsState.loading || previewState.loading || Boolean(regeneratingBlockKey)}
                  >
                    <SelectTrigger id="tts-model">
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {sentenceExplanationTtsModelOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">选择 MiniMax 语音合成模型版本。</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tts-language" className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                    <Languages className="h-4 w-4 text-accent" />
                    语言
                  </Label>
                    <Select
                      value={selectedLanguage}
                      onValueChange={(value) => setSelectedLanguage(value as SentenceExplanationTtsLanguage)}
                      disabled={state.loading || ttsState.loading || previewState.loading || Boolean(regeneratingBlockKey)}
                    >
                    <SelectTrigger id="tts-language">
                      <SelectValue placeholder="选择语言" />
                    </SelectTrigger>
                    <SelectContent>
                      {sentenceExplanationTtsLanguageOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label} · {option.nativeLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">试听文案会自动切换成当前语言版本的课堂欢迎语。</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tts-accent" className="text-sm font-medium text-foreground">
                    口音
                  </Label>
                  <Select
                    value={selectedAccent}
                    onValueChange={setSelectedAccent}
                    disabled={state.loading || ttsState.loading || previewState.loading || Boolean(regeneratingBlockKey)}
                  >
                    <SelectTrigger id="tts-accent">
                      <SelectValue placeholder="选择口音" />
                    </SelectTrigger>
                    <SelectContent>
                      {accentOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">先选语言，再按该语言可用的口音筛选 MiniMax 系统音色。</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tts-gender" className="text-sm font-medium text-foreground">
                    声线性别
                  </Label>
                  <Select
                    value={selectedGender}
                    onValueChange={(value) => setSelectedGender(value as SentenceExplanationTtsVoiceGender)}
                    disabled={state.loading || ttsState.loading || previewState.loading || Boolean(regeneratingBlockKey)}
                  >
                    <SelectTrigger id="tts-gender">
                      <SelectValue placeholder="选择男声或女声" />
                    </SelectTrigger>
                    <SelectContent>
                      {genderOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">支持按男声、女声继续缩小到对应的系统音色库。</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tts-voice" className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                    <Headphones className="h-4 w-4 text-accent" />
                    具体音色
                  </Label>
                  <Select
                    value={selectedVoice}
                    onValueChange={(value) => setSelectedVoice(value as SentenceExplanationTtsVoice)}
                    disabled={state.loading || ttsState.loading || previewState.loading || Boolean(regeneratingBlockKey)}
                  >
                    <SelectTrigger id="tts-voice">
                      <SelectValue placeholder="选择音色" />
                    </SelectTrigger>
                    <SelectContent>
                      {voiceOptions.map((voiceOption) => (
                        <SelectItem key={voiceOption.value} value={voiceOption.value}>
                          {voiceOption.label}
                          {voiceOption.value === selectedLanguageOption.defaultVoice ? " · 默认推荐" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    当前筛出 {voiceOptions.length} 个可用音色。正文与试听都会使用当前这套模型、语言、口音、性别和音色组合。
                  </p>
                </div>

                <div className="flex flex-col justify-end">
                  <Button
                    variant="outline"
                    onClick={() => void loadPreview()}
                    disabled={state.loading || ttsState.loading || previewState.loading || Boolean(regeneratingBlockKey)}
                  >
                    {previewState.loading ? <LoadingDots /> : <PlayCircle className="h-4 w-4" />}
                    试听播放
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-border/60 bg-background/80 p-4">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>试听语言：{selectedLanguageOption.label}</span>
                  <span>口音：{selectedVoiceOption.accentLabel}</span>
                  <span>声线：{sentenceExplanationTtsGenderLabels[selectedVoiceOption.gender]}</span>
                  <span>当前音色：{selectedVoiceOption.label}</span>
                  <span>MiniMax speech-2.8-hd</span>
                </div>
                <p className="mt-3 text-sm leading-7 text-foreground">
                  {previewState.payload?.text || selectedLanguageOption.previewText}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{selectedVoiceOption.description}</p>
                {previewState.error ? (
                  <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {previewState.error}
                  </div>
                ) : null}
                {previewState.payload?.audioDataUrl ? (
                  <audio controls preload="none" className="mt-3 w-full" src={previewState.payload.audioDataUrl} />
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    可以先试听欢迎语，再点击“文本转语音”为整篇讲解文章逐段生成语音。
                  </p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  试听与正文音频都由 MiniMax 文本转语音生成。试听只用来感受当前音色，正文会朗读当前页面上的讲解文章本身。
                </p>
              </div>
            </div>

            {articleEditedSinceTts ? (
              <div className="mt-6 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-4 text-sm text-foreground">
                <p className="font-medium">讲解内容已更新</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  你刚刚手动修改了文章正文。下一次点击“文本转语音”时，会基于当前页面上的整篇讲解重新调用
                  `sentence-explanation-tts` skill。
                </p>
              </div>
            ) : null}

            {state.loading ? (
              <div className="mt-6 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-4 text-sm text-foreground">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <LoadingDots />
                    <span>{formatLoadingStage(loadingProgress)}</span>
                  </div>
                  <span className="text-xs font-semibold text-accent">{loadingProgress}%</span>
                </div>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-accent/10">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    animate={{ width: `${loadingProgress}%` }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  大模型正在结合五张解析图和文本解析，按顺序生成句子讲解文章。
                </p>
              </div>
            ) : null}
            {ttsState.loading ? (
              <div className="mt-6 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-4 text-sm text-foreground">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <LoadingDots />
                    <span>{formatTtsLoadingStage(ttsLoadingProgress, ttsSegmentCount)}</span>
                  </div>
                  <span className="text-xs font-semibold text-accent">{ttsLoadingProgress}%</span>
                </div>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-accent/10">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    animate={{ width: `${ttsLoadingProgress}%` }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {formatTtsLoadingHint(ttsSegmentCount)}
                </p>
              </div>
            ) : null}

            {state.error ? (
              <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {state.error}
              </div>
            ) : null}

            {ttsState.error ? (
              <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {ttsState.error}
              </div>
            ) : null}

            {ttsState.payload ? (
              <div className="mt-6 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-4 text-sm text-foreground">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">语音已生成</span>
                  <span className="text-xs text-muted-foreground">
                    成功 {ttsState.payload.metadata.successfulSegments}/{ttsState.payload.metadata.totalSegments}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    language: {getSentenceExplanationTtsLanguageOption(ttsState.payload.metadata.language).label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    voice: {generatedVoiceOption?.label ?? sentenceExplanationTtsVoiceLabels[ttsState.payload.metadata.voice]}
                  </span>
                  {generatedVoiceOption ? (
                    <span className="text-xs text-muted-foreground">accent: {generatedVoiceOption.accentLabel}</span>
                  ) : null}
                  {generatedVoiceOption ? (
                    <span className="text-xs text-muted-foreground">
                      gender: {sentenceExplanationTtsGenderLabels[generatedVoiceOption.gender]}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">model: {ttsState.payload.model}</span>
                </div>
                {videoPlanState.plan ? null : videoPlanState.error ? (
                  <p className="mt-3 text-xs text-muted-foreground">{videoPlanState.error}</p>
                ) : null}
              </div>
            ) : null}

            {article ? (
              <div className="mt-8 space-y-6">
                <section className="rounded-3xl border border-border bg-secondary/10 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-accent">{article.welcomeMessage}</p>
                      <p className="mt-2 text-xs text-muted-foreground">这里的开场讲解会直接参与整篇 TTS 生成。</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void regenerateExplanationBlock({ type: "introduction" })}
                        disabled={state.loading || ttsState.loading || Boolean(regeneratingBlockKey)}
                      >
                        {regeneratingBlockKey === "introduction" ? <LoadingDots /> : <RefreshCw className="h-4 w-4" />}
                        重新生成讲解
                      </Button>
                      <Button
                        variant={isEditingIntroduction ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => setBlockEditing("introduction", !isEditingIntroduction)}
                        disabled={state.loading || ttsState.loading || Boolean(regeneratingBlockKey)}
                      >
                        {isEditingIntroduction ? <Check className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}
                        {isEditingIntroduction ? "完成编辑" : "编辑讲解"}
                      </Button>
                    </div>
                  </div>
                  {isEditingIntroduction ? (
                    <div className="mt-4 space-y-2">
                      <Label htmlFor="sentence-explanation-introduction">开场讲解正文</Label>
                      <Textarea
                        id="sentence-explanation-introduction"
                        value={article.introduction}
                        onChange={(event) => handleArticleTextChange("introduction", event.target.value)}
                        rows={6}
                        disabled={state.loading || ttsState.loading || Boolean(regeneratingBlockKey)}
                        className="leading-7"
                      />
                    </div>
                  ) : (
                    <p className="mt-4 whitespace-pre-line text-base leading-8 text-foreground">{article.introduction}</p>
                  )}
                  {ttsState.payload ? (
                    <div className="mt-5 rounded-2xl border border-accent/20 bg-background/70 p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Audio</p>
                      {renderAudioContent(ttsState.payload.introduction, "开场语音生成失败，可以重新点击“文本转语音”。")}
                    </div>
                  ) : null}
                </section>

                {article.sections.map((section, index) => {
                  const image = task.generatedImages?.[section.imageRef];
                  const imageSource = getGeneratedImageSource(image);
                  const sectionTts = ttsSectionsByModule.get(section.moduleId);
                  const sectionEditorKey = getSectionEditorKey(section.moduleId);
                  const isEditingSection = Boolean(editingBlocks[sectionEditorKey]);

                  return (
                    <section
                      key={`${section.moduleId}-${index}`}
                      className="grid gap-5 rounded-3xl border border-border bg-background/80 p-5 shadow-sm lg:grid-cols-[1.05fr_0.95fr]"
                    >
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                              {index + 1}
                            </span>
                            <div>
                              <h2 className="font-display text-2xl font-semibold text-foreground">
                                {section.moduleName || sentenceExplanationModuleLabels[section.moduleId]}
                              </h2>
                              <p className="text-xs text-muted-foreground">{section.moduleId}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void regenerateExplanationBlock({ type: "section", moduleId: section.moduleId })}
                              disabled={state.loading || ttsState.loading || Boolean(regeneratingBlockKey)}
                            >
                              {regeneratingBlockKey === sectionEditorKey ? <LoadingDots /> : <RefreshCw className="h-4 w-4" />}
                              重新生成讲解
                            </Button>
                            <Button
                              variant={isEditingSection ? "secondary" : "outline"}
                              size="sm"
                              onClick={() => setBlockEditing(sectionEditorKey, !isEditingSection)}
                              disabled={state.loading || ttsState.loading || Boolean(regeneratingBlockKey)}
                            >
                              {isEditingSection ? <Check className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}
                              {isEditingSection ? "完成编辑" : "编辑讲解"}
                            </Button>
                          </div>
                        </div>
                        {isEditingSection ? (
                          <div className="space-y-2">
                            <Label htmlFor={`sentence-explanation-section-${section.moduleId}`}>模块讲解正文</Label>
                            <Textarea
                              id={`sentence-explanation-section-${section.moduleId}`}
                              value={section.content}
                              onChange={(event) => handleSectionContentChange(section.moduleId, event.target.value)}
                              rows={8}
                              disabled={state.loading || ttsState.loading || Boolean(regeneratingBlockKey)}
                              className="leading-7"
                            />
                          </div>
                        ) : (
                          <p className="whitespace-pre-line text-base leading-8 text-foreground">{section.content}</p>
                        )}
                        {ttsState.payload ? (
                          <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Audio</p>
                            {sectionTts
                              ? renderAudioContent(sectionTts.content, "这一段语音暂未生成成功，可以重新点击“文本转语音”。")
                              : (
                                <p className="mt-3 text-sm text-muted-foreground">
                                  这一段语音暂未生成成功，可以重新点击“文本转语音”。
                                </p>
                              )}
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-2xl border border-border bg-secondary/20 p-3">
                        {imageSource ? (
                          <img
                            src={imageSource}
                            alt={section.moduleName || sentenceExplanationModuleLabels[section.moduleId]}
                            className="aspect-[3/4] w-full rounded-xl object-cover"
                          />
                        ) : (
                          <div className="flex aspect-[3/4] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                            对应图片暂不可用
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}

                <section className="rounded-3xl border border-border bg-accent/5 p-6">
                  <h2 className="font-display text-xl font-semibold text-foreground">课后总结</h2>
                  <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                    <p className="text-xs text-muted-foreground">总结内容也会进入最终的整篇文本转语音。</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void regenerateExplanationBlock({ type: "conclusion" })}
                        disabled={state.loading || ttsState.loading || Boolean(regeneratingBlockKey)}
                      >
                        {regeneratingBlockKey === "conclusion" ? <LoadingDots /> : <RefreshCw className="h-4 w-4" />}
                        重新生成讲解
                      </Button>
                      <Button
                        variant={isEditingConclusion ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => setBlockEditing("conclusion", !isEditingConclusion)}
                        disabled={state.loading || ttsState.loading || Boolean(regeneratingBlockKey)}
                      >
                        {isEditingConclusion ? <Check className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}
                        {isEditingConclusion ? "完成编辑" : "编辑讲解"}
                      </Button>
                    </div>
                  </div>
                  {isEditingConclusion ? (
                    <div className="mt-4 space-y-2">
                      <Label htmlFor="sentence-explanation-conclusion">课后总结正文</Label>
                      <Textarea
                        id="sentence-explanation-conclusion"
                        value={article.conclusion}
                        onChange={(event) => handleArticleTextChange("conclusion", event.target.value)}
                        rows={6}
                        disabled={state.loading || ttsState.loading || Boolean(regeneratingBlockKey)}
                        className="leading-7"
                      />
                    </div>
                  ) : (
                    <p className="mt-4 whitespace-pre-line text-base leading-8 text-foreground">{article.conclusion}</p>
                  )}
                  {ttsState.payload ? (
                    <div className="mt-5 rounded-2xl border border-accent/20 bg-background/70 p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Audio</p>
                      {renderAudioContent(ttsState.payload.conclusion, "总结语音生成失败，可以重新点击“文本转语音”。")}
                    </div>
                  ) : null}
                  <p className="mt-4 text-xs text-muted-foreground">文章总字数：{article.totalWordCount}</p>
                </section>
              </div>
            ) : null}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
