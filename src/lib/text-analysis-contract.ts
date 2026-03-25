export type TextAnalysisMode = "all" | "segmentation" | "translation" | "grammar" | "vocabulary" | "ielts";

export type AnalysisSource = "anthropic-compatible-api" | "local-mock";

// The PRD allows up to 5 minutes for text analysis, so keep the server-side
// deadline there and let the browser wait slightly longer for the concrete
// timeout message instead of failing early on the client.
export const DEFAULT_TEXT_ANALYSIS_STAGE_TIMEOUT_MS = 300_000;
export const DEFAULT_TEXT_ANALYSIS_MAX_RETRIES = 1;
export const DEFAULT_TEXT_ANALYSIS_REQUEST_TIMEOUT_MS = DEFAULT_TEXT_ANALYSIS_STAGE_TIMEOUT_MS + 5_000;

export interface TextAnalysisGrammar {
  tense: string;
  voice: string;
  structure: string;
}

export interface TextAnalysisVocabularyCard {
  id: string;
  word: string;
  phonetic: string;
  partOfSpeech: string;
  meaning: string;
  example: string;
  translation: string;
}

export interface TextAnalysisIeltsTips {
  listening: string;
  speaking: string;
  reading: string;
  writing: string;
}

export interface TextAnalysisContent {
  translation: string;
  prompt1: string;
  prompt2: string;
  prompt3: string;
  prompt4: string;
  grammar: TextAnalysisGrammar;
  vocabulary: TextAnalysisVocabularyCard[];
  ielts: TextAnalysisIeltsTips;
}

export interface TextAnalysisRequest {
  sentence: string;
  bookName: string;
  author: string;
  mode: TextAnalysisMode;
  currentTextContent?: TextAnalysisContent;
}

export interface TextAnalysisResponse {
  textContent: TextAnalysisContent;
  source: AnalysisSource;
  model: string;
}
