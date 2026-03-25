import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { History, RefreshCw, Search, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteTaskWorkflow,
  duplicateTaskForRegeneration,
  formatTaskTime,
  getHistoryTasks,
  getTaskResumePath,
  hydrateHistoryPreviewTasks,
  moduleTitle,
  resolveTaskResumeRoute,
  taskStatusLabel,
  type Task,
  useTasks,
} from "@/lib/task-store";

const pageSize = 10;

function hasGeneratedImages(task: Task) {
  return Object.values(task.generatedImages).some((image) => Boolean(image?.id || image?.dataUrl || image?.publicUrl));
}

function getFinalPageLabel(task: Task) {
  const route = resolveTaskResumeRoute(task);

  if (route === "video") {
    return "最终页：讲解视频";
  }

  if (route === "explanation") {
    return task.sentenceExplanation?.tts ? "最终页：讲解配音" : "最终页：句子讲解";
  }

  if (route === "result") {
    return "最终页：图片结果";
  }

  if (route === "edit") {
    return "最终页：文本编辑";
  }

  return "最终页：任务执行";
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const rawTasks = useTasks();
  const [query, setQuery] = useState("");
  const [bookFilter, setBookFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [hydratedPreviewTasks, setHydratedPreviewTasks] = useState<Task[]>([]);

  const historyTasks = useMemo(() => getHistoryTasks(rawTasks), [rawTasks]);
  const books = useMemo(() => Array.from(new Set(historyTasks.map((task) => task.bookName))), [historyTasks]);

  const filtered = useMemo(() => {
    return historyTasks.filter((task) => {
      const normalizedQuery = query.trim().toLowerCase();
      const matchesQuery =
        !normalizedQuery ||
        task.sentence.toLowerCase().includes(normalizedQuery) ||
        task.bookName.toLowerCase().includes(normalizedQuery) ||
        task.author.toLowerCase().includes(normalizedQuery);
      const matchesBook = bookFilter === "all" || task.bookName === bookFilter;
      return matchesQuery && matchesBook;
    });
  }, [bookFilter, historyTasks, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedTasks = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filtered],
  );

  useEffect(() => {
    let cancelled = false;
    setHydratedPreviewTasks([]);

    void hydrateHistoryPreviewTasks(paginatedTasks).then((tasks) => {
      if (!cancelled) {
        setHydratedPreviewTasks(tasks);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [paginatedTasks]);

  const visibleTasks = useMemo(() => {
    const hydratedById = new Map(hydratedPreviewTasks.map((task) => [task.id, task]));
    return paginatedTasks.map((task) => hydratedById.get(task.id) ?? task);
  }, [hydratedPreviewTasks, paginatedTasks]);

  const handleRegenerate = (taskId: string) => {
    const task = duplicateTaskForRegeneration(taskId);
    if (task) {
      navigate(`/task/${task.id}`);
    }
  };

  const handleDelete = (taskId: string) => {
    if (window.confirm("确认删除这条历史流程及其关联图片、音频和视频吗？")) {
      void deleteTaskWorkflow(taskId);
    }
  };

  return (
    <div className="gradient-parchment min-h-[calc(100vh-4rem)]">
      <div className="container max-w-6xl py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-elegant">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="flex items-center gap-3 font-display text-3xl font-bold">
                  <History className="h-7 w-7 text-accent" />
                  历史记录
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  同一次流程会自动折叠为一条记录，默认打开最后生成的页面。
                </p>
              </div>
              <div className="text-sm text-muted-foreground">共 {filtered.length} 条流程</div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-[1.1fr_0.4fr]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="搜索句子内容、书名或作者"
                  className="pl-9"
                />
              </div>
              <select
                value={bookFilter}
                onChange={(event) => {
                  setBookFilter(event.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">全部书名</option>
                {books.map((book) => (
                  <option key={book} value={book}>
                    {book}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {visibleTasks.length ? (
              visibleTasks.map((task, index) => {
                const firstImage = Object.values(task.generatedImages).find((image) =>
                  Boolean(image?.id || image?.dataUrl || image?.publicUrl),
                );
                const firstImageSource = firstImage?.dataUrl || firstImage?.publicUrl || "";
                const taskResumePath = getTaskResumePath(task);
                const resultPath = `/result/${task.id}`;

                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="rounded-2xl border border-border bg-card p-5 shadow-elegant"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              task.status === "completed"
                                ? "bg-success/10 text-success"
                                : task.status === "generating"
                                  ? "bg-info/10 text-info"
                                  : task.status === "failed"
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-accent/10 text-accent"
                            }`}
                          >
                            {taskStatusLabel(task.status)}
                          </span>
                          <span className="text-xs text-muted-foreground">{formatTaskTime(task.updatedAt)}</span>
                          <span className="text-xs text-muted-foreground">{getFinalPageLabel(task)}</span>
                        </div>

                        <Link to={taskResumePath} className="mt-4 block">
                          <h2 className="text-base font-semibold text-foreground transition-colors hover:text-accent">
                            {task.sentence.length > 110 ? `${task.sentence.slice(0, 110)}...` : task.sentence}
                          </h2>
                        </Link>

                        <div className="mt-2 text-sm text-muted-foreground">
                          {task.bookName} · {task.author}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {task.modules.map((moduleId) => (
                            <span
                              key={moduleId}
                              className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                            >
                              {moduleTitle(moduleId)}
                            </span>
                          ))}
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">
                          <Button asChild variant="outline" size="sm">
                            <Link to={taskResumePath}>查看最终页面</Link>
                          </Button>
                          {hasGeneratedImages(task) && taskResumePath !== resultPath ? (
                            <Button asChild variant="outline" size="sm">
                              <Link to={resultPath}>回退到图片结果</Link>
                            </Button>
                          ) : null}
                          <Button variant="outline" size="sm" onClick={() => handleRegenerate(task.id)}>
                            <RefreshCw className="h-4 w-4" />
                            重新生成
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDelete(task.id)}>
                            <Trash2 className="h-4 w-4" />
                            删除流程
                          </Button>
                        </div>
                      </div>

                      <div className="w-full lg:w-48">
                        {firstImageSource ? (
                          <img
                            src={firstImageSource}
                            alt={firstImage?.title || task.sentence}
                            className="aspect-[3/4] w-full rounded-2xl border border-border object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="flex aspect-[3/4] items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/10 text-sm text-muted-foreground">
                            暂无缩略图
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center text-sm text-muted-foreground shadow-elegant">
                当前没有符合条件的历史流程。
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 shadow-elegant">
            <div className="text-sm text-muted-foreground">
              第 {currentPage} / {totalPages} 页
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={currentPage === 1}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={currentPage === totalPages}
              >
                下一页
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
