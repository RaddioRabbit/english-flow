import { motion } from "framer-motion";
import { BookCopy, BookOpen, CheckSquare, Database, FileImage, Headphones, History, Layers3, Sparkles, Video } from "lucide-react";

import { moduleMetaList, type ModuleId } from "@/lib/task-store";

const moduleFocusMap: Record<ModuleId, { focus: string; output: string }> = {
  translation: {
    focus: "把长句拆成 prompt1-4，并组织成适合教学展示的中英对照结构。",
    output: "适合做句子拆解、逐段翻译和课堂讲解入口图。",
  },
  grammar: {
    focus: "把时态、语态和句子骨架拆开，让学习者看清结构关系。",
    output: "适合讲句法、主干提取和难点定位。",
  },
  summary: {
    focus: "把复杂句压缩成可复述的结构结论，突出真正该记住的核心模式。",
    output: "适合做复盘页、总结页和课后回顾图。",
  },
  vocabulary: {
    focus: "围绕核心词汇做语义、搭配和例句解释，形成可视化词汇卡片。",
    output: "适合做词汇精讲、重点词回顾和二次传播内容。",
  },
  ielts: {
    focus: "把这条句子的表达方式转译成听说读写四个方向的备考建议。",
    output: "适合直接用于雅思教学内容、课堂延展和备考提示图。",
  },
};

const workflowBlocks = [
  {
    icon: BookOpen,
    title: "01 首页录入",
    description: "输入英语原句、书名、作者，上传 5 张参考图，并勾选本次要产出的模块。",
    points: [
      "每个模块都能单独控制是否参与图片生成。",
      "每张参考图都只服务对应模块，用来控制风格、版式和画面方向。",
      "入口先做文本解析，不直接跳过确认阶段。",
    ],
  },
  {
    icon: CheckSquare,
    title: "02 文本解析",
    description: "系统先围绕这条句子生成翻译、分句 prompt1-4、句式分析、词汇解析和雅思建议，先把教学所需文本底稿搭好。",
    points: [
      "解析结果覆盖图片模块和后续讲解链路需要的核心文本。",
      "这一阶段的目标不是直接出图，而是先把句子讲清楚、拆明白。",
      "所有后续模块都会依赖这里产出的文本内容继续延展。",
    ],
  },
  {
    icon: CheckSquare,
    title: "03 文本编辑确认",
    description: "进入文本编辑页后，可以人工校对、改写和重生成，确保真正进入图片和讲解流程的是确认后的版本。",
    points: [
      "支持逐段改写文本内容，而不是只能接受一次性结果。",
      "支持单模块重新生成，也支持整页重新生成。",
      "只有确认后的文本版本，才会成为后续图片和讲解内容的依据。",
    ],
  },
  {
    icon: FileImage,
    title: "04 图片生成与结果页",
    description: "确认文本后进入任务详情页，系统按模块顺序生成条漫图片，再在结果页集中查看、下载和继续迭代。",
    points: [
      "生成过程可追踪每个模块当前状态和失败原因。",
      "结果页支持下载图片、查看源文本，并基于修改后的内容重新生成图片。",
      "图片结果不是终点，而是后续讲解链路的素材基础。",
    ],
  },
  {
    icon: Headphones,
    title: "05 句子讲解、配音与视频",
    description: "当五张解析图齐全后，系统会把原句、文本解析和图片结果继续扩展成句子讲解文章、讲解配音和讲解视频。",
    points: [
      "讲解文章按图片顺序组织，不是脱离图片单独写一篇文案。",
      "配音会基于讲解文章生成整套音频段落，并保存回历史记录。",
      "视频页会把图片和配音组合成可预览、可下载的视频结果。",
    ],
  },
  {
    icon: Database,
    title: "06 历史记录与云端恢复",
    description: "每次确认生成、重生成、讲解产出都会沉淀为历史任务，并可同步到 Supabase，方便回看、恢复和继续开新分支。",
    points: [
      "历史记录会默认打开该任务最后完成的页面，而不是只回首页。",
      "可以直接从历史记录回到文本编辑、图片结果、句子讲解或视频页。",
      "任务快照与媒体文件可同步保存，清理本地后仍可恢复云端历史任务。",
    ],
  },
];

const productTraits = [
  {
    icon: Layers3,
    title: "模块化而不是一锅出",
    description: "句译对照、句式分析、句式总结、词汇解析、雅思备考 5 个模块可以独立勾选、独立控制参考图、独立重生成。",
  },
  {
    icon: BookCopy,
    title: "先确认文本，再生成图和讲解",
    description: "这个 Web 的核心逻辑不是直接出图，而是先把文本讲清楚、改准确，再让图片、讲解文章、配音和视频都基于同一版确认文本继续扩展。",
  },
  {
    icon: Video,
    title: "从一条句子延展到整套教学资产",
    description: "目标不是只得到 1 张图或 1 段解释，而是把 1 条英语长难句沉淀成文本解析、条漫图片、讲解文章、讲解配音和讲解视频这整套可复用内容。",
  },
  {
    icon: Sparkles,
    title: "结果可追溯，可迭代，可沉淀",
    description: "历史任务会保留源文本、结果状态和最终页面入口；任务记录与媒体文件还能同步到 Supabase，便于回看和继续迭代。",
  },
];

const summaryMetrics = [
  { label: "1 条输入", value: "英语长难句" },
  { label: "5 个核心模块", value: "按需产出" },
  { label: "3 层延展结果", value: "文章 / 配音 / 视频" },
  { label: "1 条完整链路", value: "可追溯历史记录" },
];

export default function AboutPage() {
  return (
    <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
      <div className="container max-w-6xl py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="rounded-[30px] gradient-hero p-8 text-primary-foreground shadow-elegant">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4" />
              About English Flow Agent
            </div>
            <h1 className="mt-5 max-w-4xl font-display text-4xl font-bold leading-tight md:text-5xl">
              把 1 条英语长难句，沉淀成一整套可复用的教学资产
            </h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-primary-foreground/82 md:text-base">
              这个 Agent 面向英语学习者、雅思备考者和内容创作者。当前 Web 已经覆盖从首页录入、文本解析、人工确认、模块化条漫图片生成，到句子讲解文章、讲解配音、讲解视频和历史追溯的完整流程。
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {summaryMetrics.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/15 bg-white/8 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-primary-foreground/60">{item.label}</p>
                  <p className="mt-2 text-lg font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-elegant">
            <div className="flex items-center gap-3">
              <Layers3 className="h-5 w-5 text-accent" />
              <div>
                <h2 className="font-display text-2xl font-semibold">模块区域：5 个核心教学产出</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  首页勾选的模块决定图片生成范围。每个模块都有自己的文本依赖、参考图和最终用途，适合按教学场景自由组合。
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {moduleMetaList.map((module, index) => {
                const insight = moduleFocusMap[module.id];

                return (
                  <motion.div
                    key={module.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="rounded-2xl border border-border bg-background/70 p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-accent">{String(index + 1).padStart(2, "0")}</p>
                        <h3 className="mt-2 font-display text-xl font-semibold text-foreground">{module.title}</h3>
                      </div>
                      <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">{module.panels}</span>
                    </div>

                    <p className="mt-4 text-sm leading-7 text-muted-foreground">{module.description}</p>

                    <div className="mt-4 space-y-2 text-sm">
                      <div className="rounded-xl bg-secondary/40 px-3 py-2">
                        <span className="font-medium text-foreground">依赖文本：</span>
                        <span className="text-muted-foreground">{module.dependsOn}</span>
                      </div>
                      <div className="rounded-xl bg-secondary/40 px-3 py-2">
                        <span className="font-medium text-foreground">模块重点：</span>
                        <span className="text-muted-foreground">{insight.focus}</span>
                      </div>
                      <div className="rounded-xl bg-secondary/40 px-3 py-2">
                        <span className="font-medium text-foreground">最终用途：</span>
                        <span className="text-muted-foreground">{insight.output}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-elegant">
            <div className="flex items-center gap-3">
              <CheckSquare className="h-5 w-5 text-accent" />
              <div>
                <h2 className="font-display text-2xl font-semibold">流程区域：从句子到历史资产</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  这不是“输入一句话直接出图”的单步工具，而是一条先解析、再确认、再生成、再延展、再沉淀的完整工作流。
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {workflowBlocks.map((block, index) => (
                <motion.div
                  key={block.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex h-full flex-col rounded-2xl border border-border bg-background/70 p-5"
                >
                  <div className="flex items-center gap-3">
                    <block.icon className="h-5 w-5 text-accent" />
                    <h3 className="font-display text-xl font-semibold text-foreground">{block.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{block.description}</p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm leading-6 text-muted-foreground">
                    {block.points.map((point) => (
                      <li key={point} className="rounded-xl bg-secondary/35 px-3 py-2">
                        {point}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-elegant">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-accent" />
              <div>
                <h2 className="font-display text-2xl font-semibold">这个 Web 的特点</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  重点不只是“能生成内容”，而是“能把每一步做成可确认、可延展、可复用、可追溯的教学流程”。
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {productTraits.map((item, index) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="rounded-2xl border border-border bg-background/70 p-5"
                >
                  <item.icon className="h-6 w-6 text-accent" />
                  <h3 className="mt-4 font-display text-xl font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.description}</p>
                </motion.div>
              ))}
            </div>
          </section>
        </motion.div>
      </div>
    </div>
  );
}
