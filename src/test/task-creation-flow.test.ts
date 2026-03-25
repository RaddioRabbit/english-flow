import { beforeEach, describe, expect, it } from "vitest";

import {
  createParsedTask,
  defaultReferenceImages,
  type TaskInput,
} from "@/lib/task-store";

function buildInput(): TaskInput {
  return {
    sentence: "It is a truth universally acknowledged.",
    bookName: "Pride and Prejudice",
    author: "Jane Austen",
    modules: ["translation", "grammar", "summary", "vocabulary", "ielts"],
    referenceImages: defaultReferenceImages(),
  };
}

describe("homepage task creation flow", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates a parsing task for the text-only flow", async () => {
    const task = await createParsedTask(buildInput());

    expect(task.status).toBe("parsing");
    expect(task.currentStage).toBe("parsing");
    expect(task.flowMode).toBe("text");
    expect(task.steps.some((step) => step.stage === "parsing" && step.status === "running")).toBe(true);
    expect(task.steps.every((step) => (step.stage === "generation" ? step.status === "pending" : true))).toBe(true);
  });
});
