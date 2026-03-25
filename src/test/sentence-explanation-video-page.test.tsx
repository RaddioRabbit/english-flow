import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sentenceExplanationModuleOrder } from "@/lib/sentence-explanation-contract";
import {
  createSentenceExplanationVideoPlan,
  type SentenceExplanationVideoSubtitleTrack,
} from "@/lib/sentence-explanation-video";
import SentenceExplanationVideoPage from "@/pages/SentenceExplanationVideoPage";
import type { ModuleId, Task, TextContent } from "@/lib/task-store";

const {
  useHydratedTaskMock,
  buildSentenceExplanationVideoSubtitleTrackMock,
  exportSentenceExplanationVideoMp4Mock,
  saveSentenceExplanationVideoMock,
  syncSentenceExplanationVideoToSupabaseMock,
  fetchMock,
} = vi.hoisted(() => ({
  useHydratedTaskMock: vi.fn(),
  buildSentenceExplanationVideoSubtitleTrackMock: vi.fn(),
  exportSentenceExplanationVideoMp4Mock: vi.fn(),
  saveSentenceExplanationVideoMock: vi.fn(),
  syncSentenceExplanationVideoToSupabaseMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/task-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/task-store")>("@/lib/task-store");
  return {
    ...actual,
    saveSentenceExplanationVideo: saveSentenceExplanationVideoMock,
    syncSentenceExplanationVideoToSupabase: syncSentenceExplanationVideoToSupabaseMock,
    useHydratedTask: useHydratedTaskMock,
  };
});

vi.mock("@/lib/sentence-explanation-video-export", () => ({
  buildSentenceExplanationVideoSubtitleTrack: buildSentenceExplanationVideoSubtitleTrackMock,
  exportSentenceExplanationVideoMp4: exportSentenceExplanationVideoMp4Mock,
}));

vi.mock("@/lib/supabase-image-store", () => ({
  isSupabaseConfigured: vi.fn(() => false),
}));

type TestModuleId = (typeof sentenceExplanationModuleOrder)[number];

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
    createdAt: "2026-03-22T00:00:00.000Z",
  };
}

function buildArticle(moduleIds: readonly TestModuleId[]) {
  return {
    article: {
      title: "Sentence explanation",
      welcomeMessage: "Welcome",
      introduction: "Introduction",
      sections: moduleIds.map((moduleId) => ({
        moduleId,
        moduleName: `${moduleId} title`,
        imageRef: moduleId,
        content: `${moduleId} explanation`,
      })),
      conclusion: "Conclusion",
      totalWordCount: 42,
    },
    orderedModules: moduleIds,
    source: "openai-compatible-api" as const,
    model: "test-model",
  };
}

function buildTts(moduleIds: readonly TestModuleId[]) {
  return {
    title: "Sentence explanation audio",
    welcomeMessage: "Welcome",
    introduction: {
      text: "Introduction",
      audioDataUrl: "data:audio/mp3;base64,intro",
      assetId: "audio-intro",
    },
    sections: moduleIds.map((moduleId) => ({
      moduleId,
      moduleName: `${moduleId} title`,
      imageRef: moduleId,
      content: {
        text: `${moduleId} explanation`,
        audioDataUrl: `data:audio/mp3;base64,${moduleId}`,
        assetId: `audio-${moduleId}`,
      },
    })),
    conclusion: {
      text: "Conclusion",
      audioDataUrl: "data:audio/mp3;base64,conclusion",
      assetId: "audio-conclusion",
    },
    metadata: {
      language: "en" as const,
      voice: "English_Trustworthy_Man" as const,
      speed: 1,
      generatedAt: "2026-03-22T00:00:00.000Z",
      totalSegments: moduleIds.length + 2,
      successfulSegments: moduleIds.length + 2,
    },
    source: "minimax-api" as const,
    model: "speech-model",
  };
}

function buildSubtitleTrack(): SentenceExplanationVideoSubtitleTrack {
  return {
    cues: [
      {
        moduleId: "translation",
        moduleName: "translation title",
        clipIndex: 0,
        role: "introduction",
        lineIndex: 0,
        text: "Welcome",
        startSeconds: 0,
        endSeconds: 1.2,
        durationSeconds: 1.2,
      },
      {
        moduleId: "translation",
        moduleName: "translation title",
        clipIndex: 0,
        role: "section",
        lineIndex: 1,
        text: "Translation explanation",
        startSeconds: 1.2,
        endSeconds: 3.5,
        durationSeconds: 2.3,
      },
    ],
    srtText: "1\n00:00:00,000 --> 00:00:01,200\nWelcome\n\n2\n00:00:01,200 --> 00:00:03,500\nTranslation explanation",
  };
}

function buildTask(options: { withVideo: boolean; completePlan?: boolean; withSubtitleTrack?: boolean }): Task {
  const now = "2026-03-22T00:00:00.000Z";
  const moduleIds = options.completePlan ? sentenceExplanationModuleOrder : (["translation", "grammar"] as const);

  return {
    id: "task-video-page",
    sentence: "It is a truth universally acknowledged.",
    bookName: "Pride and Prejudice",
    author: "Jane Austen",
    modules: [...moduleIds],
    referenceImages: {
      translation: null,
      grammar: null,
      summary: null,
      vocabulary: null,
      ielts: null,
    },
    textContent: buildTextContent(),
    generatedImages: Object.fromEntries(
      moduleIds.map((moduleId) => [moduleId, buildGeneratedImage(moduleId)]),
    ) as Task["generatedImages"],
    steps: [],
    logs: [],
    status: "completed",
    progress: 100,
    currentStage: "done",
    flowMode: "all",
    sentenceExplanation: {
      article: buildArticle(moduleIds),
      tts: buildTts(moduleIds),
      video: options.withVideo
        ? {
            id: "video-1",
            fileName: "explanation.mp4",
            mimeType: "video/mp4",
            dataUrl: "data:video/mp4;base64,video",
            durationSeconds: 12,
            createdAt: now,
            subtitleTrack: options.withSubtitleTrack ? buildSubtitleTrack() : undefined,
          }
        : null,
      stage: options.withVideo ? "video" : "tts",
      updatedAt: now,
    },
    resumeRoute: options.withVideo ? "video" : "explanation",
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/explanation/task-video-page/video"]}>
      <Routes>
        <Route path="/explanation/:taskId/video" element={<SentenceExplanationVideoPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SentenceExplanationVideoPage", () => {
  beforeEach(() => {
    useHydratedTaskMock.mockReset();
    buildSentenceExplanationVideoSubtitleTrackMock.mockReset();
    exportSentenceExplanationVideoMp4Mock.mockReset();
    saveSentenceExplanationVideoMock.mockReset();
    syncSentenceExplanationVideoToSupabaseMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        fonts: [
          {
            fileName: "SmileySans-Oblique.ttf",
            label: "SmileySans-Oblique",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(URL, "createObjectURL", {
      writable: true,
      value: vi.fn(() => "blob:subtitle-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      writable: true,
      value: vi.fn(),
    });
  });

  it("renders the historical video page when a saved video exists even if the generation plan is incomplete", async () => {
    useHydratedTaskMock.mockReturnValue(buildTask({ withVideo: true }));

    renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(screen.getByText(/sentence-explanation-video skill/i)).toBeInTheDocument();
    expect(screen.getByText("Result")).toBeInTheDocument();
  });

  it("shows the unavailable page when no saved video exists and the generation plan is incomplete", async () => {
    useHydratedTaskMock.mockReturnValue(buildTask({ withVideo: false }));

    renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(screen.queryByText(/sentence-explanation-video skill/i)).not.toBeInTheDocument();
  });

  it("shows subtitle settings and does not auto-start video generation after entering the page", async () => {
    useHydratedTaskMock.mockReturnValue(buildTask({ withVideo: false, completePlan: true }));

    renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(screen.getByText("Subtitle Style")).toBeInTheDocument();
    expect(document.getElementById("subtitle-font")).toBeTruthy();
    expect(document.getElementById("subtitle-font-size")).toBeTruthy();
    expect(exportSentenceExplanationVideoMp4Mock).not.toHaveBeenCalled();
  });

  it("persists subtitle tracks when generating a new video", async () => {
    const task = buildTask({ withVideo: false, completePlan: true });
    const subtitleTrack = buildSubtitleTrack();

    useHydratedTaskMock.mockReturnValue(task);
    exportSentenceExplanationVideoMp4Mock.mockResolvedValue({
      blob: new Blob(["video"], { type: "video/mp4" }),
      objectUrl: "blob:generated-video",
      fileName: "explanation.mp4",
      mimeType: "video/mp4",
      durationSeconds: 12,
      plan: createSentenceExplanationVideoPlan(task, task.sentenceExplanation!.article!.article, task.sentenceExplanation!.tts!),
      subtitleTrack,
    });
    saveSentenceExplanationVideoMock.mockResolvedValue({
      success: true,
      synced: false,
    });

    renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole("button")[0]);

    await waitFor(() =>
      expect(saveSentenceExplanationVideoMock).toHaveBeenCalledWith(
        "task-video-page",
        expect.objectContaining({
          fileName: "explanation.mp4",
          subtitleTrack,
        }),
      ),
    );
    expect(screen.getByRole("button", { name: "Download SRT" })).toBeInTheDocument();
  });

  it("rebuilds the SRT download entry for legacy historical videos", async () => {
    const subtitleTrack = buildSubtitleTrack();

    buildSentenceExplanationVideoSubtitleTrackMock.mockResolvedValue(subtitleTrack);
    useHydratedTaskMock.mockReturnValue(buildTask({ withVideo: true, completePlan: true }));

    const { container } = renderPage();
    await waitFor(() => expect(buildSentenceExplanationVideoSubtitleTrackMock).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "Download SRT" })).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('track[kind="subtitles"]')).not.toBeNull());
  });

  it("restores the SRT download entry for historical videos", async () => {
    useHydratedTaskMock.mockReturnValue(buildTask({ withVideo: true, withSubtitleTrack: true }));

    const { container } = renderPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "Download SRT" })).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('track[kind="subtitles"]')).not.toBeNull());
  });
});
