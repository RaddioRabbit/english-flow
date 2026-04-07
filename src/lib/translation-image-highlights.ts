import type { TextAnalysisVocabularyCard } from "./text-analysis-contract";

export type TranslationEnglishPanelId = "prompt1" | "prompt3";
export type TranslationChinesePanelId = "prompt2" | "prompt4";
export type TranslationPanelId = TranslationEnglishPanelId | TranslationChinesePanelId;

export interface TranslationHighlightMatch {
  panel: TranslationPanelId;
  text: string;
  start: number;
  end: number;
  color: string;
}

export interface TranslationHighlightSpan {
  id: string;
  color: string;
  word: string;
  english: TranslationHighlightMatch & { panel: TranslationEnglishPanelId };
  chinese?: TranslationHighlightMatch & { panel: TranslationChinesePanelId };
}

export interface BuildTranslationHighlightsInput {
  prompt1: string;
  prompt2: string;
  prompt3: string;
  prompt4: string;
  vocabulary: TextAnalysisVocabularyCard[];
}

const HIGHLIGHT_COLORS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#db2777"];
const SEMANTIC_CHINESE_ALIASES: Record<string, string[]> = {
  "便宜": ["廉价", "低价", "实惠"],
  "便宜货": ["廉价货", "廉价品"],
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findEnglishMatch(
  panel: TranslationEnglishPanelId,
  text: string,
  word: string,
  color: string,
): TranslationHighlightSpan["english"] | null {
  const target = word.trim();
  if (!text || !target) {
    return null;
  }

  const wholeWordPattern = /^[A-Za-z][A-Za-z'-]*$/u.test(target)
    ? new RegExp(`\\b${escapeRegExp(target)}\\b`, "i")
    : new RegExp(escapeRegExp(target), "i");
  const exactMatch = wholeWordPattern.exec(text);

  if (exactMatch?.[0] && exactMatch.index !== undefined) {
    return {
      panel,
      text: exactMatch[0],
      start: exactMatch.index,
      end: exactMatch.index + exactMatch[0].length,
      color,
    };
  }

  const fallbackIndex = text.toLowerCase().indexOf(target.toLowerCase());
  if (fallbackIndex >= 0) {
    return {
      panel,
      text: text.slice(fallbackIndex, fallbackIndex + target.length),
      start: fallbackIndex,
      end: fallbackIndex + target.length,
      color,
    };
  }

  return null;
}

function stripPartOfSpeechPrefixes(value: string): string {
  // Remove common part-of-speech prefixes like "n.", "v.", "adj.", "adv.", "vt.", "vi.", "prep.", etc.
  return value
    .replace(/^[\s]*(?:n\.|v\.|adj\.|adv\.|vt\.|vi\.|prep\.|conj\.|art\.|pron\.|num\.|int\.)[\s.]*/i, "")
    .trim();
}

function expandSemanticMeaningVariants(candidate: string) {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return [];
  }

  const variants = [trimmed];

  for (const [source, aliases] of Object.entries(SEMANTIC_CHINESE_ALIASES)) {
    if (trimmed === source) {
      variants.push(...aliases);
      continue;
    }

    if (trimmed.includes(source)) {
      variants.push(...aliases.map((alias) => trimmed.replace(source, alias)));
    }
  }

  return variants.filter(Boolean);
}

function extractMeaningCandidates(meaning: string) {
  // Step 1: Remove parenthetical content (English translations, notes)
  let cleaned = meaning
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Step 2: Remove part-of-speech prefixes from the start
  cleaned = stripPartOfSpeechPrefixes(cleaned);

  if (!cleaned) {
    return [];
  }

  // Step 3: Split on multiple delimiters including Chinese comma
  const rawCandidates = cleaned
    .split(/[；;、,，/|]/)
    .map((value) => stripPartOfSpeechPrefixes(value.trim()))
    .filter(Boolean);

  const unique = Array.from(
    new Set(
      [cleaned, ...rawCandidates].flatMap((candidate) => {
        const wrappedVariants = extractWrappedMeaningVariants(candidate);
        return wrappedVariants.flatMap((variant) => [variant, ...expandSemanticMeaningVariants(variant)]);
      }),
    ),
  );
  return unique.sort((left, right) => right.length - left.length);
}

function extractWrappedMeaningVariants(candidate: string) {
  const variants = [candidate.trim()];
  let current = candidate.trim();
  const prefixPatterns = [
    /^曾/u,
    /^(?:受不住|受不了|禁不住|忍不住|经不起|经不住|不住)/u,
    // Standalone transitive/perception markers (must have content after them)
    /^(?:受|被|遭|感|觉|认|令|让|使)(?=.)/u,
    /^(?:遭到|遭受|感到|觉得|认为|令人|让人|使人)/u,
    /^(?:很|非常|特别|十分|极其|太|更|最)/u,
  ];
  const suffixPatterns = [/[的地得]$/u];

  let changed = true;
  while (changed && current.length >= 2) {
    changed = false;

    for (const pattern of prefixPatterns) {
      const next = current.replace(pattern, "").trim();
      if (next !== current && next.length >= 2) {
        current = next;
        variants.push(current);
        changed = true;
      }
    }

    for (const pattern of suffixPatterns) {
      const next = current.replace(pattern, "").trim();
      if (next !== current && next.length >= 2) {
        current = next;
        variants.push(current);
        changed = true;
      }
    }
  }

  return variants.filter(Boolean);
}

function countSharedCharacters(left: string, right: string) {
  const rightChars = right.split("");
  const used = new Array(rightChars.length).fill(false);
  let count = 0;

  for (const char of left) {
    const index = rightChars.findIndex((candidate, position) => !used[position] && candidate === char);
    if (index >= 0) {
      used[index] = true;
      count += 1;
    }
  }

  return count;
}

function longestCommonSubsequenceLength(left: string, right: string) {
  if (!left || !right) {
    return 0;
  }

  const matrix = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));

  for (let row = 1; row <= left.length; row += 1) {
    for (let col = 1; col <= right.length; col += 1) {
      if (left[row - 1] === right[col - 1]) {
        matrix[row][col] = matrix[row - 1][col - 1] + 1;
      } else {
        matrix[row][col] = Math.max(matrix[row - 1][col], matrix[row][col - 1]);
      }
    }
  }

  return matrix[left.length][right.length];
}

function findApproximateChineseMatch(text: string, target: string) {
  const hanRuns = Array.from(text.matchAll(/\p{Script=Han}+/gu));
  let bestMatch: { text: string; start: number; end: number; score: number } | null = null;

  // Only search candidate lengths close to the target length to avoid over-broad matches
  const minLength = Math.max(2, target.length - 2);
  const maxSearchLength = Math.min(target.length + 3, Math.ceil(target.length * 1.5));

  for (const run of hanRuns) {
    const runText = run[0];
    const runStart = run.index ?? 0;
    const maxLength = Math.min(runText.length, maxSearchLength);

    for (let start = 0; start < runText.length; start += 1) {
      for (let length = minLength; length <= maxLength && start + length <= runText.length; length += 1) {
        const candidate = runText.slice(start, start + length);
        const sharedChars = countSharedCharacters(candidate, target);
        if (sharedChars < 2) {
          continue;
        }

        // Coverage check: at least 50% of candidate characters must appear in the target.
        // This prevents a short target from matching a much longer candidate.
        const coverage = sharedChars / candidate.length;
        if (coverage < 0.5) {
          continue;
        }

        const lcs = longestCommonSubsequenceLength(candidate, target);
        // Increase length-mismatch penalty (×3) to strongly prefer same-length matches
        const score = sharedChars * 5 + lcs * 4 - Math.abs(candidate.length - target.length) * 3;
        if (score < 12) {
          continue;
        }

        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            text: candidate,
            start: runStart + start,
            end: runStart + start + length,
            score,
          };
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Check if a word appears to be a "context wrapper" rather than a modifier.
 * Context wrappers add surrounding context (e.g., "受不住" + "诱惑").
 * Modifiers add descriptive detail (e.g., "小" + "锚").
 */
function isContextWrapper(shorter: string, longer: string): boolean {
  if (!longer.includes(shorter)) return false;

  const extraChars = longer.replace(shorter, "");

  // Context wrapper patterns — must stay in sync with extractWrappedMeaningVariants prefixPatterns/suffixPatterns
  const contextPatterns = [
    /曾/, // temporal prefix
    /受不住/, /受不了/, /禁不住/, /忍不住/, /经不起/, /经不住/, /不住/, // "can't resist" patterns
    /被/, /受/, /遭到/, /遭受/, /感到/, /觉得/, /认为/, /令人/, /让人/, /使人/, // passive/perception markers
    /很/, /非常/, /特别/, /十分/, /极其/, /太/, /更/, /最/, // intensity adverbs
    /的/, /地/, /得/, // structural particles
  ];

  // If the extra part contains context patterns, it's likely a context wrapper
  for (const pattern of contextPatterns) {
    if (pattern.test(extraChars)) return true;
  }

  return false;
}

function findChineseMatch(
  panel: TranslationChinesePanelId,
  text: string,
  meaning: string,
  color: string,
): TranslationHighlightSpan["chinese"] | null {
  if (!text || !meaning.trim()) {
    return null;
  }

  const candidates = extractMeaningCandidates(meaning);

  // Phase 1: Collect all exact matches
  const exactMatches: Array<{ candidate: string; index: number }> = [];
  for (const candidate of candidates) {
    let index = text.indexOf(candidate);
    while (index >= 0) {
      exactMatches.push({ candidate, index });
      index = text.indexOf(candidate, index + 1);
    }
  }

  if (exactMatches.length > 0) {
    // Sort by: 1) prefer core terms over context-wrapped terms, 2) longer length
    exactMatches.sort((a, b) => {
      // Check if this match is a core term that gets wrapped by context in other candidates
      const aHasContextWrapper = candidates.some(
        c => c.includes(a.candidate) && c.length > a.candidate.length && isContextWrapper(a.candidate, c)
      );
      const bHasContextWrapper = candidates.some(
        c => c.includes(b.candidate) && c.length > b.candidate.length && isContextWrapper(b.candidate, c)
      );

      // If a is a core term that could be wrapped (e.g., "诱惑"), prefer it
      // If b is a core term that could be wrapped, prefer it
      if (aHasContextWrapper && !bHasContextWrapper) return -1;
      if (!aHasContextWrapper && bHasContextWrapper) return 1;

      // Otherwise, prefer longer matches (more specific, like "小锚" over "锚")
      return b.candidate.length - a.candidate.length;
    });

    const best = exactMatches[0];
    return {
      panel,
      text: best.candidate,
      start: best.index,
      end: best.index + best.candidate.length,
      color,
    };
  }

  // Phase 2: Approximate matching - only for short candidates (≤10 chars)
  // Sort shorter candidates first to prefer core words
  const shortCandidates = candidates
    .filter(c => c.length <= 10)
    .sort((a, b) => a.length - b.length);

  for (const candidate of shortCandidates) {
    const approximate = findApproximateChineseMatch(text, candidate);
    if (approximate) {
      return {
        panel,
        text: approximate.text,
        start: approximate.start,
        end: approximate.end,
        color,
      };
    }
  }

  return null;
}

function overlapsRange(
  occupied: Array<{ start: number; end: number }>,
  next: { start: number; end: number },
) {
  return occupied.some((range) => next.start < range.end && next.end > range.start);
}

export function buildTranslationHighlights(input: BuildTranslationHighlightsInput): TranslationHighlightSpan[] {
  const highlights: TranslationHighlightSpan[] = [];
  const occupied: Record<TranslationPanelId, Array<{ start: number; end: number }>> = {
    prompt1: [],
    prompt2: [],
    prompt3: [],
    prompt4: [],
  };

  for (const [index, item] of input.vocabulary.entries()) {
    const color = HIGHLIGHT_COLORS[index % HIGHLIGHT_COLORS.length];

    const english =
      findEnglishMatch("prompt1", input.prompt1, item.word, color) ??
      findEnglishMatch("prompt3", input.prompt3, item.word, color);

    if (!english || overlapsRange(occupied[english.panel], english)) {
      continue;
    }

    const chinesePanel = english.panel === "prompt1" ? "prompt2" : "prompt4";
    const chineseText = chinesePanel === "prompt2" ? input.prompt2 : input.prompt4;
    // Only use item.meaning (concise Chinese word definition).
    // item.translation is the Chinese translation of the example sentence — not panel content.
    const chinese = item.meaning ? findChineseMatch(chinesePanel, chineseText, item.meaning, color) : null;

    if (chinese && overlapsRange(occupied[chinese.panel], chinese)) {
      continue;
    }

    occupied[english.panel].push({ start: english.start, end: english.end });
    if (chinese) {
      occupied[chinese.panel].push({ start: chinese.start, end: chinese.end });
    }

    highlights.push({
      id: item.id || `translation-highlight-${index + 1}`,
      color,
      word: item.word,
      english,
      chinese,
    });
  }

  return highlights;
}
