import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ImageInput = {
  dataUrl: string;
  argName: string; // e.g. "--reference-image" or "--ref" or "--target"
};

export type PythonRunnerOptions = {
  scriptPath: string;
  args: string[];
  extraImages?: ImageInput[];
  tempPrefix?: string;
};

export type PythonRunnerResult = {
  image_data_url: string;
};

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
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
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

export function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL.");
  }
  const [, mimeType, base64Data] = match;
  return { mimeType, buffer: Buffer.from(base64Data, "base64") };
}

export async function runPythonScript(options: PythonRunnerOptions): Promise<PythonRunnerResult> {
  const { scriptPath, args, extraImages = [], tempPrefix = "english-flow-python-" } = options;
  const tempDirectory = await mkdtemp(join(tmpdir(), tempPrefix));
  const outputPath = join(tempDirectory, "output.png");

  try {
    const allArgs = [...args, "--output", outputPath];

    for (const img of extraImages) {
      const { mimeType, buffer } = parseDataUrl(img.dataUrl);
      const imgPath = join(tempDirectory, `img-${img.argName.replace(/^-+/, "")}${inferExtensionFromMimeType(mimeType)}`);
      await writeFile(imgPath, buffer);
      allArgs.push(img.argName, imgPath);
    }

    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const subprocess = spawn("python", [scriptPath, ...allArgs], {
        cwd: process.cwd(),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      subprocess.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      subprocess.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      subprocess.on("error", reject);
      subprocess.on("close", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Python script failed (exit ${code}): ${stderr || stdout}`));
        }
      });
    });

    const outputBuffer = await readFile(outputPath);
    if (!outputBuffer.length) {
      throw new Error(`Python script produced empty output. ${stderr || stdout}`.trim());
    }

    const mimeType = detectMimeType(outputBuffer);
    return {
      image_data_url: `data:${mimeType};base64,${outputBuffer.toString("base64")}`,
    };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
