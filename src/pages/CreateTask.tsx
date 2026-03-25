import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Camera, CheckSquare, FileImage, ImagePlus, Loader2, Sparkles, Wand2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { analyzeSentenceText } from "@/lib/text-analysis-client";
import {
  createParsedTask,
  exampleSentence,
  fileToReferenceAssetOptimized,
  getRequiredTextAnalysisModes,
  loadModulePrefs,
  loadReferenceLibrary,
  loadReferenceLibraryWithData,
  moduleMetaList,
  referenceSlotList,
  saveModulePrefs,
  saveReferenceLibrary,
  type ModuleId,
  type ReferenceAsset,
  type TaskInput,
  validateReferenceFile,
} from "@/lib/task-store";

const moduleIds = moduleMetaList.map((module) => module.id);

async function analyzeSelectedModuleContent(payload: Pick<TaskInput, "sentence" | "bookName" | "author" | "modules">) {
  const modes = getRequiredTextAnalysisModes(payload.modules);
  const orderedModes = modes.length ? modes : ["all"];
  let latestAnalysis: Awaited<ReturnType<typeof analyzeSentenceText>> | null = null;

  for (const mode of orderedModes) {
    latestAnalysis = await analyzeSentenceText({
      sentence: payload.sentence,
      bookName: payload.bookName,
      author: payload.author,
      mode,
      currentTextContent: latestAnalysis?.textContent,
    });
  }

  if (!latestAnalysis) {
    throw new Error("未能生成所选模块对应的文本解析内容。");
  }

  return latestAnalysis;
}

function deepCopyReferences(referenceImages: Record<ModuleId, ReferenceAsset | null>) {
  return {
    translation: referenceImages.translation,
    grammar: referenceImages.grammar,
    summary: referenceImages.summary,
    vocabulary: referenceImages.vocabulary,
    ielts: referenceImages.ielts,
  };
}

export default function CreateTaskPage() {
  const navigate = useNavigate();
  const [sentence, setSentence] = useState("");
  const [bookName, setBookName] = useState("");
  const [author, setAuthor] = useState("");
  const [modules, setModules] = useState<ModuleId[]>(() => loadModulePrefs());
  const [referenceImages, setReferenceImages] = useState<Record<ModuleId, ReferenceAsset | null>>(() => loadReferenceLibrary());
  const [error, setError] = useState("");
  const [uploadingSlot, setUploadingSlot] = useState<ModuleId | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydrateReferences = async () => {
      const hydrated = await loadReferenceLibraryWithData();
      if (!cancelled) {
        setReferenceImages((current) => {
          const hasFreshPreview = Object.values(current).some((asset) => Boolean(asset?.dataUrl));
          return hasFreshPreview ? current : hydrated;
        });
      }
    };

    void hydrateReferences();
    return () => {
      cancelled = true;
    };
  }, []);

  const sentenceLength = sentence.trim().length;
  const canSubmit = sentence.trim() && bookName.trim() && author.trim() && modules.length > 0;

  const handleSentenceChange = (value: string) => {
    setSentence(value);
  };

  const toggleModule = (moduleId: ModuleId) => {
    setModules((current) => {
      const next = current.includes(moduleId) ? current.filter((item) => item !== moduleId) : [...current, moduleId];
      saveModulePrefs(next);
      return next;
    });
  };

  const applyModules = (nextModules: ModuleId[]) => {
    setModules(nextModules);
    saveModulePrefs(nextModules);
  };

  const createInputPayload = (): TaskInput => ({
    sentence: sentence.trim(),
    bookName: bookName.trim(),
    author: author.trim(),
    modules,
    referenceImages: deepCopyReferences(referenceImages),
  });

  const ensureValid = () => {
    if (!sentence.trim() || !bookName.trim() || !author.trim()) {
      setError("请先完整填写英语原句、书名和作者。");
      return false;
    }
    if (!modules.length) {
      setError("至少勾选 1 个要生成的模块。");
      return false;
    }
    setError("");
    return true;
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>, moduleId: ModuleId) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const message = validateReferenceFile(file);
    if (message) {
      setError(message);
      return;
    }

    setUploadingSlot(moduleId);
    try {
      let asset = await fileToReferenceAssetOptimized(file, moduleId);

      // 上传到 Supabase
      const { saveImage, isSupabaseConfigured } = await import("@/lib/image-store");
      if (isSupabaseConfigured()) {
        const uploadResult = await saveImage("reference", asset.id, asset.fileName, asset.dataUrl);
        if (uploadResult.success && uploadResult.url) {
          asset = { ...asset, publicUrl: uploadResult.url };
        }
        if (uploadResult.success && !uploadResult.localOnly) {
          console.log(`参考图片 ${asset.fileName} 已上传到云端`);
        } else if (uploadResult.localOnly) {
          console.log(`参考图片 ${asset.fileName} 仅保存到本地`);
        } else {
          console.error(`参考图片 ${asset.fileName} 上传失败:`, uploadResult.error);
        }
      }

      const nextImages = { ...referenceImages, [moduleId]: asset };
      setReferenceImages(nextImages);
      saveReferenceLibrary(nextImages);
      setError("");
    } catch (error) {
      console.error("图片上传失败:", error);
      setError("图片上传失败，请重试。");
    } finally {
      setUploadingSlot(null);
    }
  };

  const removeImage = (moduleId: ModuleId) => {
    const nextImages = { ...referenceImages, [moduleId]: null };
    setReferenceImages(nextImages);
    saveReferenceLibrary(nextImages);
  };

  const handleParse = async () => {
    if (!ensureValid()) return;

    setIsParsing(true);
    try {
      const payload = createInputPayload();
      const task = await createParsedTask(payload);
      navigate(`/edit/${task.id}`);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "文本解析失败，请稍后重试。");
    } finally {
      setIsParsing(false);
    }
  };

  const fillExample = () => {
    setSentence(exampleSentence.sentence);
    setBookName(exampleSentence.bookName);
    setAuthor(exampleSentence.author);
    applyModules([...moduleIds]);
    setError("");
  };

  return (
    <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
      <div className="container max-w-6xl py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]"
        >
          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-5 w-5 text-accent" />
                  <div>
                    <h2 className="font-display text-xl font-semibold">输入内容</h2>
                    <p className="text-sm text-muted-foreground">支持长文本输入，自动去除首尾空白。</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={fillExample}>
                  <Sparkles className="h-4 w-4" />
                  填充示例句子
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label htmlFor="sentence">英语原句</Label>
                    <span className="text-xs font-medium text-muted-foreground">已输入 {sentenceLength} 个字符</span>
                  </div>
                  <Textarea
                    id="sentence"
                    value={sentence}
                    onChange={(event) => handleSentenceChange(event.target.value)}
                    placeholder="粘贴一条英语长难句，系统会自动拆句、翻译、句式分析和词汇解析。"
                    className="min-h-[160px] resize-none text-base"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="book">原著书名</Label>
                    <Input
                      id="book"
                      value={bookName}
                      onChange={(event) => setBookName(event.target.value)}
                      placeholder='例如 "The Great Gatsby"'
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="author">原著作者</Label>
                    <Input
                      id="author"
                      value={author}
                      onChange={(event) => setAuthor(event.target.value)}
                      placeholder='例如 "F. Scott Fitzgerald"'
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
              <div className="mb-5 flex items-center gap-3">
                <Camera className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-xl font-semibold">参考图片上传</h2>
                  <p className="text-sm text-muted-foreground">每个模块对应 1 张参考图，刷新页面后仍会保留。</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {referenceSlotList.map((slot) => {
                  const asset = referenceImages[slot.id];
                  const busy = uploadingSlot === slot.id;
                  return (
                    <div key={slot.id} className="rounded-2xl border border-border bg-secondary/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-foreground">{slot.title}</div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">{slot.helper}</div>
                        </div>
                        {asset ? (
                          <button
                            type="button"
                            onClick={() => removeImage(slot.id)}
                            className="rounded-full border border-border p-1 text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-4 rounded-2xl border border-dashed border-border bg-background p-3">
                        {asset ? (
                          <div className="space-y-3">
                            <img src={asset.dataUrl} alt={slot.title} className="h-36 w-full rounded-xl object-cover" />
                            <div className="text-xs text-muted-foreground">
                              <div className="truncate font-medium text-foreground">{asset.fileName}</div>
                              <div>{(asset.fileSize / 1024 / 1024).toFixed(2)} MB · 已保存</div>
                            </div>
                          </div>
                        ) : (
                          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl py-8 text-center transition-colors hover:bg-secondary/60">
                            <ImagePlus className="mb-3 h-8 w-8 text-muted-foreground" />
                            <div className="text-sm font-medium">{busy ? "上传中..." : "上传参考图"}</div>
                            <div className="mt-1 text-xs text-muted-foreground">JPG / PNG / WEBP，最大 5MB</div>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(event) => void handleUpload(event, slot.id)}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
              <div className="mb-5 flex items-center gap-3">
                <CheckSquare className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-xl font-semibold">生成模块</h2>
                  <p className="text-sm text-muted-foreground">至少选择 1 个模块，未勾选模块不会进入图片生成阶段。</p>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-3">
                <Button variant="outline" size="sm" onClick={() => applyModules([...moduleIds])}>
                  全选
                </Button>
                <Button variant="outline" size="sm" onClick={() => applyModules([])}>
                  取消全选
                </Button>
              </div>

              <div className="space-y-3">
                {moduleMetaList.map((module) => {
                  const checked = modules.includes(module.id);
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
                          {module.title} <span className="text-xs text-muted-foreground">· {module.panels}</span>
                        </div>
                        <div className="mt-1 text-sm leading-6 text-muted-foreground">{module.description}</div>
                        <div className="mt-2 text-xs text-muted-foreground">依赖：{module.dependsOn}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
              <div className="mb-5 flex items-center gap-3">
                <Wand2 className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-xl font-semibold">开始解析</h2>
                  <p className="text-sm text-muted-foreground">文本解析完成后会进入编辑页，确认内容后再继续后续生成流程。</p>
                </div>
              </div>

              {error ? <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div> : null}
              {isParsing ? (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>正在调用 LLM 生成文本解析...</span>
                </div>
              ) : null}

              <div>
                <Button variant="hero" size="lg" className="w-full justify-between" onClick={() => void handleParse()} disabled={!canSubmit || isParsing}>
                  <span>文本解析</span>
                  <span className="text-xs opacity-80">进入文本编辑页</span>
                </Button>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
              <div className="mb-4 flex items-center gap-3">
                <FileImage className="h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-xl font-semibold">流程提示</h2>
                  <p className="text-sm text-muted-foreground">
                    这个 Agent 的目标，是把 1 条英语长难句沉淀成可复用的教学资产：文本解析、模块化条漫、句子讲解文章、配音和视频，并让每一步都可追溯、可重生成。
                  </p>
                </div>
              </div>
              <div className="space-y-3 text-sm leading-6 text-muted-foreground">
                <p>1. 首页录入：填写英语原句、书名作者，上传 5 张模块参考图，勾选要产出的模块后发起文本解析。</p>
                <p>2. 文本编辑：系统先生成翻译、分句 prompt1-4、句式分析、词汇解析和雅思建议；你可以逐段修改、保存草稿，或按单个模块 / 全部重新生成。</p>
                <p>3. 图片生成：确认文本版本后进入任务详情页，系统按所选模块顺序生成条漫图片，实时记录日志、进度和每个模块的结果状态。</p>
                <p>4. 结果延展：结果页支持查看源文本、下载或基于改写内容重新生成图片；当五张解析图齐全后，还能继续生成句子讲解文章、讲解配音和讲解视频。</p>
                <p>5. 历史追溯：每次确认生成、重生成或讲解产出都会形成历史记录，可从历史记录直接回到当时的最终页面继续查看或发起新一轮生成。</p>
              </div>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
