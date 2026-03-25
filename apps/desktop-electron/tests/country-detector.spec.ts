import { describe, expect, it } from "vitest";
import {
  detectCountry,
  extractCountryFromEmoji,
  extractCountryFromKeyword,
  extractCountryFromPrefix
} from "../renderer/src/lib/country-detector";

describe("country-detector", () => {
  describe("extractCountryFromEmoji", () => {
    it("распознаёт emoji-флаг 🇷🇺", () => {
      expect(extractCountryFromEmoji("🇷🇺 Moscow Server")).toBe("ru");
    });
    it("распознаёт emoji-флаг 🇩🇪 в середине строки", () => {
      expect(extractCountryFromEmoji("Server 🇩🇪 Frankfurt")).toBe("de");
    });
    it("возвращает null если нет emoji", () => {
      expect(extractCountryFromEmoji("Simple Node")).toBeNull();
    });
  });

  describe("extractCountryFromPrefix", () => {
    it("распознаёт 'NL - Server 1'", () => {
      expect(extractCountryFromPrefix("NL - Server 1")).toBe("nl");
    });
    it("распознаёт 'de.node01'", () => {
      expect(extractCountryFromPrefix("de.node01")).toBe("de");
    });
    it("не путает слова с 2-буквенным началом", () => {
      // 'VL' — не код страны без разделителя за ним
      expect(extractCountryFromPrefix("VLESS-1.1.1.1:443")).toBeNull();
    });
  });

  describe("extractCountryFromKeyword", () => {
    it("распознаёт 'Frankfurt' → de", () => {
      expect(extractCountryFromKeyword("Node Frankfurt #1")).toBe("de");
    });
    it("распознаёт русское 'Россия'", () => {
      expect(extractCountryFromKeyword("Сервер Россия")).toBe("ru");
    });
    it("распознаёт 'Tokyo' → jp", () => {
      expect(extractCountryFromKeyword("Premium Tokyo")).toBe("jp");
    });
  });

  describe("detectCountry (комбинированный)", () => {
    it("emoji приоритетнее ключевых слов", () => {
      // Emoji 🇬🇧 но текст содержит France
      expect(detectCountry("🇬🇧 France Server")).toBe("gb");
    });
    it("ключевое слово приоритетнее prefix", () => {
      expect(detectCountry("NL Amsterdam")).toBe("nl");
    });
    it("fallback на prefix если нет emoji/keywords", () => {
      expect(detectCountry("US - Node 7")).toBe("us");
    });
    it("возвращает 'un' если ничего не совпало", () => {
      expect(detectCountry("Node-12345")).toBe("un");
    });
    it("распознаёт пустую строку как 'un'", () => {
      expect(detectCountry("")).toBe("un");
    });
  });
});
