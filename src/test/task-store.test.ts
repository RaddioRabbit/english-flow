import { beforeEach, describe, expect, it } from "vitest";

import {
  createSentenceExplanationArticleTask,
  createSentenceExplanationRevisionTask,
  createRevisionTask,
  defaultReferenceImages,
  duplicateTaskForRegeneration,
  getHistoryTasks,
  getTaskResumePath,
  getTaskWorkflowId,
  loadTasks,
  resolveTaskResumeRoute,
  saveSentenceExplanationVideo,
  saveTasks,
  type ModuleId,
  type Task,
  type TextContent,
} from "@/lib/task-store";

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
        phonetic: "/ˈaŋkər/",
        partOfSpeech: "n.",
        meaning: "an anchor",
        example: "They dropped anchor.",
        translation: "锚",
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

function buildSentenceExplanationResponse() {
  return {
    article: {
      title: "Sentence explanation",
      welcomeMessage: "Welcome",
      introduction: "Introduction",
      sections: [
        {
          moduleId: "translation" as const,
          moduleName: "Translation",
          imageRef: "translation" as const,
          content: "Translation explanation",
        },
        {
          moduleId: "grammar" as const,
          moduleName: "Grammar",
          imageRef: "grammar" as const,
          content: "Grammar explanation",
        },
      ],
      conclusion: "Conclusion",
      totalWordCount: 42,
    },
    orderedModules: ["translation", "grammar"] as const,
    source: "openai-compatible-api" as const,
    model: "test-model",
  };
}

function buildSentenceExplanationTts() {
  return {
    title: "Sentence explanation audio",
    welcomeMessage: "Welcome",
    introduction: {
      text: "Introduction",
      audioDataUrl: "data:audio/mp3;base64,intro",
      assetId: "audio-intro",
    },
    sections: [
      {
        moduleId: "translation" as const,
        moduleName: "Translation",
        imageRef: "translation" as const,
        content: {
          text: "Translation explanation",
          audioDataUrl: "data:audio/mp3;base64,translation",
          assetId: "audio-translation",
        },
      },
      {
        moduleId: "grammar" as const,
        moduleName: "Grammar",
        imageRef: "grammar" as const,
        content: {
          text: "Grammar explanation",
          audioDataUrl: "data:audio/mp3;base64,grammar",
          assetId: "audio-grammar",
        },
      },
    ],
    conclusion: {
      text: "Conclusion",
      audioDataUrl: "data:audio/mp3;base64,conclusion",
      assetId: "audio-conclusion",
    },
    metadata: {
      language: "en" as const,
      voice: "English_Trustworthy_Man" as const,
      speed: 1,
      generatedAt: "2099-01-01T00:00:00.000Z",
      totalSegments: 4,
      successfulSegments: 4,
    },
    source: "minimax-api" as const,
    model: "speech-model",
  };
}

function buildTask(): Task {
  const now = "2099-01-01T00:00:00.000Z";

  return {
    id: "task-1",
    sentence: "It is a truth universally acknowledged.",
    bookName: "Pride and Prejudice",
    author: "Jane Austen",
    modules: ["translation", "grammar"],
    referenceImages: defaultReferenceImages(),
    textContent: buildTextContent(),
    generatedImages: {},
    steps: [],
    logs: [],
    status: "completed",
    progress: 100,
    currentStage: "done",
    flowMode: "all",
    analysisSource: "local-mock",
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  };
}

function buildGeneratedImage(moduleId: ModuleId, now = "2099-01-01T00:00:00.000Z") {
  return {
    id: `image-${moduleId}`,
    imageType: moduleId,
    title: `${moduleId} image`,
    subtitle: `${moduleId} subtitle`,
    sourceText: `${moduleId} source`,
    fileName: `${moduleId}.png`,
    dataUrl: `data:image/png;base64,${moduleId}`,
    createdAt: now,
  };
}

describe("duplicateTaskForRegeneration", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates a new task for selected modules without mutating the original task", () => {
    saveTasks([buildTask()]);

    const updatedText = buildTextContent();
    updatedText.prompt1 = "Updated prompt 1";
    updatedText.grammar.structure = "updated grammar";

    const nextTask = duplicateTaskForRegeneration("task-1", {
      modules: ["grammar"],
      textContent: updatedText,
    });

    expect(nextTask).not.toBeNull();
    expect(nextTask?.id).not.toBe("task-1");
    expect(nextTask?.modules).toEqual(["grammar"]);
    expect(nextTask?.textContent.prompt1).toBe("Updated prompt 1");
    expect(nextTask?.textContent.grammar.structure).toBe("updated grammar");
    expect(nextTask?.generatedImages).toEqual({});
    expect(nextTask?.status).toBe("generating");

    const tasks = loadTasks();
    expect(tasks).toHaveLength(2);

    const originalTask = tasks.find((task) => task.id === "task-1");
    expect(originalTask?.modules).toEqual(["translation", "grammar"]);
    expect(originalTask?.textContent.prompt1).toBe("Original prompt 1");
    expect(originalTask?.textContent.grammar.structure).toBe("simple sentence");
  });
});

describe("createRevisionTask", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates a new history record that carries over untouched images without mutating the original task", async () => {
    const now = "2099-01-01T00:00:00.000Z";
    const originalTask: Task = {
      ...buildTask(),
      modules: ["translation", "grammar", "summary", "vocabulary", "ielts"],
      generatedImages: {
        translation: buildGeneratedImage("translation", now),
        grammar: buildGeneratedImage("grammar", now),
        summary: buildGeneratedImage("summary", now),
        vocabulary: buildGeneratedImage("vocabulary", now),
        ielts: buildGeneratedImage("ielts", now),
      },
      steps: [
        { id: "parse-segmentation", stage: "parsing", label: "parse segmentation", status: "done" },
        { id: "parse-grammar", stage: "parsing", label: "parse grammar", status: "done" },
        { id: "parse-vocabulary", stage: "parsing", label: "parse vocabulary", status: "done" },
        { id: "parse-ielts", stage: "parsing", label: "parse ielts", status: "done" },
        { id: "generate-translation", stage: "generation", label: "generate translation", status: "done", moduleId: "translation" },
        { id: "generate-grammar", stage: "generation", label: "generate grammar", status: "done", moduleId: "grammar" },
        { id: "generate-summary", stage: "generation", label: "generate summary", status: "done", moduleId: "summary" },
        { id: "generate-vocabulary", stage: "generation", label: "generate vocabulary", status: "done", moduleId: "vocabulary" },
        { id: "generate-ielts", stage: "generation", label: "generate ielts", status: "done", moduleId: "ielts" },
      ],
    };

    saveTasks([originalTask]);

    const updatedText = buildTextContent();
    updatedText.prompt1 = "Revision prompt 1";

    const nextTask = await createRevisionTask(originalTask, {
      targetModules: ["translation"],
      displayModules: originalTask.modules,
      textContent: updatedText,
    });

    expect(nextTask).not.toBeNull();
    expect(nextTask?.id).not.toBe("task-1");
    expect(nextTask?.modules).toEqual(["translation", "grammar", "summary", "vocabulary", "ielts"]);
    expect(nextTask?.textContent.prompt1).toBe("Revision prompt 1");
    expect(nextTask?.generatedImages.translation).toBeUndefined();
    expect(nextTask?.generatedImages.grammar?.id).not.toBe(originalTask.generatedImages.grammar?.id);
    expect(nextTask?.generatedImages.grammar?.dataUrl).toBe(originalTask.generatedImages.grammar?.dataUrl);
    expect(Object.keys(nextTask?.generatedImages ?? {}).sort()).toEqual(["grammar", "ielts", "summary", "vocabulary"]);
    expect(nextTask?.steps.find((step) => step.id === "generate-translation")?.status).toBe("running");
    expect(nextTask?.steps.find((step) => step.id === "generate-grammar")?.status).toBe("done");
    expect(nextTask?.status).toBe("generating");

    const tasks = loadTasks();
    expect(tasks).toHaveLength(2);

    const storedOriginalTask = tasks.find((task) => task.id === "task-1");
    const storedRevisionTask = tasks.find((task) => task.id === nextTask?.id);

    expect(storedOriginalTask?.textContent.prompt1).toBe("Original prompt 1");
    expect(Object.keys(storedOriginalTask?.generatedImages ?? {}).sort()).toEqual([
      "grammar",
      "ielts",
      "summary",
      "translation",
      "vocabulary",
    ]);
    expect(storedRevisionTask?.modules).toEqual(["translation", "grammar", "summary", "vocabulary", "ielts"]);
    expect(Object.keys(storedRevisionTask?.generatedImages ?? {}).sort()).toEqual(["grammar", "ielts", "summary", "vocabulary"]);
  });
});

describe("loadTasks", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("fills missing image records for legacy tasks", () => {
    const legacyTask = {
      id: "legacy-task",
      sentence: "Legacy sentence",
      bookName: "Legacy book",
      author: "Legacy author",
      modules: ["translation", "grammar"],
      textContent: buildTextContent(),
      steps: [],
      logs: [],
      status: "completed",
      progress: 100,
      currentStage: "done",
      flowMode: "all",
      createdAt: "2099-01-01T00:00:00.000Z",
      updatedAt: "2099-01-01T00:00:00.000Z",
      completedAt: "2099-01-01T00:00:00.000Z",
    };

    window.localStorage.setItem("english-flow.tasks.v2", JSON.stringify([legacyTask]));

    const tasks = loadTasks();

    expect(tasks).toHaveLength(1);
    expect(tasks[0].referenceImages).toEqual(defaultReferenceImages());
    expect(tasks[0].generatedImages).toEqual({});
  });

  it("sanitizes legacy segmentation translations before returning tasks", () => {
    const legacyTask = {
      id: "legacy-task",
      sentence: "Legacy sentence",
      bookName: "Legacy book",
      author: "Legacy author",
      modules: ["translation"],
      referenceImages: defaultReferenceImages(),
      generatedImages: {},
      textContent: {
        ...buildTextContent(),
        prompt2: "前半部分描述航行初期的天气状况和沿海岸线的行程，直到抵达圣奥古斯丁角。",
        prompt4: "后半部分描述离开海岸后的航行：从圣奥古斯丁角起远离海岸，驶离陆地视线。",
      },
      steps: [],
      logs: [],
      status: "completed",
      progress: 100,
      currentStage: "done",
      flowMode: "all",
      createdAt: "2099-01-01T00:00:00.000Z",
      updatedAt: "2099-01-01T00:00:00.000Z",
      completedAt: "2099-01-01T00:00:00.000Z",
    };

    window.localStorage.setItem("english-flow.tasks.v2", JSON.stringify([legacyTask]));

    const tasks = loadTasks();

    expect(tasks[0].textContent.prompt2).toBe("航行初期的天气状况和沿海岸线的行程，直到抵达圣奥古斯丁角。");
    expect(tasks[0].textContent.prompt4).toBe("从圣奥古斯丁角起远离海岸，驶离陆地视线。");
  });

  it("removes tasks older than 30 days on load", () => {
    const expiredTask = {
      id: "expired-task",
      sentence: "Expired sentence",
      bookName: "Expired book",
      author: "Expired author",
      modules: ["translation"],
      textContent: buildTextContent(),
      steps: [],
      logs: [],
      status: "completed",
      progress: 100,
      currentStage: "done",
      flowMode: "all",
      createdAt: "2000-01-01T00:00:00.000Z",
      updatedAt: "2000-01-01T00:00:00.000Z",
      completedAt: "2000-01-01T00:00:00.000Z",
    };
    const freshTask = {
      id: "fresh-task",
      sentence: "Fresh sentence",
      bookName: "Fresh book",
      author: "Fresh author",
      modules: ["translation"],
      textContent: buildTextContent(),
      steps: [],
      logs: [],
      status: "completed",
      progress: 100,
      currentStage: "done",
      flowMode: "all",
      createdAt: "2099-01-01T00:00:00.000Z",
      updatedAt: "2099-01-01T00:00:00.000Z",
      completedAt: "2099-01-01T00:00:00.000Z",
    };

    window.localStorage.setItem("english-flow.tasks.v2", JSON.stringify([expiredTask, freshTask]));
    window.localStorage.removeItem("english-flow.last-local-cleanup-at");

    const tasks = loadTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("fresh-task");
  });
});

describe("getHistoryTasks", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("collapses legacy sentence explanation revisions into the newest generated page", () => {
    const imageTimestamp = "2099-01-01T00:00:00.000Z";
    const rootTask: Task = {
      ...buildTask(),
      id: "task-root",
      generatedImages: {
        translation: buildGeneratedImage("translation", imageTimestamp),
        grammar: buildGeneratedImage("grammar", imageTimestamp),
      },
      resumeRoute: "result",
      updatedAt: "2099-01-01T00:00:00.000Z",
      completedAt: "2099-01-01T00:00:00.000Z",
    };
    const explanationTask: Task = {
      ...buildTask(),
      id: "task-explanation",
      generatedImages: {
        translation: { ...buildGeneratedImage("translation", imageTimestamp), id: "image-translation-2" },
        grammar: { ...buildGeneratedImage("grammar", imageTimestamp), id: "image-grammar-2" },
      },
      sentenceExplanation: {
        article: buildSentenceExplanationResponse(),
        tts: null,
        video: null,
        stage: "article",
        updatedAt: "2099-01-01T00:00:00.000Z",
      },
      resumeRoute: "explanation",
      createdAt: "2099-01-01T00:00:00.000Z",
      updatedAt: "2099-01-01T00:00:00.000Z",
      completedAt: "2099-01-01T00:00:00.000Z",
    };
    const videoTask: Task = {
      ...buildTask(),
      id: "task-video",
      generatedImages: {
        translation: { ...buildGeneratedImage("translation", imageTimestamp), id: "image-translation-3" },
        grammar: { ...buildGeneratedImage("grammar", imageTimestamp), id: "image-grammar-3" },
      },
      sentenceExplanation: {
        article: buildSentenceExplanationResponse(),
        tts: buildSentenceExplanationTts(),
        video: {
          id: "video-1",
          fileName: "explanation.mp4",
          mimeType: "video/mp4",
          dataUrl: "data:video/mp4;base64,video",
          durationSeconds: 12,
          createdAt: "2099-01-01T00:00:00.000Z",
        },
        stage: "video",
        updatedAt: "2099-01-01T00:00:00.000Z",
      },
      resumeRoute: "video",
      createdAt: "2099-01-01T00:00:00.000Z",
      updatedAt: "2099-01-01T00:00:00.000Z",
      completedAt: "2099-01-01T00:00:00.000Z",
    };

    saveTasks([rootTask, explanationTask, videoTask]);

    const historyTasks = getHistoryTasks(loadTasks());

    expect(historyTasks).toHaveLength(1);
    expect(historyTasks[0].id).toBe("task-video");
  });

  it("opens the video page from history when video output exists even if the explanation page was visited later", () => {
    const videoTask: Task = {
      ...buildTask(),
      id: "task-video-route",
      generatedImages: {
        translation: buildGeneratedImage("translation"),
        grammar: buildGeneratedImage("grammar"),
      },
      sentenceExplanation: {
        article: buildSentenceExplanationResponse(),
        tts: buildSentenceExplanationTts(),
        video: {
          id: "video-route-1",
          fileName: "explanation.mp4",
          mimeType: "video/mp4",
          dataUrl: "data:video/mp4;base64,video",
          durationSeconds: 12,
          createdAt: "2099-01-01T00:00:00.000Z",
        },
        stage: "video",
        updatedAt: "2099-01-01T00:00:00.000Z",
      },
      resumeRoute: "explanation",
    };

    expect(resolveTaskResumeRoute(videoTask)).toBe("video");
    expect(getTaskResumePath(videoTask)).toBe("/explanation/task-video-route/video");
  });
});

describe("createSentenceExplanationRevisionTask", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates a new history record that preserves prior explanation assets while cloning carried results", async () => {
    const now = "2099-01-01T00:00:00.000Z";
    const originalTask: Task = {
      ...buildTask(),
      modules: ["translation", "grammar"],
      generatedImages: {
        translation: buildGeneratedImage("translation", now),
        grammar: buildGeneratedImage("grammar", now),
      },
      sentenceExplanation: {
        article: buildSentenceExplanationResponse(),
        tts: buildSentenceExplanationTts(),
        video: {
          id: "video-1",
          fileName: "explanation.mp4",
          mimeType: "video/mp4",
          dataUrl: "data:video/mp4;base64,video",
          durationSeconds: 12,
          createdAt: now,
        },
        stage: "video",
        updatedAt: now,
      },
      resumeRoute: "video",
      steps: [
        { id: "parse-segmentation", stage: "parsing", label: "parse segmentation", status: "done" },
        { id: "parse-grammar", stage: "parsing", label: "parse grammar", status: "done" },
        { id: "generate-translation", stage: "generation", label: "generate translation", status: "done", moduleId: "translation" },
        { id: "generate-grammar", stage: "generation", label: "generate grammar", status: "done", moduleId: "grammar" },
      ],
    };

    saveTasks([originalTask]);

    const revisedArticle = buildSentenceExplanationResponse();
    revisedArticle.article.title = "Revised sentence explanation";

    const nextTask = await createSentenceExplanationRevisionTask(originalTask, {
      article: revisedArticle,
      tts: originalTask.sentenceExplanation?.tts ?? null,
      stage: "tts",
      resumeRoute: "video",
    });

    expect(nextTask).not.toBeNull();
    expect(nextTask?.id).not.toBe(originalTask.id);
    expect(nextTask?.generatedImages.translation?.id).not.toBe(originalTask.generatedImages.translation?.id);
    expect(nextTask?.generatedImages.translation?.dataUrl).toBe(originalTask.generatedImages.translation?.dataUrl);
    expect(nextTask?.sentenceExplanation?.article?.article.title).toBe("Revised sentence explanation");
    expect(nextTask?.sentenceExplanation?.tts?.introduction.assetId).not.toBe(
      originalTask.sentenceExplanation?.tts?.introduction.assetId,
    );
    expect(nextTask?.sentenceExplanation?.tts?.introduction.audioDataUrl).toBe(
      originalTask.sentenceExplanation?.tts?.introduction.audioDataUrl,
    );
    expect(nextTask?.sentenceExplanation?.video).toBeNull();
    expect(nextTask?.workflowId).toBe(nextTask?.id);
    expect(getTaskWorkflowId(nextTask as Task)).toBe(nextTask?.id);
    expect(getTaskWorkflowId(nextTask as Task)).not.toBe(getTaskWorkflowId(originalTask));
    expect(nextTask?.resumeRoute).toBe("explanation");
    expect(nextTask?.status).toBe("completed");

    const storedTasks = loadTasks();
    expect(storedTasks).toHaveLength(2);
    expect(getHistoryTasks(storedTasks)).toHaveLength(2);
    expect(storedTasks.find((task) => task.id === originalTask.id)?.sentenceExplanation?.article?.article.title).toBe(
      "Sentence explanation",
    );
    expect(storedTasks.find((task) => task.id === nextTask?.id)?.sentenceExplanation?.article?.article.title).toBe(
      "Revised sentence explanation",
    );
  });
});

describe("createSentenceExplanationArticleTask", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates a separate history record for the first generated sentence explanation article", async () => {
    const now = "2099-01-01T00:00:00.000Z";
    const originalTask: Task = {
      ...buildTask(),
      id: "task-image-only",
      generatedImages: {
        translation: buildGeneratedImage("translation", now),
        grammar: buildGeneratedImage("grammar", now),
      },
      resumeRoute: "result",
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    };

    saveTasks([originalTask]);

    const articleTask = await createSentenceExplanationArticleTask(originalTask, buildSentenceExplanationResponse());

    expect(articleTask).not.toBeNull();
    expect(articleTask?.id).not.toBe(originalTask.id);
    expect(articleTask?.sentenceExplanation?.article?.article.title).toBe("Sentence explanation");
    expect(articleTask?.sentenceExplanation?.stage).toBe("article");
    expect(articleTask?.resumeRoute).toBe("explanation");

    const storedTasks = loadTasks();
    expect(storedTasks).toHaveLength(2);
    expect(storedTasks.find((task) => task.id === originalTask.id)?.sentenceExplanation?.article).toBeNull();
    expect(storedTasks.find((task) => task.id === articleTask?.id)?.sentenceExplanation?.article?.article.title).toBe(
      "Sentence explanation",
    );
    expect(getHistoryTasks(storedTasks)).toHaveLength(2);
  });
});

describe("saveSentenceExplanationVideo", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("assigns a fresh video asset id when replacing an existing exported video", async () => {
    const now = "2099-01-01T00:00:00.000Z";
    const originalTask: Task = {
      ...buildTask(),
      sentenceExplanation: {
        article: buildSentenceExplanationResponse(),
        tts: buildSentenceExplanationTts(),
        video: {
          id: "video-existing",
          fileName: "old-video.mp4",
          mimeType: "video/mp4",
          dataUrl: "data:video/mp4;base64,old-video",
          durationSeconds: 8,
          createdAt: now,
        },
        stage: "video",
        updatedAt: now,
      },
      resumeRoute: "video",
    };

    saveTasks([originalTask]);

    await saveSentenceExplanationVideo(originalTask.id, {
      id: "video-existing",
      fileName: "new-video.mp4",
      mimeType: "video/mp4",
      dataUrl: "data:video/mp4;base64,new-video",
      durationSeconds: 12,
      createdAt: "2099-01-01T00:00:00.000Z",
    });

    const storedTask = loadTasks().find((task) => task.id === originalTask.id);
    expect(storedTask?.sentenceExplanation?.video?.id).not.toBe("video-existing");
    expect(storedTask?.sentenceExplanation?.video?.fileName).toBe("new-video.mp4");
  });
});
