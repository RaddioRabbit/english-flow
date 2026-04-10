import type { SentenceExplanationArticle } from "./sentence-explanation-contract";
import type { ModuleId } from "./task-store";

export type SentenceExplanationTtsVoice =
  | "Chinese (Mandarin)_Gentleman"
  | "Chinese (Mandarin)_HK_Flight_Attendant"
  | "Chinese (Mandarin)_Lyrical_Voice"
  | "Chinese (Mandarin)_Male_Announcer"
  | "Chinese (Mandarin)_Mature_Woman"
  | "Chinese (Mandarin)_News_Anchor"
  | "Chinese (Mandarin)_Reliable_Executive"
  | "Chinese (Mandarin)_Sweet_Lady"
  | "Chinese (Mandarin)_Unrestrained_Young_Man"
  | "Chinese (Mandarin)_Warm_Bestie"
  | "Cantonese_CuteGirl"
  | "Cantonese_GentleLady"
  | "Cantonese_KindWoman"
  | "Cantonese_PlayfulMan"
  | "Arabic_CalmWoman"
  | "Arabic_FriendlyGuy"
  | "English_Aussie_Bloke"
  | "English_Gentle-voiced_man"
  | "English_Graceful_Lady"
  | "English_Persuasive_Man"
  | "English_Trustworthy_Man"
  | "English_Whispering_girl"
  | "English_radiant_girl"
  | "French_CasualMan"
  | "French_FemaleAnchor"
  | "French_MaleNarrator"
  | "French_MovieLeadFemale"
  | "German_FriendlyMan"
  | "German_PlayfulMan"
  | "German_SweetLady"
  | "hindi_female_1_v2"
  | "hindi_female_2_v1"
  | "hindi_male_1_v2"
  | "Italian_BraveHeroine"
  | "Italian_DiligentLeader"
  | "Italian_WanderingSorcerer"
  | "Japanese_CalmLady"
  | "Japanese_DominantMan"
  | "Japanese_GracefulMaiden"
  | "Japanese_IntellectualSenior"
  | "Japanese_KindLady"
  | "Korean_CalmGentleman"
  | "Korean_CalmLady"
  | "Korean_GentleWoman"
  | "Korean_IntellectualMan"
  | "Korean_SweetGirl"
  | "Portuguese_Kind-heartedGirl"
  | "Portuguese_RationalMan"
  | "Portuguese_SereneWoman"
  | "Portuguese_ThoughtfulMan"
  | "Russian_AmbitiousWoman"
  | "Russian_AttractiveGuy"
  | "Russian_BrightHeroine"
  | "Russian_ReliableMan"
  | "Spanish_Kind-heartedGirl"
  | "Spanish_RationalMan"
  | "Spanish_SereneWoman"
  | "Spanish_ThoughtfulMan";

export type SentenceExplanationTtsLanguage =
  | "zh"
  | "yue"
  | "en"
  | "ja"
  | "ko"
  | "es"
  | "pt"
  | "fr"
  | "de"
  | "ru"
  | "it"
  | "ar"
  | "hi";

export type SentenceExplanationTtsModel =
  | "speech-2.8-hd"
  | "speech-2.8-turbo"
  | "speech-2.6-hd"
  | "speech-2.6-turbo"
  | "speech-02-hd"
  | "speech-02-turbo"
  | "speech-01-hd"
  | "speech-01-turbo";

export interface SentenceExplanationTtsRequest {
  taskId: string;
  article: SentenceExplanationArticle;
  language?: SentenceExplanationTtsLanguage;
  voice?: SentenceExplanationTtsVoice;
  speed?: number;
  model?: SentenceExplanationTtsModel;
}

export interface SentenceExplanationTtsPreviewRequest {
  language: SentenceExplanationTtsLanguage;
  voice?: SentenceExplanationTtsVoice;
  speed?: number;
  model?: SentenceExplanationTtsModel;
}

export interface SentenceExplanationTtsAudioContent {
  text: string;
  audioDataUrl: string | null;
  assetId?: string;
  fileName?: string;
  mimeType?: string;
  publicUrl?: string;
  durationSeconds?: number;
  lineAudios?: SentenceExplanationTtsLineAudio[];
}

export interface SentenceExplanationTtsLineAudio {
  lineIndex: number;
  text: string;
  audioDataUrl: string | null;
  assetId?: string;
  fileName?: string;
  mimeType?: string;
  publicUrl?: string;
  durationSeconds?: number;
}

export interface SentenceExplanationTtsSection {
  moduleId: ModuleId;
  moduleName: string;
  imageRef: ModuleId;
  content: SentenceExplanationTtsAudioContent;
}

export interface SentenceExplanationTtsMetadata {
  language: SentenceExplanationTtsLanguage;
  voice: SentenceExplanationTtsVoice;
  speed: number;
  model: SentenceExplanationTtsModel;
  generatedAt: string;
  totalSegments: number;
  successfulSegments: number;
}

export interface SentenceExplanationTtsResponse {
  title: string;
  welcomeMessage: string;
  introduction: SentenceExplanationTtsAudioContent;
  sections: SentenceExplanationTtsSection[];
  conclusion: SentenceExplanationTtsAudioContent;
  metadata: SentenceExplanationTtsMetadata;
  source: "minimax-api";
  model: string;
}

export interface SentenceExplanationTtsPreviewResponse {
  language: SentenceExplanationTtsLanguage;
  voice: SentenceExplanationTtsVoice;
  speed: number;
  generatedAt: string;
  text: string;
  audioDataUrl: string | null;
  source: "minimax-api";
  model: string;
}
