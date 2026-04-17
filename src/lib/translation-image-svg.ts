import type { TextAnalysisVocabularyCard } from "./text-analysis-contract";
import {
  buildTranslationHighlights,
  stripTranslationHighlightMarkers,
  type TranslationHighlightMatch,
  type TranslationHighlightSpan,
} from "./translation-image-highlights";
import { prepareTranslationImagePanels } from "./translation-image-prompt";

// Re-export type for skill integration
export type { TranslationHighlightSpan, TranslationHighlightMatch };

export interface TranslationImageSvgInput {
  bookName: string;
  author?: string;
  originSentence: string;
  prompt1: string;
  prompt2: string;
  prompt3: string;
  prompt4: string;
  vocabulary: TextAnalysisVocabularyCard[];
  sceneImageDataUrl?: string;
}

// ─── Layout constants ────────────────────────────────────────────────────────
const SVG_W = 960;
const SVG_H = 1280;
const M = 16;                           // outer margin
const GAP = 12;                         // gap between panels
const PANEL_W = (SVG_W - M * 2 - GAP) / 2;   // 458
const PANEL_H = 330;
const ROW2_Y = M + PANEL_H + GAP;            // y of second panel row
const SCENE_Y = ROW2_Y + PANEL_H + GAP;      // y where scene image starts
const COL2_X = M + PANEL_W + GAP;            // x of right column

// ─── Visual constants ─────────────────────────────────────────────────────────
const C_BG = "#fbf2d5";
const C_PANEL = "#f5e6c8";
const C_BORDER = "#8b6914";
const C_TEXT = "#2d1a08";
const FONT = "Georgia,'Times New Roman','PingFang SC','Hiragino Sans GB','Microsoft YaHei',serif";

// ─── Font sizes ───────────────────────────────────────────────────────────────
const EN_MIN_FS = 18;
const EN_MAX_FS = 34;
const ZH_MIN_FS = 20;
const ZH_MAX_FS = 36;
const TEXT_PAD_X = Math.round(PANEL_W * 0.1);
const TEXT_PAD_Y = Math.round(PANEL_W * 0.1);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface TextSegment {
  text: string;
  color?: string;
}

function buildSegments(text: string, matches: TranslationHighlightMatch[]): TextSegment[] {
  if (!matches.length) return [{ text }];
  const segs: TextSegment[] = [];
  let cursor = 0;
  for (const m of [...matches].sort((a, b) => a.start - b.start)) {
    if (m.start > cursor) segs.push({ text: text.slice(cursor, m.start) });
    segs.push({ text: text.slice(m.start, m.end), color: m.color });
    cursor = m.end;
  }
  if (cursor < text.length) segs.push({ text: text.slice(cursor) });
  return segs;
}

// Estimated character width for word-wrap calculation
function charWidth(ch: string, fs: number, variant: "en" | "zh"): number {
  if (variant === "zh") {
    return /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(ch) ? fs : fs * 0.55;
  }
  if ("iIl1|!;:.,'\"()[]{}".includes(ch)) return fs * 0.28;
  if ("mMwW".includes(ch)) return fs * 0.72;
  if (ch === " ") return fs * 0.30;
  if (/[A-Z]/.test(ch)) return fs * 0.65;
  return fs * 0.52;
}

type LineToken = { text: string; color: string | null };

function measureLineWidth(line: LineToken[], fs: number, variant: "en" | "zh") {
  return line.reduce(
    (total, token) =>
      total +
      Array.from(token.text).reduce((tokenWidth, char) => tokenWidth + charWidth(char, fs, variant), 0),
    0,
  );
}

/**
 * Split text (with highlight matches) into lines that fit within maxW.
 * English: breaks at word boundaries.
 * Chinese: breaks at character boundaries.
 */
function buildLines(
  text: string,
  matches: TranslationHighlightMatch[],
  maxW: number,
  fs: number,
  variant: "en" | "zh",
): LineToken[][] {
  const segs = buildSegments(text, matches);
  const lines: LineToken[][] = [[]];
  let lw = 0;

  const addTok = (t: string, color: string | null) => {
    const cur = lines[lines.length - 1];
    const last = cur[cur.length - 1];
    if (last && last.color === color) {
      last.text += t;
    } else {
      cur.push({ text: t, color });
    }
  };

  const newLine = () => {
    // Trim trailing space from last token on the current line
    const cur = lines[lines.length - 1];
    if (cur.length > 0) {
      const last = cur[cur.length - 1];
      const trimmed = last.text.trimEnd();
      if (trimmed) last.text = trimmed;
      else cur.pop();
    }
    lines.push([]);
    lw = 0;
  };

  for (const seg of segs) {
    const color = seg.color ?? null;

    if (variant === "en") {
      // Split into word tokens (word + optional trailing space)
      const wordMatches = [...seg.text.matchAll(/\S+\s*/g)];
      const words = wordMatches.map((m) => m[0]);

      // Handle any leading whitespace in the segment
      const leadingSpace = seg.text.match(/^\s+/)?.[0];
      if (leadingSpace && lw > 0) {
        const sw = [...leadingSpace].reduce((s, c) => s + charWidth(c, fs, "en"), 0);
        if (lw + sw <= maxW) {
          addTok(leadingSpace, null);
          lw += sw;
        }
      }

      for (const word of words) {
        const ww = [...word].reduce((s, c) => s + charWidth(c, fs, "en"), 0);
        if (lw > 0 && lw + ww > maxW) {
          newLine();
          const tw = word.trimStart();
          const tww = [...tw].reduce((s, c) => s + charWidth(c, fs, "en"), 0);
          addTok(tw, color);
          lw = tww;
        } else {
          addTok(word, color);
          lw += ww;
        }
      }
    } else {
      // Chinese / mixed: character by character
      if (color) {
        const segmentWidth = Array.from(seg.text).reduce((sum, ch) => sum + charWidth(ch, fs, "zh"), 0);
        if (segmentWidth <= maxW) {
          if (lw > 0 && lw + segmentWidth > maxW) {
            newLine();
          }
          addTok(seg.text, color);
          lw += segmentWidth;
          continue;
        }
      }

      for (const ch of Array.from(seg.text)) {
        const w = charWidth(ch, fs, "zh");
        if (lw > 0 && lw + w > maxW) newLine();
        addTok(ch, color);
        lw += w;
      }
    }
  }

  return lines.filter((l) => l.length > 0);
}

function renderLines(
  lines: LineToken[][],
  x: number,
  startY: number,
  lh: number,
  fs: number,
): string {
  return lines
    .map((line, i) => {
      const y = startY + i * lh;
      const tspans = line
        .map((tok) => {
          if (tok.color) {
            return `<tspan fill="${escapeHtml(tok.color)}" text-decoration="underline">${escapeHtml(tok.text)}</tspan>`;
          }
          return `<tspan>${escapeHtml(tok.text)}</tspan>`;
        })
        .join("");
      return `<text x="${x}" y="${y}" text-anchor="start" font-family="${FONT}" font-size="${fs}" font-weight="600" fill="${C_TEXT}">${tspans}</text>`;
    })
    .join("\n    ");
}

function renderPanel(
  x: number,
  y: number,
  text: string,
  matches: TranslationHighlightMatch[],
  variant: "en" | "zh",
): string {
  const padX = TEXT_PAD_X;
  const padY = TEXT_PAD_Y;
  const innerW = PANEL_W - padX * 2;
  const innerH = PANEL_H - padY * 2;
  const minFs = variant === "en" ? EN_MIN_FS : ZH_MIN_FS;
  const maxFs = variant === "en" ? EN_MAX_FS : ZH_MAX_FS;

  let bestFit = {
    fs: minFs,
    lh: Math.round(minFs * (variant === "en" ? 1.5 : 1.45) * 10) / 10,
    lines: buildLines(text, matches, innerW, minFs, variant),
  };

  for (let candidate = maxFs; candidate >= minFs; candidate -= 1) {
    const lh = Math.round(candidate * (variant === "en" ? 1.5 : 1.45) * 10) / 10;
    const lines = buildLines(text, matches, innerW, candidate, variant);
    const totalTextH = lines.length * lh;
    const widestLine = lines.reduce(
      (maxWidth, line) => Math.max(maxWidth, measureLineWidth(line, candidate, variant)),
      0,
    );

    if (totalTextH <= innerH && widestLine <= innerW) {
      bestFit = { fs: candidate, lh, lines };
      break;
    }
  }

  const totalTextH = bestFit.lines.length * bestFit.lh;
  const startY = y + padY + (PANEL_H - padY * 2 - totalTextH) / 2 + bestFit.fs;
  const startX = x + padX;

  return `
    <rect x="${x}" y="${y}" width="${PANEL_W}" height="${PANEL_H}" rx="12" fill="${C_PANEL}" stroke="${C_BORDER}" stroke-width="2.5"/>
    <rect x="${x + 8}" y="${y + 8}" width="${PANEL_W - 16}" height="${PANEL_H - 16}" rx="7" fill="none" stroke="${C_BORDER}" stroke-width="1" opacity="0.5"/>
    ${renderLines(bestFit.lines, startX, startY, bestFit.lh, bestFit.fs)}`;
}

function renderScene(sceneImageDataUrl?: string): string {
  const x = M;
  const y = SCENE_Y;
  const w = SVG_W - M * 2;
  const h = SVG_H - SCENE_Y - M;

  if (!sceneImageDataUrl) {
    return `
    <defs>
      <linearGradient id="scene-fallback" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#2a2a4a"/>
        <stop offset="100%" stop-color="#1a2a3a"/>
      </linearGradient>
    </defs>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="url(#scene-fallback)"/>`;
  }

  return `
    <defs>
      <clipPath id="scene-clip">
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/>
      </clipPath>
    </defs>
    <image href="${escapeHtml(sceneImageDataUrl)}" x="${x}" y="${y}" width="${w}" height="${h}" clip-path="url(#scene-clip)" preserveAspectRatio="xMidYMid slice"/>`;
}

export function buildTranslationImageSvgDataUrl(input: TranslationImageSvgInput): string {
  const panels = prepareTranslationImagePanels({
    originSentence: input.originSentence,
    prompt1: input.prompt1,
    prompt2: input.prompt2,
    prompt3: input.prompt3,
    prompt4: input.prompt4,
  });

  const highlights = buildTranslationHighlights({
    ...panels,
    vocabulary: input.vocabulary,
  });

  const p1M = highlights.map((h) => h.english).filter((h) => h.panel === "prompt1");
  const p2M = highlights
    .map((h) => h.chinese)
    .filter((h): h is NonNullable<typeof h> => Boolean(h) && h!.panel === "prompt2");
  const p3M = highlights.map((h) => h.english).filter((h) => h.panel === "prompt3");
  const p4M = highlights
    .map((h) => h.chinese)
    .filter((h): h is NonNullable<typeof h> => Boolean(h) && h!.panel === "prompt4");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">
  <rect width="${SVG_W}" height="${SVG_H}" rx="24" fill="${C_BG}"/>
  ${renderPanel(M, M, stripTranslationHighlightMarkers(panels.prompt1), p1M, "en")}
  ${renderPanel(COL2_X, M, stripTranslationHighlightMarkers(panels.prompt2), p2M, "zh")}
  ${renderPanel(M, ROW2_Y, stripTranslationHighlightMarkers(panels.prompt3), p3M, "en")}
  ${renderPanel(COL2_X, ROW2_Y, stripTranslationHighlightMarkers(panels.prompt4), p4M, "zh")}
  ${renderScene(input.sceneImageDataUrl)}
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface TranslationImageSvgWithHighlightsInput {
  bookName: string;
  author?: string;
  originSentence: string;
  prompt1: string;
  prompt2: string;
  prompt3: string;
  prompt4: string;
  highlights: TranslationHighlightSpan[];
  sceneImageDataUrl?: string;
}

export function buildTranslationImageSvgDataUrlWithHighlights(
  input: TranslationImageSvgWithHighlightsInput,
): string {
  const panels = prepareTranslationImagePanels({
    originSentence: input.originSentence,
    prompt1: input.prompt1,
    prompt2: input.prompt2,
    prompt3: input.prompt3,
    prompt4: input.prompt4,
  });

  const { highlights } = input;

  const p1M = highlights.map((h) => h.english).filter((h) => h.panel === "prompt1");
  const p2M = highlights
    .map((h) => h.chinese)
    .filter((h): h is NonNullable<typeof h> => Boolean(h) && h!.panel === "prompt2");
  const p3M = highlights.map((h) => h.english).filter((h) => h.panel === "prompt3");
  const p4M = highlights
    .map((h) => h.chinese)
    .filter((h): h is NonNullable<typeof h> => Boolean(h) && h!.panel === "prompt4");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">
  <rect width="${SVG_W}" height="${SVG_H}" rx="24" fill="${C_BG}"/>
  ${renderPanel(M, M, stripTranslationHighlightMarkers(panels.prompt1), p1M, "en")}
  ${renderPanel(COL2_X, M, stripTranslationHighlightMarkers(panels.prompt2), p2M, "zh")}
  ${renderPanel(M, ROW2_Y, stripTranslationHighlightMarkers(panels.prompt3), p3M, "en")}
  ${renderPanel(COL2_X, ROW2_Y, stripTranslationHighlightMarkers(panels.prompt4), p4M, "zh")}
  ${renderScene(input.sceneImageDataUrl)}
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
