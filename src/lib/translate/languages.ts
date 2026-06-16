export interface Language {
  /** Short code used for default output file naming, e.g. "ar". */
  code: string;
  /** English name shown in the dropdown. */
  name: string;
  /** Endonym (native name). */
  native: string;
  /** Right-to-left script. */
  rtl?: boolean;
}

/** Special source option: let the model detect the language. */
export const AUTO_DETECT: Language = { code: "auto", name: "Auto-detect", native: "Auto-detect" };

export const LANGUAGES: Language[] = [
  { code: "en", name: "English", native: "English" },
  { code: "ar", name: "Arabic", native: "العربية", rtl: true },
  { code: "he", name: "Hebrew", native: "עברית", rtl: true },
  { code: "fa", name: "Persian", native: "فارسی", rtl: true },
  { code: "ur", name: "Urdu", native: "اردو", rtl: true },
  { code: "ckb", name: "Kurdish (Sorani)", native: "کوردیی ناوەندی", rtl: true },
  { code: "ps", name: "Pashto", native: "پښتو", rtl: true },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "cs", name: "Czech", native: "Čeština" },
  { code: "ro", name: "Romanian", native: "Română" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "da", name: "Danish", native: "Dansk" },
  { code: "no", name: "Norwegian", native: "Norsk" },
  { code: "fi", name: "Finnish", native: "Suomi" },
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "zh", name: "Chinese (Simplified)", native: "简体中文" },
  { code: "zh-Hant", name: "Chinese (Traditional)", native: "繁體中文" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
];

const BY_CODE = new Map<string, Language>(
  [AUTO_DETECT, ...LANGUAGES].map((l) => [l.code, l]),
);

export function languageByCode(code: string): Language | undefined {
  return BY_CODE.get(code);
}

export function isRtl(code: string): boolean {
  return !!BY_CODE.get(code)?.rtl;
}

/** The label used in prompts; falls back to the code if unknown. */
export function promptName(code: string): string {
  return BY_CODE.get(code)?.name ?? code;
}
