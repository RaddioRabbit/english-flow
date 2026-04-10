import type {
  SentenceExplanationTtsLanguage,
  SentenceExplanationTtsModel,
  SentenceExplanationTtsVoice,
} from "./sentence-explanation-tts-contract";

export type SentenceExplanationTtsVoiceGender = "female" | "male";

export type SentenceExplanationTtsLanguageBoost =
  | "Chinese"
  | "Chinese,Yue"
  | "English"
  | "Japanese"
  | "Korean"
  | "Spanish"
  | "Portuguese"
  | "French"
  | "German"
  | "Russian"
  | "Italian"
  | "Arabic"
  | "Hindi";

export interface SentenceExplanationTtsLanguageOption {
  value: SentenceExplanationTtsLanguage;
  label: string;
  nativeLabel: string;
  previewText: string;
  defaultVoice: SentenceExplanationTtsVoice;
  languageBoost: SentenceExplanationTtsLanguageBoost;
}

export interface SentenceExplanationTtsAccentOption {
  value: string;
  label: string;
}

export interface SentenceExplanationTtsGenderOption {
  value: SentenceExplanationTtsVoiceGender;
  label: string;
}

export interface SentenceExplanationTtsVoiceOption {
  value: SentenceExplanationTtsVoice;
  label: string;
  description: string;
  language: SentenceExplanationTtsLanguage;
  accent: string;
  accentLabel: string;
  gender: SentenceExplanationTtsVoiceGender;
}

export interface SentenceExplanationTtsResolvedSelection {
  languageOption: SentenceExplanationTtsLanguageOption;
  accent: string;
  gender: SentenceExplanationTtsVoiceGender;
  voice: SentenceExplanationTtsVoice;
  accentOptions: SentenceExplanationTtsAccentOption[];
  genderOptions: SentenceExplanationTtsGenderOption[];
  voiceOptions: SentenceExplanationTtsVoiceOption[];
  voiceOption: SentenceExplanationTtsVoiceOption;
}

export interface SentenceExplanationTtsModelOption {
  value: SentenceExplanationTtsModel;
  label: string;
  description: string;
}

const DEFAULT_TTS_LANGUAGE: SentenceExplanationTtsLanguage = "zh";
export const DEFAULT_TTS_MODEL: SentenceExplanationTtsModel = "speech-2.8-hd";

const GENDER_ORDER: SentenceExplanationTtsVoiceGender[] = ["female", "male"];

export const sentenceExplanationTtsGenderLabels: Record<SentenceExplanationTtsVoiceGender, string> = {
  female: "女声",
  male: "男声",
};

export const sentenceExplanationTtsLanguageOptions: SentenceExplanationTtsLanguageOption[] = [
  {
    value: "zh",
    label: "中文",
    nativeLabel: "简体中文",
    previewText: "大家好，欢迎来到英语名著句子讲解小课堂。",
    defaultVoice: "Chinese (Mandarin)_News_Anchor",
    languageBoost: "Chinese",
  },
  {
    value: "yue",
    label: "粤语",
    nativeLabel: "粤语",
    previewText: "大家好，欢迎来到英语名著句子讲解小课堂。",
    defaultVoice: "Cantonese_GentleLady",
    languageBoost: "Chinese,Yue",
  },
  {
    value: "en",
    label: "英语",
    nativeLabel: "English",
    previewText: "Hello, welcome to our English classics sentence lesson.",
    defaultVoice: "English_Graceful_Lady",
    languageBoost: "English",
  },
  {
    value: "ja",
    label: "日语",
    nativeLabel: "日本語",
    previewText: "みなさん、こんにちは。英語名著の文を解説するミニレッスンへようこそ。",
    defaultVoice: "Japanese_KindLady",
    languageBoost: "Japanese",
  },
  {
    value: "ko",
    label: "韩语",
    nativeLabel: "한국어",
    previewText: "안녕하세요. 영어 명작 문장 해설 미니 수업에 오신 것을 환영합니다.",
    defaultVoice: "Korean_SweetGirl",
    languageBoost: "Korean",
  },
  {
    value: "es",
    label: "西班牙语",
    nativeLabel: "Español",
    previewText: "Hola, bienvenidos a nuestra mini clase sobre frases de los clásicos ingleses.",
    defaultVoice: "Spanish_SereneWoman",
    languageBoost: "Spanish",
  },
  {
    value: "pt",
    label: "葡萄牙语",
    nativeLabel: "Português",
    previewText: "Olá, bem-vindos à nossa mini aula sobre frases dos clássicos ingleses.",
    defaultVoice: "Portuguese_SereneWoman",
    languageBoost: "Portuguese",
  },
  {
    value: "fr",
    label: "法语",
    nativeLabel: "Français",
    previewText: "Bonjour, bienvenue dans notre mini leçon sur les phrases des classiques anglais.",
    defaultVoice: "French_FemaleAnchor",
    languageBoost: "French",
  },
  {
    value: "de",
    label: "德语",
    nativeLabel: "Deutsch",
    previewText: "Hallo, willkommen zu unserer kleinen Lektion über Sätze aus englischen Klassikern.",
    defaultVoice: "German_SweetLady",
    languageBoost: "German",
  },
  {
    value: "ru",
    label: "俄语",
    nativeLabel: "Русский",
    previewText: "Здравствуйте, добро пожаловать на наш мини-урок по разбору предложений из английской классики.",
    defaultVoice: "Russian_AmbitiousWoman",
    languageBoost: "Russian",
  },
  {
    value: "it",
    label: "意大利语",
    nativeLabel: "Italiano",
    previewText: "Ciao, benvenuti alla nostra mini lezione sulle frasi dei classici inglesi.",
    defaultVoice: "Italian_BraveHeroine",
    languageBoost: "Italian",
  },
  {
    value: "ar",
    label: "阿拉伯语",
    nativeLabel: "العربية",
    previewText: "مرحباً بكم، أهلاً بكم في درسنا المصغر لشرح جمل من كلاسيكيات الأدب الإنجليزي.",
    defaultVoice: "Arabic_CalmWoman",
    languageBoost: "Arabic",
  },
  {
    value: "hi",
    label: "印地语",
    nativeLabel: "हिन्दी",
    previewText: "नमस्कार, अंग्रेज़ी क्लासिक्स के वाक्यों की हमारी छोटी कक्षा में आपका स्वागत है।",
    defaultVoice: "hindi_female_2_v1",
    languageBoost: "Hindi",
  },
];

export const sentenceExplanationTtsVoiceCatalog: SentenceExplanationTtsVoiceOption[] = [
  {
    value: "Chinese (Mandarin)_News_Anchor",
    label: "新闻女声",
    description: "明亮圆润，干练利落，新闻现场感。",
    language: "zh",
    accent: "mandarin",
    accentLabel: "普通话",
    gender: "female",
  },
  {
    value: "Chinese (Mandarin)_Mature_Woman",
    label: "傲娇御姐",
    description: "低沉沙哑，慵懒舒缓，性感撩人。",
    language: "zh",
    accent: "mandarin",
    accentLabel: "普通话",
    gender: "female",
  },
  {
    value: "Chinese (Mandarin)_Warm_Bestie",
    label: "温暖闺蜜",
    description: "亲切松弛，陪伴感强，适合课堂欢迎语。",
    language: "zh",
    accent: "mandarin",
    accentLabel: "普通话",
    gender: "female",
  },
  {
    value: "Chinese (Mandarin)_Sweet_Lady",
    label: "甜美女声",
    description: "轻快柔和，年轻明亮，亲和自然。",
    language: "zh",
    accent: "mandarin",
    accentLabel: "普通话",
    gender: "female",
  },
  {
    value: "Chinese (Mandarin)_Reliable_Executive",
    label: "沉稳高管",
    description: "低沉厚实，磁性，从容不迫。",
    language: "zh",
    accent: "mandarin",
    accentLabel: "普通话",
    gender: "male",
  },
  {
    value: "Chinese (Mandarin)_Unrestrained_Young_Man",
    label: "不羁青年",
    description: "低沉磁性，慵懒随意，霸道。",
    language: "zh",
    accent: "mandarin",
    accentLabel: "普通话",
    gender: "male",
  },
  {
    value: "Chinese (Mandarin)_Gentleman",
    label: "温润男声",
    description: "温和稳重，咬字清晰，适合讲述。",
    language: "zh",
    accent: "mandarin",
    accentLabel: "普通话",
    gender: "male",
  },
  {
    value: "Chinese (Mandarin)_Male_Announcer",
    label: "播报男声",
    description: "广播感强，清晰有力，节奏稳定。",
    language: "zh",
    accent: "mandarin",
    accentLabel: "普通话",
    gender: "male",
  },
  {
    value: "Chinese (Mandarin)_Lyrical_Voice",
    label: "抒情男声",
    description: "情绪细腻，节奏舒展，适合旁白和总结。",
    language: "zh",
    accent: "mandarin",
    accentLabel: "普通话",
    gender: "male",
  },
  {
    value: "Chinese (Mandarin)_HK_Flight_Attendant",
    label: "港普空姐",
    description: "轻港风口音，服务感强，温柔礼貌。",
    language: "zh",
    accent: "hong-kong-mandarin",
    accentLabel: "港普",
    gender: "female",
  },
  {
    value: "Cantonese_GentleLady",
    label: "温柔女声",
    description: "温柔亲切，粤语自然，适合娓娓道来。",
    language: "yue",
    accent: "cantonese",
    accentLabel: "粤语",
    gender: "female",
  },
  {
    value: "Cantonese_KindWoman",
    label: "善良女声",
    description: "成熟稳妥，语气温和，陪伴感强。",
    language: "yue",
    accent: "cantonese",
    accentLabel: "粤语",
    gender: "female",
  },
  {
    value: "Cantonese_CuteGirl",
    label: "可爱女孩",
    description: "青春明快，活泼有朝气，口语感强。",
    language: "yue",
    accent: "cantonese",
    accentLabel: "粤语",
    gender: "female",
  },
  {
    value: "Cantonese_PlayfulMan",
    label: "活泼男声",
    description: "轻快有活力，粤语表达自然，互动感强。",
    language: "yue",
    accent: "cantonese",
    accentLabel: "粤语",
    gender: "male",
  },
  {
    value: "English_Graceful_Lady",
    label: "Graceful Lady",
    description: "Elegant and clear, suitable for narration and learning content.",
    language: "en",
    accent: "global-english",
    accentLabel: "通用英语",
    gender: "female",
  },
  {
    value: "English_radiant_girl",
    label: "Radiant Girl",
    description: "Bright, youthful, and lively with a friendly tone.",
    language: "en",
    accent: "global-english",
    accentLabel: "通用英语",
    gender: "female",
  },
  {
    value: "English_Whispering_girl",
    label: "Whispering Girl",
    description: "Soft and intimate, good for gentle classroom openings.",
    language: "en",
    accent: "global-english",
    accentLabel: "通用英语",
    gender: "female",
  },
  {
    value: "English_Persuasive_Man",
    label: "Persuasive Man",
    description: "Confident, expressive, and suitable for structured explanations.",
    language: "en",
    accent: "global-english",
    accentLabel: "通用英语",
    gender: "male",
  },
  {
    value: "English_Trustworthy_Man",
    label: "Trustworthy Man",
    description: "Steady and warm with a reliable teaching presence.",
    language: "en",
    accent: "global-english",
    accentLabel: "通用英语",
    gender: "male",
  },
  {
    value: "English_Gentle-voiced_man",
    label: "Gentle-voiced Man",
    description: "Soft-spoken and calm, suitable for slower sentence analysis.",
    language: "en",
    accent: "global-english",
    accentLabel: "通用英语",
    gender: "male",
  },
  {
    value: "English_Aussie_Bloke",
    label: "Aussie Bloke",
    description: "Relaxed Australian accent with a conversational rhythm.",
    language: "en",
    accent: "australian-english",
    accentLabel: "澳式英语",
    gender: "male",
  },
  {
    value: "Japanese_KindLady",
    label: "Kind Lady",
    description: "亲切温柔，讲述自然，适合课堂讲解。",
    language: "ja",
    accent: "standard-japanese",
    accentLabel: "标准日语",
    gender: "female",
  },
  {
    value: "Japanese_CalmLady",
    label: "Calm Lady",
    description: "平稳克制，语气沉着，适合细致分析。",
    language: "ja",
    accent: "standard-japanese",
    accentLabel: "标准日语",
    gender: "female",
  },
  {
    value: "Japanese_GracefulMaiden",
    label: "Graceful Maiden",
    description: "轻盈柔美，语感细腻，适合欢迎语。",
    language: "ja",
    accent: "standard-japanese",
    accentLabel: "标准日语",
    gender: "female",
  },
  {
    value: "Japanese_DominantMan",
    label: "Dominant Man",
    description: "低沉有力，节奏鲜明，适合重点讲解。",
    language: "ja",
    accent: "standard-japanese",
    accentLabel: "标准日语",
    gender: "male",
  },
  {
    value: "Japanese_IntellectualSenior",
    label: "Intellectual Senior",
    description: "知性稳重，适合理性分析和总结。",
    language: "ja",
    accent: "standard-japanese",
    accentLabel: "标准日语",
    gender: "male",
  },
  {
    value: "Korean_SweetGirl",
    label: "Sweet Girl",
    description: "明亮柔和，亲和自然，适合课堂欢迎语。",
    language: "ko",
    accent: "standard-korean",
    accentLabel: "标准韩语",
    gender: "female",
  },
  {
    value: "Korean_CalmLady",
    label: "Calm Lady",
    description: "平静稳定，咬字清楚，适合说明性内容。",
    language: "ko",
    accent: "standard-korean",
    accentLabel: "标准韩语",
    gender: "female",
  },
  {
    value: "Korean_GentleWoman",
    label: "Gentle Woman",
    description: "温和自然，陪伴感强，适合完整文章朗读。",
    language: "ko",
    accent: "standard-korean",
    accentLabel: "标准韩语",
    gender: "female",
  },
  {
    value: "Korean_CalmGentleman",
    label: "Calm Gentleman",
    description: "稳健克制，适合结构化讲解和总结。",
    language: "ko",
    accent: "standard-korean",
    accentLabel: "标准韩语",
    gender: "male",
  },
  {
    value: "Korean_IntellectualMan",
    label: "Intellectual Man",
    description: "理性清晰，分析感强，适合句式说明。",
    language: "ko",
    accent: "standard-korean",
    accentLabel: "标准韩语",
    gender: "male",
  },
  {
    value: "Spanish_SereneWoman",
    label: "Serene Woman",
    description: "Natural and smooth with a steady classroom tone.",
    language: "es",
    accent: "standard-spanish",
    accentLabel: "标准西语",
    gender: "female",
  },
  {
    value: "Spanish_Kind-heartedGirl",
    label: "Kind-hearted Girl",
    description: "Warm and youthful, suitable for welcoming intros.",
    language: "es",
    accent: "standard-spanish",
    accentLabel: "标准西语",
    gender: "female",
  },
  {
    value: "Spanish_ThoughtfulMan",
    label: "Thoughtful Man",
    description: "Reflective and calm, good for grammar explanations.",
    language: "es",
    accent: "standard-spanish",
    accentLabel: "标准西语",
    gender: "male",
  },
  {
    value: "Spanish_RationalMan",
    label: "Rational Man",
    description: "Clear logic and balanced pacing for instructional reading.",
    language: "es",
    accent: "standard-spanish",
    accentLabel: "标准西语",
    gender: "male",
  },
  {
    value: "Portuguese_SereneWoman",
    label: "Serene Woman",
    description: "Smooth and patient, suitable for long-form narration.",
    language: "pt",
    accent: "standard-portuguese",
    accentLabel: "标准葡语",
    gender: "female",
  },
  {
    value: "Portuguese_Kind-heartedGirl",
    label: "Kind-hearted Girl",
    description: "Friendly, youthful, and suitable for intros.",
    language: "pt",
    accent: "standard-portuguese",
    accentLabel: "标准葡语",
    gender: "female",
  },
  {
    value: "Portuguese_ThoughtfulMan",
    label: "Thoughtful Man",
    description: "Clear and composed with good instructional pacing.",
    language: "pt",
    accent: "standard-portuguese",
    accentLabel: "标准葡语",
    gender: "male",
  },
  {
    value: "Portuguese_RationalMan",
    label: "Rational Man",
    description: "Stable rhythm and strong articulation for analysis-heavy content.",
    language: "pt",
    accent: "standard-portuguese",
    accentLabel: "标准葡语",
    gender: "male",
  },
  {
    value: "French_FemaleAnchor",
    label: "Female Anchor",
    description: "Stable news-style delivery with clear diction.",
    language: "fr",
    accent: "standard-french",
    accentLabel: "标准法语",
    gender: "female",
  },
  {
    value: "French_MovieLeadFemale",
    label: "Movie Lead Female",
    description: "More expressive and cinematic, good for engaging intros.",
    language: "fr",
    accent: "standard-french",
    accentLabel: "标准法语",
    gender: "female",
  },
  {
    value: "French_MaleNarrator",
    label: "Male Narrator",
    description: "Warm and steady for long paragraph narration.",
    language: "fr",
    accent: "standard-french",
    accentLabel: "标准法语",
    gender: "male",
  },
  {
    value: "French_CasualMan",
    label: "Casual Man",
    description: "Relaxed and conversational while remaining clear.",
    language: "fr",
    accent: "standard-french",
    accentLabel: "标准法语",
    gender: "male",
  },
  {
    value: "German_SweetLady",
    label: "Sweet Lady",
    description: "Gentle, approachable, and suitable for welcoming lines.",
    language: "de",
    accent: "standard-german",
    accentLabel: "标准德语",
    gender: "female",
  },
  {
    value: "German_FriendlyMan",
    label: "Friendly Man",
    description: "Natural classroom tone with a warm, steady cadence.",
    language: "de",
    accent: "standard-german",
    accentLabel: "标准德语",
    gender: "male",
  },
  {
    value: "German_PlayfulMan",
    label: "Playful Man",
    description: "More lively and expressive while keeping clarity.",
    language: "de",
    accent: "standard-german",
    accentLabel: "标准德语",
    gender: "male",
  },
  {
    value: "Russian_AmbitiousWoman",
    label: "Ambitious Woman",
    description: "稳重明亮，适合完整文章和课堂解说。",
    language: "ru",
    accent: "standard-russian",
    accentLabel: "标准俄语",
    gender: "female",
  },
  {
    value: "Russian_BrightHeroine",
    label: "Bright Heroine",
    description: "更有情绪和感染力，适合开场欢迎语。",
    language: "ru",
    accent: "standard-russian",
    accentLabel: "标准俄语",
    gender: "female",
  },
  {
    value: "Russian_ReliableMan",
    label: "Reliable Man",
    description: "平稳清晰，逻辑感强，适合句式分析。",
    language: "ru",
    accent: "standard-russian",
    accentLabel: "标准俄语",
    gender: "male",
  },
  {
    value: "Russian_AttractiveGuy",
    label: "Attractive Guy",
    description: "音色更鲜明，适合强调重点内容。",
    language: "ru",
    accent: "standard-russian",
    accentLabel: "标准俄语",
    gender: "male",
  },
  {
    value: "Italian_BraveHeroine",
    label: "Brave Heroine",
    description: "明快有张力，适合欢迎语和结尾。",
    language: "it",
    accent: "standard-italian",
    accentLabel: "标准意大利语",
    gender: "female",
  },
  {
    value: "Italian_WanderingSorcerer",
    label: "Wandering Sorcerer",
    description: "低沉松弛，适合叙述性讲解。",
    language: "it",
    accent: "standard-italian",
    accentLabel: "标准意大利语",
    gender: "male",
  },
  {
    value: "Italian_DiligentLeader",
    label: "Diligent Leader",
    description: "理性有力，适合结构化分析和总结。",
    language: "it",
    accent: "standard-italian",
    accentLabel: "标准意大利语",
    gender: "male",
  },
  {
    value: "Arabic_CalmWoman",
    label: "Calm Woman",
    description: "沉静自然，适合长句讲解和欢迎语。",
    language: "ar",
    accent: "standard-arabic",
    accentLabel: "标准阿拉伯语",
    gender: "female",
  },
  {
    value: "Arabic_FriendlyGuy",
    label: "Friendly Guy",
    description: "亲和、稳妥、节奏清晰，适合课程说明。",
    language: "ar",
    accent: "standard-arabic",
    accentLabel: "标准阿拉伯语",
    gender: "male",
  },
  {
    value: "hindi_female_2_v1",
    label: "Tranquil Woman",
    description: "温柔稳定，适合完整文章朗读。",
    language: "hi",
    accent: "standard-hindi",
    accentLabel: "标准印地语",
    gender: "female",
  },
  {
    value: "hindi_female_1_v2",
    label: "News Anchor",
    description: "播报感较强，清晰有条理，适合课堂讲解。",
    language: "hi",
    accent: "standard-hindi",
    accentLabel: "标准印地语",
    gender: "female",
  },
  {
    value: "hindi_male_1_v2",
    label: "Trustworthy Advisor",
    description: "稳重可靠，适合分析性和总结性内容。",
    language: "hi",
    accent: "standard-hindi",
    accentLabel: "标准印地语",
    gender: "male",
  },
];

const sentenceExplanationTtsLanguageOptionMap = Object.fromEntries(
  sentenceExplanationTtsLanguageOptions.map((option) => [option.value, option]),
) as Record<SentenceExplanationTtsLanguage, SentenceExplanationTtsLanguageOption>;

const sentenceExplanationTtsVoiceOptionMap = Object.fromEntries(
  sentenceExplanationTtsVoiceCatalog.map((voice) => [voice.value, voice]),
) as Record<SentenceExplanationTtsVoice, SentenceExplanationTtsVoiceOption>;

export const sentenceExplanationTtsModelOptions: SentenceExplanationTtsModelOption[] = [
  { value: "speech-2.8-hd", label: "speech-2.8-hd", description: "精准还原真实语气细节，全面提升音色相似度" },
  { value: "speech-2.8-turbo", label: "speech-2.8-turbo", description: "精准还原真实语气细节，更快更优惠" },
  { value: "speech-2.6-hd", label: "speech-2.6-hd", description: "超低延时，归一化升级，更高自然度" },
  { value: "speech-2.6-turbo", label: "speech-2.6-turbo", description: "极速版，更快更优惠，更适用于语音聊天和数字人场景" },
  { value: "speech-02-hd", label: "speech-02-hd", description: "拥有出色的韵律、稳定性和复刻相似度，音质表现突出" },
  { value: "speech-02-turbo", label: "speech-02-turbo", description: "拥有出色的韵律和稳定性，小语种能力加强，性能表现出色" },
  { value: "speech-01-hd", label: "speech-01-hd", description: "经典高清版，音质稳定" },
  { value: "speech-01-turbo", label: "speech-01-turbo", description: "经典极速版，响应更快" },
];

export const sentenceExplanationTtsModelLabels = Object.fromEntries(
  sentenceExplanationTtsModelOptions.map((model) => [model.value, model.label]),
) as Record<SentenceExplanationTtsModel, string>;

export const sentenceExplanationTtsVoices = sentenceExplanationTtsVoiceCatalog.map((voice) => voice.value);

export const sentenceExplanationTtsVoiceLabels = Object.fromEntries(
  sentenceExplanationTtsVoiceCatalog.map((voice) => [voice.value, voice.label]),
) as Record<SentenceExplanationTtsVoice, string>;

function sortAccentOptions(options: SentenceExplanationTtsAccentOption[]) {
  return [...options].sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
}

function sortVoiceOptions(
  language: SentenceExplanationTtsLanguage,
  options: SentenceExplanationTtsVoiceOption[],
) {
  const defaultVoice = getSentenceExplanationTtsLanguageOption(language).defaultVoice;

  return [...options].sort((left, right) => {
    if (left.value === defaultVoice) {
      return -1;
    }

    if (right.value === defaultVoice) {
      return 1;
    }

    return left.label.localeCompare(right.label, "zh-CN");
  });
}

function getVoiceFallback(language: SentenceExplanationTtsLanguage) {
  const languageOption = getSentenceExplanationTtsLanguageOption(language);
  return sentenceExplanationTtsVoiceOptionMap[languageOption.defaultVoice];
}

export function getSentenceExplanationTtsLanguageOption(
  language: SentenceExplanationTtsLanguage = DEFAULT_TTS_LANGUAGE,
) {
  return sentenceExplanationTtsLanguageOptionMap[language] ?? sentenceExplanationTtsLanguageOptionMap[DEFAULT_TTS_LANGUAGE];
}

export function getSentenceExplanationTtsLanguageBoost(
  language: SentenceExplanationTtsLanguage = DEFAULT_TTS_LANGUAGE,
) {
  return getSentenceExplanationTtsLanguageOption(language).languageBoost;
}

export function getSentenceExplanationTtsVoiceOption(voice: SentenceExplanationTtsVoice) {
  return sentenceExplanationTtsVoiceOptionMap[voice] ?? null;
}

export function getSentenceExplanationTtsAccentOptions(language: SentenceExplanationTtsLanguage) {
  const accentMap = new Map<string, SentenceExplanationTtsAccentOption>();

  for (const voice of sentenceExplanationTtsVoiceCatalog) {
    if (voice.language !== language || accentMap.has(voice.accent)) {
      continue;
    }

    accentMap.set(voice.accent, {
      value: voice.accent,
      label: voice.accentLabel,
    });
  }

  return sortAccentOptions(Array.from(accentMap.values()));
}

export function getSentenceExplanationTtsGenderOptions(
  language: SentenceExplanationTtsLanguage,
  accent?: string,
) {
  const genders = new Set<SentenceExplanationTtsVoiceGender>();

  for (const voice of sentenceExplanationTtsVoiceCatalog) {
    if (voice.language !== language) {
      continue;
    }

    if (accent && voice.accent !== accent) {
      continue;
    }

    genders.add(voice.gender);
  }

  return GENDER_ORDER.filter((gender) => genders.has(gender)).map((gender) => ({
    value: gender,
    label: sentenceExplanationTtsGenderLabels[gender],
  }));
}

export function getSentenceExplanationTtsVoiceOptions(
  language: SentenceExplanationTtsLanguage,
  filters: {
    accent?: string;
    gender?: SentenceExplanationTtsVoiceGender;
  } = {},
) {
  const filtered = sentenceExplanationTtsVoiceCatalog.filter((voice) => {
    if (voice.language !== language) {
      return false;
    }

    if (filters.accent && voice.accent !== filters.accent) {
      return false;
    }

    if (filters.gender && voice.gender !== filters.gender) {
      return false;
    }

    return true;
  });

  return sortVoiceOptions(language, filtered);
}

export function resolveSentenceExplanationTtsVoice(
  language: SentenceExplanationTtsLanguage,
  voice?: SentenceExplanationTtsVoice,
) {
  const voiceOption = voice ? getSentenceExplanationTtsVoiceOption(voice) : null;
  if (voiceOption?.language === language) {
    return voiceOption.value;
  }

  return getSentenceExplanationTtsLanguageOption(language).defaultVoice;
}

export function resolveSentenceExplanationTtsSelection(input: {
  language: SentenceExplanationTtsLanguage;
  accent?: string;
  gender?: SentenceExplanationTtsVoiceGender;
  voice?: SentenceExplanationTtsVoice;
}): SentenceExplanationTtsResolvedSelection {
  const languageOption = getSentenceExplanationTtsLanguageOption(input.language);
  const languageVoices = getSentenceExplanationTtsVoiceOptions(languageOption.value);
  const voiceFallback = getSentenceExplanationTtsVoiceOption(
    resolveSentenceExplanationTtsVoice(languageOption.value, input.voice),
  ) ?? getVoiceFallback(languageOption.value);

  const accentOptions = getSentenceExplanationTtsAccentOptions(languageOption.value);
  const accent =
    accentOptions.find((option) => option.value === input.accent)?.value ??
    voiceFallback?.accent ??
    accentOptions[0]?.value;

  const genderOptions = getSentenceExplanationTtsGenderOptions(languageOption.value, accent);
  const gender =
    genderOptions.find((option) => option.value === input.gender)?.value ??
    (voiceFallback && genderOptions.some((option) => option.value === voiceFallback.gender)
      ? voiceFallback.gender
      : genderOptions[0]?.value);

  const voiceOptions = getSentenceExplanationTtsVoiceOptions(languageOption.value, {
    accent,
    gender,
  });

  const voice =
    voiceOptions.find((option) => option.value === input.voice)?.value ??
    (voiceFallback && voiceOptions.some((option) => option.value === voiceFallback.value)
      ? voiceFallback.value
      : voiceOptions[0]?.value ??
        languageVoices[0]?.value ??
        languageOption.defaultVoice);

  const voiceOption =
    voiceOptions.find((option) => option.value === voice) ??
    getSentenceExplanationTtsVoiceOption(voice) ??
    getVoiceFallback(languageOption.value);

  if (!accent || !gender || !voiceOption) {
    throw new Error(`No MiniMax voice catalog available for language ${languageOption.value}.`);
  }

  return {
    languageOption,
    accent,
    gender,
    voice,
    accentOptions,
    genderOptions,
    voiceOptions,
    voiceOption,
  };
}
