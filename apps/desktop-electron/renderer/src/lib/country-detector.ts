/**
 * Country Detection — определение страны сервера по имени узла.
 * Приоритет: 1) emoji-флаг, 2) 2-буквенный ISO prefix, 3) город/страна в названии.
 */

// Карта emoji-флагов → ISO 3166-1 alpha-2
const FLAG_EMOJI_MAP: Record<string, string> = {
  "🇷🇺": "ru",
  "🇩🇪": "de",
  "🇳🇱": "nl",
  "🇬🇧": "gb",
  "🇫🇷": "fr",
  "🇫🇮": "fi",
  "🇸🇪": "se",
  "🇹🇷": "tr",
  "🇵🇱": "pl",
  "🇺🇦": "ua",
  "🇰🇿": "kz",
  "🇪🇸": "es",
  "🇸🇬": "sg",
  "🇦🇺": "au",
  "🇨🇦": "ca",
  "🇧🇬": "bg",
  "🇨🇭": "ch",
  "🇯🇵": "jp",
  "🇺🇸": "us",
  "🇱🇻": "lv",
  "🇪🇪": "ee",
  "🇱🇹": "lt",
  "🇮🇹": "it",
  "🇦🇹": "at",
  "🇭🇺": "hu",
  "🇷🇴": "ro",
  "🇧🇷": "br",
  "🇮🇳": "in",
  "🇰🇷": "kr",
  "🇭🇰": "hk",
  "🇹🇼": "tw",
  "🇮🇱": "il",
  "🇦🇪": "ae",
  "🇿🇦": "za",
  "🇲🇽": "mx",
  "🇦🇷": "ar",
  "🇨🇿": "cz",
  "🇩🇰": "dk",
  "🇳🇴": "no",
  "🇮🇪": "ie",
  "🇵🇹": "pt",
  "🇬🇷": "gr",
  "🇭🇷": "hr",
  "🇷🇸": "rs",
  "🇸🇰": "sk",
  "🇸🇮": "si",
  "🇨🇱": "cl",
  "🇨🇴": "co",
  "🇵🇪": "pe",
  "🇹🇭": "th",
  "🇻🇳": "vn",
  "🇮🇩": "id",
  "🇲🇾": "my",
  "🇵🇭": "ph",
  "🇳🇿": "nz",
  "🇲🇩": "md",
  "🇬🇪": "ge",
  "🇦🇲": "am",
  "🇦🇿": "az",
  "🇧🇾": "by",
  "🇺🇿": "uz",
  "🇰🇬": "kg",
  "🇹🇯": "tj",
  "🇹🇲": "tm",
  "🇲🇳": "mn"
};

// Карта город/страна → ISO code
const KEYWORD_MAP: Record<string, string> = {
  // Страны на английском
  russia: "ru",
  germany: "de",
  netherlands: "nl",
  "united kingdom": "gb",
  france: "fr",
  finland: "fi",
  sweden: "se",
  turkey: "tr",
  poland: "pl",
  ukraine: "ua",
  kazakhstan: "kz",
  spain: "es",
  singapore: "sg",
  australia: "au",
  canada: "ca",
  bulgaria: "bg",
  switzerland: "ch",
  japan: "jp",
  "united states": "us",
  latvia: "lv",
  estonia: "ee",
  lithuania: "lt",
  italy: "it",
  austria: "at",
  hungary: "hu",
  romania: "ro",
  brazil: "br",
  india: "in",
  "south korea": "kr",
  "hong kong": "hk",
  taiwan: "tw",
  israel: "il",
  "united arab emirates": "ae",
  "south africa": "za",
  mexico: "mx",
  argentina: "ar",
  czech: "cz",
  denmark: "dk",
  norway: "no",
  ireland: "ie",
  portugal: "pt",
  greece: "gr",
  georgia: "ge",
  // Страны на русском
  россия: "ru",
  германия: "de",
  нидерланды: "nl",
  великобритания: "gb",
  франция: "fr",
  финляндия: "fi",
  швеция: "se",
  турция: "tr",
  польша: "pl",
  украина: "ua",
  казахстан: "kz",
  испания: "es",
  сингапур: "sg",
  австралия: "au",
  канада: "ca",
  болгария: "bg",
  швейцария: "ch",
  япония: "jp",
  сша: "us",
  латвия: "lv",
  эстония: "ee",
  литва: "lt",
  италия: "it",
  австрия: "at",
  // Города
  moscow: "ru",
  frankfurt: "de",
  amsterdam: "nl",
  london: "gb",
  paris: "fr",
  helsinki: "fi",
  stockholm: "se",
  istanbul: "tr",
  warsaw: "pl",
  kyiv: "ua",
  almaty: "kz",
  madrid: "es",
  sydney: "au",
  toronto: "ca",
  sofia: "bg",
  zurich: "ch",
  tokyo: "jp",
  "new york": "us",
  "los angeles": "us",
  miami: "us",
  dallas: "us",
  chicago: "us",
  seattle: "us",
  riga: "lv",
  tallinn: "ee",
  vilnius: "lt",
  milan: "it",
  vienna: "at",
  budapest: "hu",
  bucharest: "ro",
  "sao paulo": "br",
  mumbai: "in",
  seoul: "kr",
  taipei: "tw",
  "tel aviv": "il",
  dubai: "ae",
  tbilisi: "ge",
  oslo: "no",
  copenhagen: "dk",
  dublin: "ie",
  lisbon: "pt",
  prague: "cz",
  // Аббревиатуры
  usa: "us",
  uk: "gb",
  uae: "ae"
};

/**
 * Извлечь код страны из emoji-флага в имени.
 */
export function extractCountryFromEmoji(name: string): string | null {
  for (const [emoji, code] of Object.entries(FLAG_EMOJI_MAP)) {
    if (name.includes(emoji)) return code;
  }
  return null;
}

/**
 * Извлечь код страны из 2-буквенного ISO-префикса ("NL - Server 1").
 * Проверяем что за 2 буквами идёт разделитель (пробел, дефис, точка, подчёркивание).
 */
export function extractCountryFromPrefix(name: string): string | null {
  const match = name.match(/^([a-z]{2})[\s\-_.\|#]/i);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }
  return null;
}

/**
 * Извлечь код страны из ключевых слов (город/страна) в имени.
 */
export function extractCountryFromKeyword(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [keyword, code] of Object.entries(KEYWORD_MAP)) {
    if (lower.includes(keyword)) return code;
  }
  return null;
}

/**
 * Комбинированный детектор. Порядок приоритетов:
 * 1. Emoji-флаг (самый надёжный)
 * 2. Ключевые слова (город/страна)
 * 3. 2-буквенный ISO-префикс (fallback, может давать false positives)
 * 4. "un" (unknown)
 */
export function detectCountry(name: string): string {
  return extractCountryFromEmoji(name) ?? extractCountryFromKeyword(name) ?? extractCountryFromPrefix(name) ?? "un";
}
