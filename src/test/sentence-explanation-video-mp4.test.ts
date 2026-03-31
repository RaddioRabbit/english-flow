// @vitest-environment node

import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ffmpegStatic from "ffmpeg-static";
import { afterEach, describe, expect, it } from "vitest";

import { generateSentenceExplanationVideoMp4 } from "../../server/sentence-explanation-video-service";

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    if (!ffmpegStatic) {
      rejectPromise(new Error("ffmpeg-static is unavailable."));
      return;
    }

    const child = spawn(ffmpegStatic, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

async function createSilentMp3(directory: string, fileName: string, durationSeconds: number) {
  const audioPath = join(directory, `${fileName}.mp3`);

  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t",
    String(durationSeconds),
    "-q:a",
    "9",
    "-acodec",
    "libmp3lame",
    audioPath,
  ]);

  const buffer = await readFile(audioPath);
  return `data:audio/mpeg;base64,${buffer.toString("base64")}`;
}

async function createPngFile(directory: string, fileName: string) {
  const imagePath = join(directory, `${fileName}.png`);

  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=white:s=960x1280",
    "-frames:v",
    "1",
    imagePath,
  ]);

  return imagePath;
}

async function createPngDataUrl(directory: string, fileName: string) {
  const imagePath = await createPngFile(directory, fileName);
  const buffer = await readFile(imagePath);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function extractFirstSubtitleTrack(directory: string, videoBuffer: Buffer) {
  const videoPath = join(directory, "exported.mp4");
  const subtitlePath = join(directory, "exported.srt");

  await writeFile(videoPath, videoBuffer);
  await runFfmpeg([
    "-y",
    "-i",
    videoPath,
    "-map",
    "0:s:0",
    "-c:s",
    "srt",
    subtitlePath,
  ]);

  return readFile(subtitlePath, "utf8");
}

function listen(server: Server) {
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to read test server address."));
        return;
      }

      resolve(address.port);
    });
  });
}

async function probeDuration(filePath: string) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn("/opt/homebrew/bin/ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Number(stdout.trim()));
        return;
      }

      reject(new Error(stderr.trim() || `ffprobe exited with code ${code}`));
    });
  });
}

async function extractFirstAudioTrackDuration(directory: string, videoBuffer: Buffer) {
  const videoPath = join(directory, "exported-audio-check.mp4");
  const audioPath = join(directory, "exported-audio-check.m4a");

  await writeFile(videoPath, videoBuffer);
  await runFfmpeg([
    "-y",
    "-i",
    videoPath,
    "-map",
    "0:a:0",
    "-c:a",
    "copy",
    audioPath,
  ]);

  return probeDuration(audioPath);
}

describe("generateSentenceExplanationVideoMp4", () => {
  let tempDirectory = "";
  let imageServer: Server | null = null;

  afterEach(async () => {
    if (imageServer) {
      await new Promise<void>((resolve, reject) => {
        imageServer?.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      imageServer = null;
    }

    if (!tempDirectory) {
      return;
    }

    await rm(tempDirectory, { recursive: true, force: true });
    tempDirectory = "";
  });

  it(
    "returns a non-empty mp4 buffer and .mp4 download name",
    async () => {
      tempDirectory = await mkdtemp(join(tmpdir(), "sentence-explanation-video-test-"));

      const introAudio = await createSilentMp3(tempDirectory, "intro", 0.4);
      const sectionAudio = await createSilentMp3(tempDirectory, "section", 0.5);
      const outroAudio = await createSilentMp3(tempDirectory, "outro", 0.4);
      const imageDataUrl = await createPngDataUrl(tempDirectory, "frame");

      const result = await generateSentenceExplanationVideoMp4({
        taskId: "task-video-mp4",
        title: "Pride and Prejudice sentence explanation",
        clips: [
          {
            moduleId: "translation",
            moduleName: "Sentence Translation",
            imageDataUrl,
            durationSeconds: 0.9,
            audioSegments: [
              {
                role: "introduction",
                text: "Welcome to today's sentence explanation.",
                audioDataUrl: introAudio,
                lineIndex: 0,
              },
              {
                role: "section",
                text: "Let's begin with the translation card.",
                audioDataUrl: sectionAudio,
                lineIndex: 1,
              },
            ],
            subtitles: [
              {
                role: "introduction",
                text: "Welcome to today's sentence explanation.",
                lineIndex: 0,
                startSeconds: 0,
                endSeconds: 0.4,
                durationSeconds: 0.4,
              },
              {
                role: "section",
                text: "Let's begin with the translation card.",
                lineIndex: 1,
                startSeconds: 0.4,
                endSeconds: 0.9,
                durationSeconds: 0.5,
              },
            ],
          },
          {
            moduleId: "ielts",
            moduleName: "IELTS Tips",
            imageDataUrl,
            durationSeconds: 0.4,
            audioSegments: [
              {
                role: "conclusion",
                text: "That is the closing summary for today.",
                audioDataUrl: outroAudio,
                lineIndex: 0,
              },
            ],
            subtitles: [
              {
                role: "conclusion",
                text: "That is the closing summary for today.",
                lineIndex: 0,
                startSeconds: 0,
                endSeconds: 0.4,
                durationSeconds: 0.4,
              },
            ],
          },
        ],
      });

      expect(result.mimeType).toBe("video/mp4");
      expect(result.fileName).toBe("Pride and Prejudice sentence explanation.mp4");
      expect(result.buffer.length).toBeGreaterThan(1024);
      expect(result.buffer.subarray(4, 8).toString("ascii")).toBe("ftyp");

      const subtitleTrack = await extractFirstSubtitleTrack(tempDirectory, result.buffer);
      expect(subtitleTrack).toContain("Welcome to today's sentence explanation.");
      expect(subtitleTrack).toContain("Let's begin with the translation card.");
      expect(subtitleTrack).toContain("That is the closing summary for today.");

      const audioDuration = await extractFirstAudioTrackDuration(tempDirectory, result.buffer);
      expect(audioDuration).toBeGreaterThan(1.1);
      expect(audioDuration).toBeLessThan(1.8);
    },
    60_000,
  );

  it(
    "accepts a remote bitmap image URL in the clip payload",
    async () => {
      tempDirectory = await mkdtemp(join(tmpdir(), "sentence-explanation-video-test-"));

      const imagePath = await createPngFile(tempDirectory, "remote-frame");
      const imageBuffer = await readFile(imagePath);
      const audioDataUrl = await createSilentMp3(tempDirectory, "single-audio", 0.6);

      imageServer = createServer((req, res) => {
        if (req.url !== "/frame.png") {
          res.statusCode = 404;
          res.end("not found");
          return;
        }

        res.statusCode = 200;
        res.setHeader("content-type", "image/png");
        res.end(imageBuffer);
      });

      const port = await listen(imageServer);
      const imageUrl = `http://127.0.0.1:${port}/frame.png`;

      const result = await generateSentenceExplanationVideoMp4({
        taskId: "task-video-remote-image",
        title: "Remote image clip",
        clips: [
          {
            moduleId: "translation",
            moduleName: "Sentence Translation",
            imageDataUrl: imageUrl,
            durationSeconds: 0.6,
            audioSegments: [
              {
                role: "section",
                text: "Remote image section.",
                audioDataUrl,
              },
            ],
          },
        ],
      });

      expect(result.mimeType).toBe("video/mp4");
      expect(result.fileName).toBe("Remote image clip.mp4");
      expect(result.buffer.length).toBeGreaterThan(1024);
    },
    60_000,
  );
});
