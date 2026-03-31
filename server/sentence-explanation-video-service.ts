import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

import ffmpegStatic from "ffmpeg-static";

import type {
  SentenceExplanationVideoAudioRole,
  SentenceExplanationVideoFontOption,
  SentenceExplanationVideoRequest,
  SentenceExplanationVideoSubtitleStyle,
} from "../src/lib/sentence-explanation-video-contract";

const VIDEO_WIDTH = 960;
const VIDEO_HEIGHT = 1280;
const VIDEO_FPS = 30;
const FINAL_AUDIO_BITRATE = "192k";
const FONT_DIRECTORY = resolve(process.cwd(), "font");
const SUPPORTED_FONT_EXTENSIONS = new Set([".ttf", ".otf", ".ttc"]);

interface ResolvedSubtitleStyle {
  fontFileName?: string;
  fontSize: number;
  fontColor: string;
  x: number;
  y: number;
  outlineColor: string;
  borderWidth: number;
}

interface ClipSubtitleJsonLine {
  segmentIndex: number;
  segmentKey: string;
  role: SentenceExplanationVideoAudioRole;
  lineIndex: number;
  text: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
}

interface ClipSubtitleJsonDocument {
  clipIndex: number;
  moduleId: SentenceExplanationVideoRequest["clips"][number]["moduleId"];
  moduleName: string;
  durationSeconds: number;
  lines: ClipSubtitleJsonLine[];
  srtText: string;
}

interface VideoSubtitleJsonCue extends ClipSubtitleJsonLine {
  clipIndex: number;
  moduleId: SentenceExplanationVideoRequest["clips"][number]["moduleId"];
  moduleName: string;
  globalStartSeconds: number;
  globalEndSeconds: number;
}

interface VideoSubtitleJsonDocument {
  taskId: string;
  title: string;
  durationSeconds: number;
  clips: ClipSubtitleJsonDocument[];
  cues: VideoSubtitleJsonCue[];
  srtText: string;
}

function sanitizeFileNamePart(value: string) {
  return value.replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim();
}

function buildVideoFileName(title: string) {
  const baseName = sanitizeFileNamePart(title || "sentence explanation");
  return `${baseName || "sentence explanation"}.mp4`;
}

export async function listSentenceExplanationVideoFonts(): Promise<SentenceExplanationVideoFontOption[]> {
  try {
    const entries = await readdir(FONT_DIRECTORY, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && SUPPORTED_FONT_EXTENSIONS.has(extname(entry.name).toLowerCase()))
      .map((entry) => ({
        fileName: entry.name,
        label: entry.name.replace(extname(entry.name), ""),
      }))
      .sort((left, right) => left.label.localeCompare(right.label, "en"));
  } catch {
    return [];
  }
}

function normalizeHexColor(value: string | undefined, fallback: string) {
  const normalized = (value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : fallback;
}

function normalizePixelOffset(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

function clampSubtitleOffset(offset: number, viewportSize: number, fontSize: number) {
  const safeHalfRange = Math.max(0, Math.floor(viewportSize / 2) - Math.max(fontSize, 1));
  return Math.max(-safeHalfRange, Math.min(safeHalfRange, offset));
}

function resolveSubtitleStyle(
  inputStyle: SentenceExplanationVideoSubtitleStyle | undefined,
  availableFonts: SentenceExplanationVideoFontOption[],
): ResolvedSubtitleStyle {
  const selectedFont =
    availableFonts.find((font) => font.fileName === inputStyle?.fontFileName) ??
    availableFonts[0] ??
    null;
  const fontSize =
    typeof inputStyle?.fontSize === "number" && Number.isFinite(inputStyle.fontSize) && inputStyle.fontSize > 0
      ? Math.round(inputStyle.fontSize)
      : 10;
  const normalizedX = normalizePixelOffset(inputStyle?.x);
  const normalizedY = normalizePixelOffset(inputStyle?.y);

  return {
    fontFileName: selectedFont?.fileName,
    fontSize,
    fontColor: normalizeHexColor(inputStyle?.fontColor, "#ffffff"),
    x: clampSubtitleOffset(normalizedX, VIDEO_WIDTH, fontSize),
    y: clampSubtitleOffset(normalizedY, VIDEO_HEIGHT, fontSize),
    outlineColor: normalizeHexColor(inputStyle?.outlineColor, "#000000"),
    borderWidth: Math.max(1, Math.round(fontSize / 10)),
  };
}

async function loadMediaSource(mediaSource: string) {
  const trimmedSource = mediaSource.trim();
  if (!trimmedSource) {
    throw new Error("Video media source is empty.");
  }

  if (!trimmedSource.startsWith("data:") && !/^https?:\/\//i.test(trimmedSource)) {
    throw new Error("Video media source must be a data URL or an http(s) URL.");
  }

  const response = await fetch(trimmedSource);
  if (!response.ok) {
    throw new Error(`Failed to download video media source. HTTP ${response.status}.`);
  }

  const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!mimeType) {
    throw new Error("Video media source is missing a MIME type.");
  }

  return {
    mimeType,
    buffer: Buffer.from(await response.arrayBuffer()),
  };
}

function getExtensionFromMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase();

  if (normalized === "image/png") return "png";
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/webp") return "webp";
  if (normalized === "audio/mpeg" || normalized === "audio/mp3") return "mp3";
  if (normalized === "audio/wav" || normalized === "audio/x-wav") return "wav";
  if (normalized === "audio/mp4" || normalized === "audio/aac") return "m4a";

  throw new Error(`Unsupported media type: ${mimeType}`);
}

function normalizeConcatPath(filePath: string) {
  return resolve(filePath).replace(/\\/g, "/");
}

function runFfmpeg(args: string[], cwd?: string) {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const ffmpegPath = ffmpegStatic || process.env.FFMPEG_BIN;
    if (!ffmpegPath) {
      rejectPromise(new Error("Missing ffmpeg binary. Cannot export MP4."));
      return;
    }

    const child = spawn(ffmpegPath, args, {
      cwd,
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

async function writeMediaSourceToFile(directory: string, fileName: string, mediaSource: string) {
  const { mimeType, buffer } = await loadMediaSource(mediaSource);
  const extension = getExtensionFromMimeType(mimeType);
  const filePath = join(directory, `${fileName}.${extension}`);
  await writeFile(filePath, buffer);
  return filePath;
}

async function getAudioDuration(audioFile: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = ffmpegStatic || process.env.FFMPEG_BIN;
    if (!ffmpegPath) {
      reject(new Error("Missing ffmpeg binary."));
      return;
    }

    const child = spawn(ffmpegPath, ["-i", audioFile], {
      windowsHide: true,
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", () => {
      // FFmpeg outputs duration info to stderr
      const durationMatch = /Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/.exec(stderr);
      if (durationMatch) {
        const hours = Number.parseInt(durationMatch[1], 10);
        const minutes = Number.parseInt(durationMatch[2], 10);
        const seconds = Number.parseFloat(durationMatch[3]);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        resolve(totalSeconds);
        return;
      }

      // If we can't parse duration, reject with error
      reject(new Error("Failed to get audio duration from ffmpeg output."));
    });
  });
}

async function concatAudioFiles(directory: string, clipIndex: number, audioFiles: string[]) {
  const outputPath = join(directory, `clip-${clipIndex + 1}-audio.m4a`);

  if (audioFiles.length === 1) {
    await runFfmpeg([
      "-y",
      "-i",
      audioFiles[0],
      "-vn",
      "-c:a",
      "aac",
      "-b:a",
      FINAL_AUDIO_BITRATE,
      "-ar",
      "44100",
      "-ac",
      "2",
      outputPath,
    ]);
    return outputPath;
  }

  const concatListPath = join(directory, `clip-${clipIndex + 1}-audio-list.txt`);
  await writeFile(
    concatListPath,
    audioFiles.map((filePath) => `file '${normalizeConcatPath(filePath)}'`).join("\n"),
    "utf8",
  );

  await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-vn",
    "-c:a",
    "aac",
    "-b:a",
    FINAL_AUDIO_BITRATE,
    "-ar",
    "44100",
    "-ac",
    "2",
    outputPath,
  ]);

  return outputPath;
}

function escapeFilterValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function normalizeSubtitleCueText(value: string | undefined) {
  return (value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function formatSrtTimestamp(seconds: number) {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

function buildSrtText<T extends { text: string; startSeconds: number; endSeconds: number }>(lines: T[]) {
  return lines
    .map((line, index) => {
      const text = normalizeSubtitleCueText(line.text);
      return `${index + 1}\n${formatSrtTimestamp(line.startSeconds)} --> ${formatSrtTimestamp(line.endSeconds)}\n${text}`;
    })
    .join("\n\n");
}

function buildClipSubtitleJsonDocument(
  clipIndex: number,
  clip: SentenceExplanationVideoRequest["clips"][number],
): ClipSubtitleJsonDocument {
  const lines = (clip.subtitles ?? [])
    .map((subtitle, segmentIndex) => {
      const text = normalizeSubtitleCueText(subtitle.text);
      if (!text) {
        return null;
      }

      const role = subtitle.role ?? "section";
      const lineIndex = typeof subtitle.lineIndex === "number" ? subtitle.lineIndex : segmentIndex;

      return {
        segmentIndex,
        segmentKey: `${role}:${lineIndex}`,
        role,
        lineIndex,
        text,
        startSeconds: subtitle.startSeconds,
        endSeconds: subtitle.endSeconds,
        durationSeconds: subtitle.durationSeconds,
      } satisfies ClipSubtitleJsonLine;
    })
    .filter((line): line is ClipSubtitleJsonLine => Boolean(line));

  return {
    clipIndex,
    moduleId: clip.moduleId,
    moduleName: clip.moduleName,
    durationSeconds: clip.durationSeconds,
    lines,
    srtText: buildSrtText(lines),
  };
}

function buildVideoSubtitleJsonDocument(input: SentenceExplanationVideoRequest): VideoSubtitleJsonDocument {
  const clips = input.clips.map((clip, clipIndex) => buildClipSubtitleJsonDocument(clipIndex, clip));
  let timelineCursor = 0;
  const cues: VideoSubtitleJsonCue[] = [];

  clips.forEach((clip) => {
    clip.lines.forEach((line) => {
      cues.push({
        ...line,
        clipIndex: clip.clipIndex,
        moduleId: clip.moduleId,
        moduleName: clip.moduleName,
        globalStartSeconds: timelineCursor + line.startSeconds,
        globalEndSeconds: timelineCursor + line.endSeconds,
      });
    });

    timelineCursor += clip.durationSeconds;
  });

  return {
    taskId: input.taskId,
    title: input.title,
    durationSeconds: input.clips.reduce((total, clip) => total + clip.durationSeconds, 0),
    clips,
    cues,
    srtText: buildSrtText(
      cues.map((cue) => ({
        text: cue.text,
        startSeconds: cue.globalStartSeconds,
        endSeconds: cue.globalEndSeconds,
      })),
    ),
  };
}

function hexToDrawtextColor(value: string) {
  return `0x${value.replace(/^#/, "").toUpperCase()}`;
}

function buildDrawtextFilter(
  textFileName: string,
  startSeconds: number,
  endSeconds: number,
  style: ResolvedSubtitleStyle,
  fontFileName?: string,
) {
  const parts = [
    `textfile='${escapeFilterValue(textFileName)}'`,
    fontFileName ? `fontfile='${escapeFilterValue(fontFileName)}'` : null,
    `fontsize=${style.fontSize}`,
    `fontcolor=${hexToDrawtextColor(style.fontColor)}`,
    `bordercolor=${hexToDrawtextColor(style.outlineColor)}`,
    `borderw=${style.borderWidth}`,
    "fix_bounds=1",
    `x=(w-text_w)/2+${style.x}`,
    `y=(h-text_h)/2+${style.y}`,
    `enable='between(t,${startSeconds.toFixed(3)},${endSeconds.toFixed(3)})'`,
  ].filter(Boolean);

  return `drawtext=${parts.join(":")}`;
}

async function prepareClipSubtitleArtifacts(
  directory: string,
  document: ClipSubtitleJsonDocument,
) {
  if (!document.lines.length) {
    return null;
  }

  const files: string[] = [];
  const jsonFileName = `clip-${document.clipIndex + 1}-subtitles.json`;
  const srtFileName = `clip-${document.clipIndex + 1}-subtitles.srt`;

  await writeFile(join(directory, jsonFileName), JSON.stringify(document, null, 2), "utf8");
  await writeFile(join(directory, srtFileName), document.srtText, "utf8");

  for (let index = 0; index < document.lines.length; index += 1) {
    const fileName = `clip-${document.clipIndex + 1}-subtitle-${index + 1}.txt`;
    const filePath = join(directory, fileName);
    await writeFile(filePath, document.lines[index].text, "utf8");
    files.push(fileName);
  }

  return {
    jsonFileName,
    srtFileName,
    textFiles: files,
  };
}

async function prepareVideoSubtitleArtifacts(directory: string, input: SentenceExplanationVideoRequest) {
  const document = buildVideoSubtitleJsonDocument(input);
  if (!document.cues.length) {
    return null;
  }

  const jsonPath = join(directory, "sentence-explanation-subtitles.json");
  const srtPath = join(directory, "sentence-explanation-subtitles.srt");
  await writeFile(jsonPath, JSON.stringify(document, null, 2), "utf8");
  await writeFile(srtPath, document.srtText, "utf8");

  return {
    document,
    jsonPath,
    srtPath,
  };
}

async function muxVideoSubtitleTrack(directory: string, videoPath: string, subtitleSrtPath: string) {
  const outputPath = join(directory, "sentence-explanation-with-subtitles.mp4");
  await runFfmpeg([
    "-y",
    "-i",
    videoPath,
    "-i",
    subtitleSrtPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-map",
    "1:0",
    "-c:v",
    "copy",
    "-c:a",
    "copy",
    "-c:s",
    "mov_text",
    "-metadata:s:s:0",
    "language=eng",
    "-metadata:s:s:0",
    "handler_name=English Flow SRT",
    "-movflags",
    "+faststart",
    outputPath,
  ]);

  return outputPath;
}

async function createClipVideo(
  directory: string,
  clipIndex: number,
  imageFile: string,
  audioFile: string,
  requestedDuration: number,
  actualDuration: number,
  moduleId: SentenceExplanationVideoRequest["clips"][number]["moduleId"],
  moduleName: string,
  subtitles: SentenceExplanationVideoRequest["clips"][number]["subtitles"],
  subtitleStyle: ResolvedSubtitleStyle,
  fontFileName?: string,
) {
  const outputPath = join(directory, `clip-${clipIndex + 1}.mp4`);
  const filters = [
    `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=white`,
    "format=yuv420p",
  ];

  if (!requestedDuration) {
    throw new Error(`Clip ${clipIndex + 1} has an invalid duration.`);
  }

  // 根据实际音频时长调整字幕时间
  const durationRatio = actualDuration / requestedDuration;

  if (subtitles?.length) {
    const adjustedSubtitles = subtitles.map((sub) => ({
      ...sub,
      startSeconds: sub.startSeconds * durationRatio,
      endSeconds: sub.endSeconds * durationRatio,
      durationSeconds: sub.durationSeconds * durationRatio,
    }));

    const subtitleDocument = buildClipSubtitleJsonDocument(clipIndex, {
      moduleId,
      moduleName,
      imageDataUrl: imageFile,
      durationSeconds: actualDuration,
      audioSegments: [],
      subtitles: adjustedSubtitles,
    });
    const subtitleArtifacts = await prepareClipSubtitleArtifacts(directory, subtitleDocument);
    subtitleArtifacts?.textFiles.forEach((textFileName, index) => {
      const cue = subtitleDocument.lines[index];
      if (!cue) {
        return;
      }

      filters.push(
        buildDrawtextFilter(textFileName, cue.startSeconds, cue.endSeconds, subtitleStyle, fontFileName),
      );
    });
  }

  await runFfmpeg(
    [
      "-y",
      "-loop",
      "1",
      "-framerate",
      String(VIDEO_FPS),
      "-i",
      imageFile,
      "-i",
      audioFile,
      "-vf",
      filters.join(","),
      "-r",
      String(VIDEO_FPS),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-tune",
      "stillimage",
      "-c:a",
      "aac",
      "-b:a",
      FINAL_AUDIO_BITRATE,
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-shortest",
      outputPath,
    ],
    directory,
  );

  return outputPath;
}

async function concatClipVideos(directory: string, clipVideos: string[]) {
  const concatListPath = join(directory, "video-list.txt");
  await writeFile(
    concatListPath,
    clipVideos.map((filePath) => `file '${normalizeConcatPath(filePath)}'`).join("\n"),
    "utf8",
  );

  const outputPath = join(directory, "sentence-explanation.mp4");
  await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-b:a",
    FINAL_AUDIO_BITRATE,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ]);

  return outputPath;
}

async function copySelectedFontToDirectory(directory: string, fontFileName?: string) {
  if (!fontFileName) {
    return undefined;
  }

  const sourcePath = join(FONT_DIRECTORY, fontFileName);
  const targetPath = join(directory, basename(fontFileName));
  await copyFile(sourcePath, targetPath);
  return basename(targetPath);
}

interface ClipActualDuration {
  clipIndex: number;
  requestedDuration: number;
  actualDuration: number;
}

function buildVideoSubtitleJsonDocumentWithActualDurations(
  input: SentenceExplanationVideoRequest,
  actualDurations: ClipActualDuration[],
): VideoSubtitleJsonDocument {
  const clips = input.clips.map((clip, clipIndex) => {
    const actualDuration = actualDurations.find((d) => d.clipIndex === clipIndex);
    const durationRatio = actualDuration ? actualDuration.actualDuration / actualDuration.requestedDuration : 1;

    // 根据实际时长比例调整字幕时间
    const adjustedSubtitles = (clip.subtitles ?? []).map((sub) => ({
      ...sub,
      startSeconds: sub.startSeconds * durationRatio,
      endSeconds: sub.endSeconds * durationRatio,
      durationSeconds: sub.durationSeconds * durationRatio,
    }));

    return buildClipSubtitleJsonDocument(clipIndex, {
      ...clip,
      durationSeconds: actualDuration?.actualDuration ?? clip.durationSeconds,
      subtitles: adjustedSubtitles,
    });
  });

  let timelineCursor = 0;
  const cues: VideoSubtitleJsonCue[] = [];

  clips.forEach((clip) => {
    clip.lines.forEach((line) => {
      cues.push({
        ...line,
        clipIndex: clip.clipIndex,
        moduleId: clip.moduleId,
        moduleName: clip.moduleName,
        globalStartSeconds: timelineCursor + line.startSeconds,
        globalEndSeconds: timelineCursor + line.endSeconds,
      });
    });

    timelineCursor += clip.durationSeconds;
  });

  return {
    taskId: input.taskId,
    title: input.title,
    durationSeconds: actualDurations.reduce((total, d) => total + d.actualDuration, 0),
    clips,
    cues,
    srtText: buildSrtText(
      cues.map((cue) => ({
        text: cue.text,
        startSeconds: cue.globalStartSeconds,
        endSeconds: cue.globalEndSeconds,
      })),
    ),
  };
}

async function prepareVideoSubtitleArtifactsWithActualDurations(
  directory: string,
  input: SentenceExplanationVideoRequest,
  actualDurations: ClipActualDuration[],
) {
  const document = buildVideoSubtitleJsonDocumentWithActualDurations(input, actualDurations);
  if (!document.cues.length) {
    return null;
  }

  const jsonPath = join(directory, "sentence-explanation-subtitles.json");
  const srtPath = join(directory, "sentence-explanation-subtitles.srt");
  await writeFile(jsonPath, JSON.stringify(document, null, 2), "utf8");
  await writeFile(srtPath, document.srtText, "utf8");

  return {
    document,
    jsonPath,
    srtPath,
  };
}

export async function generateSentenceExplanationVideoMp4(input: SentenceExplanationVideoRequest) {
  if (!input.taskId?.trim()) {
    throw new Error("Missing task ID. Cannot generate MP4.");
  }

  if (!input.clips?.length) {
    throw new Error("Missing video clips. Cannot generate MP4.");
  }

  const availableFonts = await listSentenceExplanationVideoFonts();
  const subtitleStyle = resolveSubtitleStyle(input.subtitleStyle, availableFonts);
  const tempDirectory = await mkdtemp(join(tmpdir(), "sentence-explanation-video-"));

  try {
    const fontFileName = await copySelectedFontToDirectory(tempDirectory, subtitleStyle.fontFileName);
    const clipVideos: string[] = [];
    const actualDurations: ClipActualDuration[] = [];

    for (let clipIndex = 0; clipIndex < input.clips.length; clipIndex += 1) {
      const clip = input.clips[clipIndex];
      if (!clip.imageDataUrl?.trim()) {
        throw new Error(`Clip ${clipIndex + 1} is missing an image source.`);
      }

      if (!clip.audioSegments?.length) {
        throw new Error(`Clip ${clipIndex + 1} is missing audio segments.`);
      }

      if (!Number.isFinite(clip.durationSeconds) || clip.durationSeconds <= 0) {
        throw new Error(`Clip ${clipIndex + 1} has an invalid duration.`);
      }

      const imageFile = await writeMediaSourceToFile(tempDirectory, `clip-${clipIndex + 1}-image`, clip.imageDataUrl);
      const audioFiles: string[] = [];

      for (let audioIndex = 0; audioIndex < clip.audioSegments.length; audioIndex += 1) {
        const audioSegment = clip.audioSegments[audioIndex];
        if (!audioSegment.audioDataUrl?.trim()) {
          throw new Error(`Clip ${clipIndex + 1} audio segment ${audioIndex + 1} is missing.`);
        }

        audioFiles.push(
          await writeMediaSourceToFile(
            tempDirectory,
            `clip-${clipIndex + 1}-audio-${audioIndex + 1}`,
            audioSegment.audioDataUrl,
          ),
        );
      }

      const mergedAudio = await concatAudioFiles(tempDirectory, clipIndex, audioFiles);
      const actualAudioDuration = await getAudioDuration(mergedAudio);

      actualDurations.push({
        clipIndex,
        requestedDuration: clip.durationSeconds,
        actualDuration: actualAudioDuration,
      });

      clipVideos.push(
        await createClipVideo(
          tempDirectory,
          clipIndex,
          imageFile,
          mergedAudio,
          clip.durationSeconds,
          actualAudioDuration,
          clip.moduleId,
          clip.moduleName,
          clip.subtitles,
          subtitleStyle,
          fontFileName,
        ),
      );
    }

    const outputVideoPath = await concatClipVideos(tempDirectory, clipVideos);
    const videoSubtitleArtifacts = await prepareVideoSubtitleArtifactsWithActualDurations(
      tempDirectory,
      input,
      actualDurations,
    );
    const finalVideoPath = videoSubtitleArtifacts
      ? await muxVideoSubtitleTrack(tempDirectory, outputVideoPath, videoSubtitleArtifacts.srtPath)
      : outputVideoPath;
    const buffer = await readFile(finalVideoPath);

    if (!buffer.length) {
      throw new Error("Exported MP4 is empty.");
    }

    return {
      buffer,
      fileName: buildVideoFileName(input.title || "sentence explanation"),
      mimeType: "video/mp4",
    };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
