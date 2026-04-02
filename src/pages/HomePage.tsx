import { ArrowRight, BookOpen, Sparkles, Wand2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TextTransferWorkspace } from "@/pages/TextTransferPage";

export default function HomePage() {
  return (
    <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
      <div className="container max-w-6xl py-10 space-y-8">
        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-border bg-card p-8 shadow-elegant">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Claude Code Skill Playground
            </div>
            <h1 className="mt-5 font-display text-4xl font-bold tracking-tight text-foreground">
              在首页直接上传两张图，用一句 prompt 改掉目标图上的文字。
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
              这里会模拟 Claude Code 调用本地的 <code>aifast-text-transfer-editor</code> skill，把你的自然语言要求包装成图片编辑指令，然后返回修改后的新图。
            </p>
          </div>

          <div className="space-y-4 rounded-3xl border border-border bg-card p-6 shadow-elegant">
            <div className="rounded-2xl bg-muted/40 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <Wand2 className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">当前首页主功能</p>
                  <p className="text-sm text-muted-foreground">
                    参考图 + 待修改图 + Prompt + 更改按钮，生成最终改图结果。
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-muted/40 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-accent/10 p-2 text-accent">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">原来的句子任务功能还保留</p>
                    <p className="text-sm text-muted-foreground">
                      如果你还要继续使用英语句子解析和配图工作流，可以从这里进入。
                    </p>
                  </div>
                  <Button asChild variant="outline" className="w-full justify-between">
                    <Link to="/sentence-agent">
                      打开句子任务工作台
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            <Button asChild className="w-full justify-between gradient-ink text-primary-foreground">
              <Link to="/text-transfer">
                在独立页面中打开图片改字
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-elegant">
          <TextTransferWorkspace embedded />
        </section>
      </div>
    </div>
  );
}
