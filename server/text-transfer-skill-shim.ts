import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { runPythonScript } from "./python-runner";
import { registerRuntimeSkill } from "./runtime-skill-registry";
import type { TextTransferRequest, TextTransferResult } from "../src/lib/text-transfer-contract";

const SKILL_NAME = "aifast-text-transfer-editor";
const PYTHON_SCRIPT_PATH = resolve(
  process.cwd(),
  ".claude/skills/aifast-text-transfer-editor/scripts/transform.py"
);
const DEFAULT_RATIO = "16:9";
const DEFAULT_SIZE = "2K";

let shimInstalled = false;

/**
 * Build a Claude-Code-like prompt envelope around the user's free-form request.
 * When structured text fields are available, keep the canonical skill hints too.
 */
export function buildTransferPrompt({
  prompt,
  refText,
  targetText,
  supplement,
}: Pick<TextTransferRequest, "prompt" | "refText" | "targetText" | "supplement">): string {
  const parts = [
    "Based on the two input images, recreate Image 2 (the target image) in its entirety,",
    "preserving all original visual elements (people, scenery, background).",
    "Then overlay a precise text block inspired by Image 1's text style.",
    "Match the font style, color, positioning, and overall layout from Image 1.",
  ];

  if (refText) {
    parts.push(`The original text from Image 1 was: ${refText}.`);
  }

  if (targetText) {
    parts.push(`Render the following modified text on Image 2: ${targetText}.`);
  }

  if (prompt) {
    parts.push(`User editing request: ${prompt}.`);
  }

  if (supplement) {
    parts.push(`Additional requirements: ${supplement}.`);
  }

  return parts.join(" ");
}

export function installTextTransferSkillShim() {
  if (shimInstalled) return;

  // Validate python is callable at startup
  try {
    const check = spawnSync("python", ["--version"], { encoding: "utf8", timeout: 5000 });
    if (check.error || check.status !== 0) {
      console.warn(
        `[text-transfer-shim] python not found or failed version check. ` +
          `The ${SKILL_NAME} skill will not be available. ` +
          `Error: ${check.error?.message ?? check.stderr}`
      );
      return;
    }
  } catch {
    console.warn(`[text-transfer-shim] Could not validate python. Skipping shim registration.`);
    return;
  }

  const handler = async (rawParams: unknown): Promise<TextTransferResult> => {
    const params = rawParams as Partial<TextTransferRequest>;

    if (typeof params.refImage !== "string" || !params.refImage) {
      throw new Error(`${SKILL_NAME}: missing refImage`);
    }
    if (typeof params.targetImage !== "string" || !params.targetImage) {
      throw new Error(`${SKILL_NAME}: missing targetImage`);
    }
    if (
      (typeof params.prompt !== "string" || !params.prompt.trim()) &&
      (typeof params.targetText !== "string" || !params.targetText.trim())
    ) {
      throw new Error(`${SKILL_NAME}: missing prompt`);
    }

    const prompt = buildTransferPrompt({
      prompt: params.prompt?.trim() ?? "",
      refText: params.refText?.trim() ?? "",
      targetText: params.targetText?.trim() ?? "",
      supplement: params.supplement?.trim() ?? "",
    });

    const ratio = typeof params.ratio === "string" ? params.ratio : DEFAULT_RATIO;

    return runPythonScript({
      scriptPath: PYTHON_SCRIPT_PATH,
      args: ["--prompt", prompt, "--ratio", ratio, "--size", DEFAULT_SIZE],
      extraImages: [
        { dataUrl: params.refImage, argName: "--ref" },
        { dataUrl: params.targetImage, argName: "--target" },
      ],
      tempPrefix: "english-flow-text-transfer-",
    });
  };

  registerRuntimeSkill(SKILL_NAME, handler);
  shimInstalled = true;
}
