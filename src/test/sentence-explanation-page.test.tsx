import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SentenceExplanationPage from "@/pages/SentenceExplanationPage";
import {
  sentenceExplanationModuleOrder,
  type SentenceExplanationArticle,
} from "@/lib/sentence-explanation-contract";
import type { ModuleId, Task, TextContent } from "@/lib/task-store";

const {
  generateSentenceExplanationMock,
  generateSentenceExplanationTtsMock,
  previewSentenceExplanationTtsVoiceMock,
  useHydratedTaskMock,
  createSentenceExplanationArticleTaskMock,
  createSentenceExplanationRevisionTaskMock,
  saveSentenceExplanationArticleMock,
  saveSentenceExplanationTtsMock,
} = vi.hoisted(() => ({
  generateSentenceExplanationMock: vi.fn(),
  generateSentenceExplanationTtsMock: vi.fn(),
  previewSentenceExplanationTtsVoiceMock: vi.fn(),
  useHydratedTaskMock: vi.fn(),
  createSentenceExplanationArticleTaskMock: vi.fn(),
  createSentenceExplanationRevisionTaskMock: vi.fn(),
  saveSentenceExplanationArticleMock: vi.fn(),
  saveSentenceExplanationTtsMock: vi.fn(),
}));

vi.mock("@/lib/sentence-explanation-client", () => ({
  generateSentenceExplanation: generateSentenceExplanationMock,
}));

vi.mock("@/lib/sentence-explanation-tts-client", () => ({
  generateSentenceExplanationTts: generateSentenceExplanationTtsMock,
  previewSentenceExplanationTtsVoice: previewSentenceExplanationTtsVoiceMock,
}));

vi.mock("@/lib/task-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/task-store")>("@/lib/task-store");
  return {
    ...actual,
    createSentenceExplanationArticleTask: createSentenceExplanationArticleTaskMock,
    createSentenceExplanationRevisionTask: createSentenceExplanationRevisionTaskMock,
    saveSentenceExplanationArticle: saveSentenceExplanationArticleMock,
    saveSentenceExplanationTts: saveSentenceExplanationTtsMock,
    useHydratedTask: useHydratedTaskMock,
  };
});

function buildTextContent(): TextContent {
  return {
    translation: "Original translation",
    prompt1: "Original prompt 1",
    prompt2: "Original prompt 2",
    prompt3: "Original prompt 3",
    prompt4: "Original prompt 4",
    grammar: {
      tense: "present",
      voice: "active",
      structure: "simple sentence",
    },
    vocabulary: [
      {
        id: "vocab-1",
        word: "anchor",
        phonetic: "/anchor/",
        partOfSpeech: "n.",
        meaning: "an anchor",
        example: "They dropped anchor.",
        translation: "anchor",
      },
    ],
    ielts: {
      listening: "listen",
      speaking: "speak",
      reading: "read",
      writing: "write",
    },
  };
}

function buildGeneratedImage(moduleId: ModuleId) {
  return {
    id: `image-${moduleId}`,
    imageType: moduleId,
    title: `${moduleId} image`,
    subtitle: `${moduleId} subtitle`,
    sourceText: `${moduleId} source`,
    fileName: `${moduleId}.png`,
    dataUrl: `data:image/png;base64,${moduleId}`,
    createdAt: "2026-03-25T00:00:00.000Z",
  };
}

function buildTask(vocabularyContent = "vocabulary explanation"): Task {
  const now = "2026-03-25T00:00:00.000Z";

  return {
    id: "task-explanation-history",
    sentence: "It is a truth universally acknowledged.",
    bookName: "Pride and Prejudice",
    author: "Jane Austen",
    modules: [...sentenceExplanationModuleOrder],
    referenceImages: {
      translation: null,
      grammar: null,
      summary: null,
      vocabulary: null,
      ielts: null,
    },
    textContent: buildTextContent(),
    generatedImages: Object.fromEntries(
      sentenceExplanationModuleOrder.map((moduleId) => [moduleId, buildGeneratedImage(moduleId)]),
    ) as Task["generatedImages"],
    steps: [],
    logs: [],
    status: "completed",
    progress: 100,
    currentStage: "done",
    flowMode: "all",
    sentenceExplanation: {
      article: {
        article: {
          title: "Sentence explanation",
          welcomeMessage: "Welcome",
          introduction: "Introduction",
          sections: sentenceExplanationModuleOrder.map((moduleId) => ({
            moduleId,
            moduleName: `${moduleId} title`,
            imageRef: moduleId,
            content: moduleId === "vocabulary" ? vocabularyContent : `${moduleId} explanation`,
          })),
          conclusion: "Conclusion",
          totalWordCount: 42,
        },
        orderedModules: sentenceExplanationModuleOrder,
        source: "openai-compatible-api",
        model: "test-model",
      },
      tts: null,
      video: null,
      stage: "article",
      updatedAt: now,
    },
    resumeRoute: "explanation",
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  };
}

function buildLongTtsTask(segmentCount = 97): Task {
  const task = buildTask();
  const translationLineCount = Math.max(1, segmentCount - 7);
  const longArticle: SentenceExplanationArticle = {
    ...task.sentenceExplanation!.article!.article,
    introduction: "第一段导入\n第二段导入",
    introductionLines: ["第一段导入", "第二段导入"],
    sections: sentenceExplanationModuleOrder.map((moduleId) => {
      if (moduleId === "translation") {
        const lines = Array.from({ length: translationLineCount }, (_, index) => `长文语音片段 ${index + 1}`);
        return {
          moduleId,
          moduleName: `${moduleId} title`,
          imageRef: moduleId,
          content: lines.join("\n"),
          lines,
        };
      }

      return {
        moduleId,
        moduleName: `${moduleId} title`,
        imageRef: moduleId,
        content: `${moduleId} explanation`,
        lines: [`${moduleId} explanation`],
      };
    }),
    conclusion: "结尾总结",
    conclusionLines: ["结尾总结"],
    totalWordCount: 42,
  };

  return {
    ...task,
    sentenceExplanation: {
      ...task.sentenceExplanation!,
      article: {
        ...task.sentenceExplanation!.article!,
        article: longArticle,
      },
    },
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/explanation/task-explanation-history"]}>
      <Routes>
        <Route path="/explanation/:taskId" element={<SentenceExplanationPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SentenceExplanationPage", () => {
  beforeEach(() => {
    generateSentenceExplanationMock.mockReset();
    generateSentenceExplanationTtsMock.mockReset();
    previewSentenceExplanationTtsVoiceMock.mockReset();
    useHydratedTaskMock.mockReset();
    createSentenceExplanationArticleTaskMock.mockReset();
    createSentenceExplanationRevisionTaskMock.mockReset();
    saveSentenceExplanationArticleMock.mockReset();
    saveSentenceExplanationTtsMock.mockReset();
  });

  it("does not auto-regenerate when the task already has a saved explanation article", async () => {
    useHydratedTaskMock.mockReturnValue(buildTask());

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Sentence explanation")).toBeInTheDocument();
    });

    expect(generateSentenceExplanationMock).not.toHaveBeenCalled();
  });

  it("renders the language selector without the stray route character", async () => {
    useHydratedTaskMock.mockReturnValue(buildTask());

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("中文 · 简体中文")).toBeInTheDocument();
    });

    expect(screen.queryByText("中文 路 简体中文")).not.toBeInTheDocument();
  });

  it("hides the duplicated fallback pass in an already-saved vocabulary section", async () => {
    useHydratedTaskMock.mockReturnValue(
      buildTask([
        "然后看词汇解析图。",
        "第1个词是 however，它是副词，意思是 然而。",
        "例句是 However, the plan still worked.",
        "意思是 这个计划最后还是成了。",
        "第2个词是 mean，它是动词，意思是 打算。",
        "例句是 I mean to finish the work tonight.",
        "意思是 我今晚打算把这项工作做完。",
        "第1个词是 however，词性是 adv.，意思是 然而。",
        "例句是 However, the plan still worked.",
        "这句例句的中文翻译是 然而，这个计划最终还是奏效了。",
      ].join("\n")),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("第1个词是 however"))).toBeInTheDocument();
    });

    expect(screen.queryByText("这句例句的中文翻译是 然而，这个计划最终还是奏效了。")).not.toBeInTheDocument();
  });

  it("shows long-form tts progress copy without stalling at the fake 94 percent cap", async () => {
    vi.useFakeTimers();

    try {
      useHydratedTaskMock.mockReturnValue(buildLongTtsTask());
      generateSentenceExplanationTtsMock.mockImplementation(() => new Promise(() => {}));

      renderPage();

      expect(screen.getByText("Sentence explanation")).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "文本转语音" }));
      });

      expect(generateSentenceExplanationTtsMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(240_000);
      });

      expect(
        screen.getByText("当前文章共 97 段语音。长文 TTS 会明显比普通文章慢，页面会在全部音频就绪后自动回写。"),
      ).toBeInTheDocument();
      expect(screen.getByText((content) => content.includes("长文共有 97 段语音"))).toBeInTheDocument();
      expect(screen.queryByText("94%")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
