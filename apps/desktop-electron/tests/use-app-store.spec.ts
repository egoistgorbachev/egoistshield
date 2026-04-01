import { describe, expect, it } from "vitest";
import { normalizeZapretProfile } from "../renderer/src/store/useAppStore";

describe("normalizeZapretProfile", () => {
  it("возвращает fallback для пустой строки", () => {
    expect(normalizeZapretProfile("", "General")).toBe("General");
    expect(normalizeZapretProfile("   ", "General")).toBe("General");
  });

  it("сохраняет непустой профиль", () => {
    expect(normalizeZapretProfile("General (ALT)", "General")).toBe("General (ALT)");
  });
});
