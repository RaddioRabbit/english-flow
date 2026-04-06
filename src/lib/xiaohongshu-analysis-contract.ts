export interface XiaohongshuAnalysisRequest {
  sentence: string;
  bookName: string;
  author: string;
}

export interface XiaohongshuAnalysisResponse {
  titles: string[];
  content: string;
}
