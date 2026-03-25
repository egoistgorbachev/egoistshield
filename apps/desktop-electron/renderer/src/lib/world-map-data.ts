/**
 * World Map Data — Country coordinates (lat/lng) for 3D globe & 2D fallback.
 * Used by Globe3D.tsx and WorldMap.tsx.
 */

export interface CountryPoint {
  lat: number;
  lng: number;
  name: string;
}

/** Country capital/center coordinates (lat, lng in degrees) */
export const COUNTRY_COORDS: Record<string, CountryPoint> = {
  // ── Europe ──
  ru: { lat: 55.75, lng: 37.62, name: "Россия" },
  de: { lat: 52.52, lng: 13.41, name: "Германия" },
  nl: { lat: 52.37, lng: 4.9, name: "Нидерланды" },
  gb: { lat: 51.51, lng: -0.13, name: "Великобритания" },
  fr: { lat: 48.86, lng: 2.35, name: "Франция" },
  fi: { lat: 60.17, lng: 24.94, name: "Финляндия" },
  se: { lat: 59.33, lng: 18.07, name: "Швеция" },
  no: { lat: 59.91, lng: 10.75, name: "Норвегия" },
  dk: { lat: 55.68, lng: 12.57, name: "Дания" },
  pl: { lat: 52.23, lng: 21.01, name: "Польша" },
  cz: { lat: 50.08, lng: 14.44, name: "Чехия" },
  at: { lat: 48.21, lng: 16.37, name: "Австрия" },
  ch: { lat: 46.95, lng: 7.45, name: "Швейцария" },
  it: { lat: 41.9, lng: 12.5, name: "Италия" },
  es: { lat: 40.42, lng: -3.7, name: "Испания" },
  pt: { lat: 38.72, lng: -9.14, name: "Португалия" },
  ie: { lat: 53.35, lng: -6.26, name: "Ирландия" },
  hu: { lat: 47.5, lng: 19.04, name: "Венгрия" },
  ro: { lat: 44.43, lng: 26.1, name: "Румыния" },
  bg: { lat: 42.7, lng: 23.32, name: "Болгария" },
  gr: { lat: 37.98, lng: 23.73, name: "Греция" },
  hr: { lat: 45.81, lng: 15.98, name: "Хорватия" },
  rs: { lat: 44.79, lng: 20.47, name: "Сербия" },
  sk: { lat: 48.15, lng: 17.11, name: "Словакия" },
  si: { lat: 46.06, lng: 14.51, name: "Словения" },
  lv: { lat: 56.95, lng: 24.11, name: "Латвия" },
  lt: { lat: 54.69, lng: 25.28, name: "Литва" },
  ee: { lat: 59.44, lng: 24.75, name: "Эстония" },
  ua: { lat: 50.45, lng: 30.52, name: "Украина" },
  md: { lat: 47.01, lng: 28.86, name: "Молдова" },
  by: { lat: 53.9, lng: 27.57, name: "Беларусь" },
  // ── CIS / Caucasus ──
  ge: { lat: 41.72, lng: 44.79, name: "Грузия" },
  am: { lat: 40.18, lng: 44.51, name: "Армения" },
  az: { lat: 40.41, lng: 49.87, name: "Азербайджан" },
  tr: { lat: 39.93, lng: 32.86, name: "Турция" },
  kz: { lat: 51.17, lng: 71.45, name: "Казахстан" },
  uz: { lat: 41.3, lng: 69.28, name: "Узбекистан" },
  kg: { lat: 42.87, lng: 74.59, name: "Кыргызстан" },
  tj: { lat: 38.56, lng: 68.77, name: "Таджикистан" },
  tm: { lat: 37.95, lng: 58.38, name: "Туркменистан" },
  // ── Asia ──
  mn: { lat: 47.91, lng: 106.91, name: "Монголия" },
  jp: { lat: 35.68, lng: 139.69, name: "Япония" },
  kr: { lat: 37.57, lng: 126.98, name: "Южная Корея" },
  cn: { lat: 39.9, lng: 116.4, name: "Китай" },
  hk: { lat: 22.32, lng: 114.17, name: "Гонконг" },
  tw: { lat: 25.03, lng: 121.57, name: "Тайвань" },
  sg: { lat: 1.35, lng: 103.82, name: "Сингапур" },
  th: { lat: 13.76, lng: 100.5, name: "Таиланд" },
  vn: { lat: 21.03, lng: 105.85, name: "Вьетнам" },
  in: { lat: 28.61, lng: 77.21, name: "Индия" },
  id: { lat: -6.21, lng: 106.85, name: "Индонезия" },
  my: { lat: 3.14, lng: 101.69, name: "Малайзия" },
  ph: { lat: 14.6, lng: 120.98, name: "Филиппины" },
  il: { lat: 31.77, lng: 35.23, name: "Израиль" },
  ae: { lat: 25.2, lng: 55.27, name: "ОАЭ" },
  // ── Americas ──
  us: { lat: 38.91, lng: -77.04, name: "США" },
  ca: { lat: 45.42, lng: -75.7, name: "Канада" },
  mx: { lat: 19.43, lng: -99.13, name: "Мексика" },
  br: { lat: -15.79, lng: -47.88, name: "Бразилия" },
  ar: { lat: -34.6, lng: -58.38, name: "Аргентина" },
  cl: { lat: -33.45, lng: -70.67, name: "Чили" },
  co: { lat: 4.71, lng: -74.07, name: "Колумбия" },
  pe: { lat: -12.05, lng: -77.04, name: "Перу" },
  // ── Africa & Oceania ──
  za: { lat: -33.93, lng: 18.42, name: "ЮАР" },
  au: { lat: -33.87, lng: 151.21, name: "Австралия" },
  nz: { lat: -41.29, lng: 174.78, name: "Новая Зеландия" }
};

/** Convert lat/lng (degrees) to SVG coordinates for the 1000×500 viewBox (Equirectangular) */
export function latLngToSvg(lat: number, lng: number): { x: number; y: number } {
  return {
    x: (lng + 180) * (1000 / 360),
    y: (90 - lat) * (500 / 180)
  };
}

/** Convert lat/lng (degrees) to 3D position on a sphere of given radius */
export function latLngToVector3(lat: number, lng: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return [x, y, z];
}

/**
 * Simplified continent outlines as SVG path "d" strings.
 * Equirectangular projection matching viewBox 0 0 1000 500.
 */
export const CONTINENT_PATHS: string[] = [
  // North America
  "M 80 80 L 120 60 160 55 200 65 230 80 250 100 260 130 250 160 230 180 200 190 180 200 160 210 130 200 100 180 80 160 70 130 Z",
  // South America
  "M 200 220 L 220 210 240 220 250 250 245 280 235 310 225 340 215 360 200 370 185 360 180 330 185 300 190 270 Z",
  // Europe
  "M 470 60 L 490 55 510 60 530 65 545 75 550 90 540 100 525 108 510 112 495 108 480 100 470 90 Z",
  // Africa
  "M 470 150 L 490 140 520 145 540 160 545 185 540 210 530 240 520 265 510 280 495 285 480 278 470 260 468 240 465 215 460 190 465 165 Z",
  // Asia
  "M 550 50 L 580 42 620 38 670 40 720 48 760 55 790 70 810 90 820 115 810 135 790 148 760 155 730 158 700 160 670 155 640 148 610 135 585 120 565 100 555 80 Z",
  // Australia
  "M 780 270 L 810 260 840 265 860 280 860 300 845 315 820 318 800 310 785 295 Z",
  // Antarctica (subtle)
  "M 100 470 L 250 465 400 462 550 465 700 468 850 472 900 478 50 478 Z"
];
