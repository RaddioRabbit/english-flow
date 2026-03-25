import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadAssetDataMock } = vi.hoisted(() => ({
  loadAssetDataMock: vi.fn(),
}));

vi.mock("@/lib/browser-image-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/browser-image-store")>("@/lib/browser-image-store");
  return {
    ...actual,
    loadAssetData: loadAssetDataMock,
  };
});

import {
  defaultReferenceImages,
  hydrateHistoryPreviewTasks,
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
        phonetic: "/anchor/",
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

function buildTask(): Task {
  const now = "2026-03-24T00:00:00.000Z";

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

describe("hydrateHistoryPreviewTasks", () => {
  beforeEach(() => {
    loadAssetDataMock.mockReset();
  });

  it("hydrates only the first available generated image for history previews", async () => {
    loadAssetDataMock.mockResolvedValue({
      "image-translation": "data:image/png;base64,preview",
    });

    const [task] = await hydrateHistoryPreviewTasks([
      {
        ...buildTask(),
        generatedImages: {
          translation: {
            id: "image-translation",
            imageType: "translation",
            title: "translation image",
            subtitle: "translation subtitle",
            sourceText: "translation source",
            fileName: "translation.png",
            dataUrl: "",
            createdAt: "2026-03-24T00:00:00.000Z",
          },
          grammar: {
            id: "image-grammar",
            imageType: "grammar",
            title: "grammar image",
            subtitle: "grammar subtitle",
            sourceText: "grammar source",
            fileName: "grammar.png",
            dataUrl: "",
            createdAt: "2026-03-24T00:00:00.000Z",
          },
        },
      },
    ]);

    expect(loadAssetDataMock).toHaveBeenCalledTimes(1);
    expect(loadAssetDataMock).toHaveBeenCalledWith("generated-images", ["image-translation"]);
    expect(task.generatedImages.translation?.dataUrl).toBe("data:image/png;base64,preview");
    expect(task.generatedImages.grammar?.dataUrl).toBe("");
  });

  it("skips IndexedDB reads when the preview image already has a public url", async () => {
    const [task] = await hydrateHistoryPreviewTasks([
      {
        ...buildTask(),
        generatedImages: {
          translation: {
            id: "image-translation",
            imageType: "translation",
            title: "translation image",
            subtitle: "translation subtitle",
            sourceText: "translation source",
            fileName: "translation.png",
            dataUrl: "",
            publicUrl: "https://example.com/translation.png",
            createdAt: "2026-03-24T00:00:00.000Z",
          },
        },
      },
    ]);

    expect(loadAssetDataMock).not.toHaveBeenCalled();
    expect(task.generatedImages.translation?.publicUrl).toBe("https://example.com/translation.png");
  });
});
