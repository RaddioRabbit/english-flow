export type TextTransferRequest = {
  refImage: string;       // data URL (base64)
  targetImage: string;    // data URL (base64)
  prompt: string;         // user's natural-language edit request
  refText?: string;       // optional original text in reference image
  targetText?: string;    // optional exact text to render on target image
  supplement?: string;    // optional additional instructions
  ratio?: string;         // "16:9" | "9:16" | "1:1" | "3:4"
};

export type TextTransferResult = {
  image_data_url: string;
};

export type TextTransferResponse =
  | ({ success: true } & TextTransferResult)
  | { success: false; error: string };

export const SUPPORTED_RATIOS = ["16:9", "9:16", "1:1", "3:4"] as const;
export type SupportedRatio = (typeof SUPPORTED_RATIOS)[number];
export const DEFAULT_RATIO: SupportedRatio = "16:9";
