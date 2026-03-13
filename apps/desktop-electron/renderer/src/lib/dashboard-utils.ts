/**
 * Утилиты для Dashboard: форматирование скорости и стилизация пинга.
 */

/** Авто-единицы скорости */
export function formatSpeed(kbps: number): { value: string; unit: string } {
  if (kbps >= 1024) {
    return { value: (kbps / 1024).toFixed(2), unit: "МБ/с" };
  }
  if (kbps > 0) {
    return { value: kbps.toFixed(0), unit: "КБ/с" };
  }
  return { value: "0", unit: "КБ/с" };
}

/** Яркие цвета пинга */
export function getPingStyle(ping: number | null): { color: string; glow: string; text: string } {
  if (!ping || ping <= 0) return { color: "text-subtle", glow: "", text: "--" };
  if (ping < 80)
    return { color: "text-emerald-400", glow: "shadow-[0_0_8px_rgba(52,211,153,0.4)]", text: `${ping} мс` };
  if (ping < 200)
    return { color: "text-yellow-400", glow: "shadow-[0_0_8px_rgba(250,204,21,0.4)]", text: `${ping} мс` };
  return { color: "text-red-400", glow: "shadow-[0_0_8px_rgba(248,113,113,0.4)]", text: `${ping} мс` };
}
