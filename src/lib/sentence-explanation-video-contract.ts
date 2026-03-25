import type { ModuleId } from "@/lib/task-store";

export type SentenceExplanationVideoAudioRole = "introduction" | "section" | "conclusion";

export interface SentenceExplanationVideoApiAudioSegment {
  role: SentenceExplanationVideoAudioRole;
  text: string;
  audioDataUrl: string;
  lineIndex?: number;
}

export interface SentenceExplanationVideoApiSubtitleCue {
  role: SentenceExplanationVideoAudioRole;
  text: string;
  lineIndex: number;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
}

export interface SentenceExplanationVideoSubtitleStyle {
  fontFileName?: string;
  fontSize: number;
  fontColor: string;
  x: number;
  y: number;
  outlineColor: string;
}

export interface SentenceExplanationVideoFontOption {
  fileName: string;
  label: string;
}

export interface SentenceExplanationVideoApiClip {
  moduleId: ModuleId;
  moduleName: string;
  imageDataUrl: string;
  durationSeconds: number;
  audioSegments: SentenceExplanationVideoApiAudioSegment[];
  subtitles?: SentenceExplanationVideoApiSubtitleCue[];
}

export interface SentenceExplanationVideoRequest {
  taskId: string;
  title: string;
  clips: SentenceExplanationVideoApiClip[];
  subtitleStyle?: SentenceExplanationVideoSubtitleStyle;
}

export interface SentenceExplanationVideoSubtitleCue {
  moduleId: ModuleId;
  moduleName: string;
  clipIndex: number;
  role: SentenceExplanationVideoAudioRole;
  lineIndex: number;
  text: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
}

export interface SentenceExplanationVideoSubtitleTrack {
  cues: SentenceExplanationVideoSubtitleCue[];
  srtText: string;
}
