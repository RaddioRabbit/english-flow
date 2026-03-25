import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { IMAGE_GENERATION_SKILL_NAME } from "./image-generation-skill";
import { registerRuntimeSkill } from "./runtime-skill-registry";

type AIFASTSkillParams = {
  prompt?: unknown;
  reference_image?: unknown;
  ratio?: unknown;
  size?: unknown;
};

type AIFASTSkillResult = {
  image_data_url: string;
};

const PYTHON_SCRIPT_PATH = resolve(process.cwd(), ".claude/skills/aifast-image-generation/scripts/generate_image.py");
const LEGACY_IMAGE_GENERATION_SKILL_NAME = "gemini-image-generation";
const DEFAULT_IMAGE_RATIO = "3:4";
const DEFAULT_IMAGE_SIZE = "1K";
let shimInstalled = false;

function inferExtensionFromMimeType(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/png":
    default:
      return ".png";
  }
}

function detectMimeType(buffer: Buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(Buffer.from("RIFF")) &&
    buffer.subarray(8, 12).equals(Buffer.from("WEBP"))
  ) {
    return "image/webp";
  }
  return "image/png";
}

function parseReferenceDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid reference image data URL.");
  }

  const [, mimeType, base64Data] = match;
  return {
    mimeType,
    buffer: Buffer.from(base64Data, "base64"),
  };
}

async function runPythonImageGenerator({
  prompt,
  referenceImage,
  ratio,
  size,
}: {
  prompt: string;
  referenceImage?: string;
  ratio: string;
  size: string;
}) {
  const tempDirectory = await mkdtemp(join(tmpdir(), "english-flow-aifast-image-"));
  const outputPath = join(tempDirectory, "generated-image.png");

  try {
    const args = [
      PYTHON_SCRIPT_PATH,
      "--prompt",
      prompt,
      "--output",
      outputPath,
      "--ratio",
      ratio,
      "--size",
      size,
    ];

    if (referenceImage) {
      const { mimeType, buffer } = parseReferenceDataUrl(referenceImage);
      const referencePath = join(tempDirectory, `reference${inferExtensionFromMimeType(mimeType)}`);
      await writeFile(referencePath, buffer);
      args.push("--reference-image", referencePath);
    }

    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolvePromise, reject) => {
      const subprocess = spawn("python", args, {
        cwd: process.cwd(),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      subprocess.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      subprocess.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      subprocess.on("error", reject);
      subprocess.on("close", (code) => {
        if (code === 0) {
          resolvePromise({ stdout, stderr });
          return;
        }

        reject(new Error(`AIFAST image generator failed with code ${code}: ${stderr || stdout}`));
      });
    });

    const outputBuffer = await readFile(outputPath);
    if (!outputBuffer.length) {
      throw new Error(`AIFAST image generator produced an empty output file. ${stderr || stdout}`.trim());
    }

    const mimeType = detectMimeType(outputBuffer);
    return {
      image_data_url: `data:${mimeType};base64,${outputBuffer.toString("base64")}`,
    } satisfies AIFASTSkillResult;
  } finally {
    await rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function installAIFASTImageSkillShim() {
  if (shimInstalled) {
    return;
  }

  const handler = async (rawParams: unknown) => {
    const params = rawParams as AIFASTSkillParams;
    const prompt = typeof params.prompt === "string" ? params.prompt.trim() : "";
    if (!prompt) {
      throw new Error(`Missing prompt for ${IMAGE_GENERATION_SKILL_NAME}.`);
    }

    return runPythonImageGenerator({
      prompt,
      referenceImage: typeof params.reference_image === "string" ? params.reference_image : undefined,
      ratio: typeof params.ratio === "string" ? params.ratio : DEFAULT_IMAGE_RATIO,
      size: typeof params.size === "string" ? params.size : DEFAULT_IMAGE_SIZE,
    });
  };

  registerRuntimeSkill(IMAGE_GENERATION_SKILL_NAME, handler);
  registerRuntimeSkill(LEGACY_IMAGE_GENERATION_SKILL_NAME, handler);

  shimInstalled = true;
}
