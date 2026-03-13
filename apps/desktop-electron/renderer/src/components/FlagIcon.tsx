import { Globe } from "lucide-react";
import type { ReactElement } from "react";

/**
 * Полностью оффлайн SVG-флаги в круглых рамках.
 * CSS borderRadius + overflow:hidden вместо SVG clipPath (no ID conflicts).
 * 40+ стран — inline SVG геометрия. 0 сетевых запросов.
 */

type FlagSVG = ReactElement;

// Горизонтальный триколор
const tH = (c1: string, c2: string, c3: string): FlagSVG => (
  <svg viewBox="0 0 100 100" width="100%" height="100%">
    <rect width="100" height="34" fill={c1} />
    <rect y="33" width="100" height="34" fill={c2} />
    <rect y="66" width="100" height="34" fill={c3} />
  </svg>
);

// Вертикальный триколор
const tV = (c1: string, c2: string, c3: string): FlagSVG => (
  <svg viewBox="0 0 100 100" width="100%" height="100%">
    <rect width="34" height="100" fill={c1} />
    <rect x="33" width="34" height="100" fill={c2} />
    <rect x="66" width="34" height="100" fill={c3} />
  </svg>
);

// Двухцветный горизонтальный
const bH = (c1: string, c2: string): FlagSVG => (
  <svg viewBox="0 0 100 100" width="100%" height="100%">
    <rect width="100" height="50" fill={c1} />
    <rect y="50" width="100" height="50" fill={c2} />
  </svg>
);

const FLAGS: Record<string, FlagSVG> = {
  nl: tH("#AE1C28", "#FFF", "#21468B"),
  de: tH("#000", "#DD0000", "#FFCC00"),
  ru: tH("#FFF", "#0039A6", "#D52B1E"),
  lu: tH("#ED2939", "#FFF", "#00A1DE"),
  hu: tH("#CE2939", "#FFF", "#436F4D"),
  bg: tH("#FFF", "#00966E", "#D62612"),
  lt: tH("#FDB913", "#006A44", "#C1272D"),
  ee: tH("#0072CE", "#000", "#FFF"),
  lv: tH("#9E3039", "#FFF", "#9E3039"),
  at: tH("#ED2939", "#FFF", "#ED2939"),
  fr: tV("#002395", "#FFF", "#EF4135"),
  it: tV("#008C45", "#FFF", "#CD212A"),
  ie: tV("#169B62", "#FFF", "#FF883E"),
  be: tV("#000", "#FDDA24", "#EF3340"),
  ro: tV("#002B7F", "#FCD116", "#CE1126"),
  md: tV("#003DA5", "#FFD200", "#CC092F"),
  mx: tV("#006847", "#FFF", "#CE1126"),
  ng: tV("#008751", "#FFF", "#008751"),
  ua: bH("#005BBB", "#FFD500"),
  pl: bH("#FFF", "#DC143C"),
  id: bH("#FF0000", "#FFF"),
  mc: bH("#CE1126", "#FFF"),

  // США
  us: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#B22234" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
        <rect key={i} y={i * 7.69} width="100" height="7.69" fill={i % 2 === 0 ? "#B22234" : "#FFF"} />
      ))}
      <rect width="40" height="54" fill="#3C3B6E" />
    </svg>
  ),

  // Великобритания
  gb: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#012169" />
      <path d="M0,0 L100,100 M100,0 L0,100" stroke="#FFF" strokeWidth="16" />
      <path d="M0,0 L100,100 M100,0 L0,100" stroke="#C8102E" strokeWidth="8" />
      <path d="M50,0 V100 M0,50 H100" stroke="#FFF" strokeWidth="20" />
      <path d="M50,0 V100 M0,50 H100" stroke="#C8102E" strokeWidth="12" />
    </svg>
  ),

  // Япония
  jp: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#FFF" />
      <circle cx="50" cy="50" r="20" fill="#BC002D" />
    </svg>
  ),

  // Турция
  tr: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#E30A17" />
      <circle cx="42" cy="50" r="18" fill="#FFF" />
      <circle cx="47" cy="50" r="14" fill="#E30A17" />
    </svg>
  ),

  // Швейцария
  ch: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#D52B1E" />
      <rect x="38" y="20" width="24" height="60" rx="2" fill="#FFF" />
      <rect x="20" y="38" width="60" height="24" rx="2" fill="#FFF" />
    </svg>
  ),

  // Канада
  ca: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="25" height="100" fill="#FF0000" />
      <rect x="25" width="50" height="100" fill="#FFF" />
      <rect x="75" width="25" height="100" fill="#FF0000" />
      <rect x="42" y="30" width="16" height="40" rx="3" fill="#FF0000" />
    </svg>
  ),

  // Швеция
  se: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#006AA7" />
      <rect x="30" width="12" height="100" fill="#FECC02" />
      <rect y="40" width="100" height="12" fill="#FECC02" />
    </svg>
  ),

  // Финляндия
  fi: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#FFF" />
      <rect x="30" width="12" height="100" fill="#003580" />
      <rect y="40" width="100" height="12" fill="#003580" />
    </svg>
  ),

  // Норвегия
  no: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#BA0C2F" />
      <rect x="28" width="16" height="100" fill="#FFF" />
      <rect y="38" width="100" height="16" fill="#FFF" />
      <rect x="31" width="10" height="100" fill="#00205B" />
      <rect y="41" width="100" height="10" fill="#00205B" />
    </svg>
  ),

  // Дания
  dk: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#C60C30" />
      <rect x="30" width="12" height="100" fill="#FFF" />
      <rect y="40" width="100" height="12" fill="#FFF" />
    </svg>
  ),

  // Бразилия
  br: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#009C3B" />
      <polygon points="50,15 90,50 50,85 10,50" fill="#FFDF00" />
      <circle cx="50" cy="50" r="16" fill="#002776" />
    </svg>
  ),

  // Индия
  in: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="34" fill="#FF9933" />
      <rect y="33" width="100" height="34" fill="#FFF" />
      <rect y="66" width="100" height="34" fill="#138808" />
      <circle cx="50" cy="50" r="7" fill="none" stroke="#000080" strokeWidth="2" />
    </svg>
  ),

  // Испания
  es: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="25" fill="#AA151B" />
      <rect y="25" width="100" height="50" fill="#F1BF00" />
      <rect y="75" width="100" height="25" fill="#AA151B" />
    </svg>
  ),

  // Чехия
  cz: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="50" fill="#FFF" />
      <rect y="50" width="100" height="50" fill="#D7141A" />
      <polygon points="0,0 50,50 0,100" fill="#11457E" />
    </svg>
  ),

  // Сингапур
  sg: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="50" fill="#EF3340" />
      <rect y="50" width="100" height="50" fill="#FFF" />
      <circle cx="30" cy="28" r="12" fill="#FFF" />
      <circle cx="34" cy="28" r="12" fill="#EF3340" />
    </svg>
  ),

  // Австралия
  au: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#012169" />
      <path d="M0,0 L45,45 M45,0 L0,45" stroke="#FFF" strokeWidth="6" />
      <path d="M0,0 L45,45 M45,0 L0,45" stroke="#C8102E" strokeWidth="3" />
      <path d="M22,0 V45 M0,22 H45" stroke="#FFF" strokeWidth="8" />
      <path d="M22,0 V45 M0,22 H45" stroke="#C8102E" strokeWidth="5" />
      <polygon points="70,40 71,37 74,37 72,35 73,32 70,34 67,32 68,35 66,37 69,37" fill="#FFF" />
      <polygon points="80,65 81,62 84,62 82,60 83,57 80,59 77,57 78,60 76,62 79,62" fill="#FFF" />
      <polygon points="35,75 36,72 39,72 37,70 38,67 35,69 32,67 33,70 31,72 34,72" fill="#FFF" />
    </svg>
  ),

  // Израиль
  il: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#FFF" />
      <rect y="15" width="100" height="12" fill="#0038B8" />
      <rect y="73" width="100" height="12" fill="#0038B8" />
      <polygon points="50,30 62,55 38,55" fill="none" stroke="#0038B8" strokeWidth="3" />
      <polygon points="50,60 38,35 62,35" fill="none" stroke="#0038B8" strokeWidth="3" />
    </svg>
  ),

  // ОАЭ
  ae: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="34" fill="#00732F" />
      <rect y="33" width="100" height="34" fill="#FFF" />
      <rect y="66" width="100" height="34" fill="#000" />
      <rect width="25" height="100" fill="#FF0000" />
    </svg>
  ),

  // ЮАР
  za: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="34" fill="#DE3831" />
      <rect y="33" width="100" height="2" fill="#FFF" />
      <rect y="35" width="100" height="30" fill="#007A4D" />
      <rect y="65" width="100" height="2" fill="#FFF" />
      <rect y="67" width="100" height="33" fill="#002395" />
      <polygon points="0,0 35,50 0,100" fill="#FFB612" />
      <polygon points="0,8 28,50 0,92" fill="#000" />
    </svg>
  ),

  // Вьетнам
  vn: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#DA251D" />
      <polygon points="50,25 56,43 75,43 60,53 66,72 50,60 34,72 40,53 25,43 44,43" fill="#FF0" />
    </svg>
  ),

  // Таиланд
  th: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="17" fill="#A51931" />
      <rect y="17" width="100" height="16" fill="#F4F5F8" />
      <rect y="33" width="100" height="34" fill="#2D2A4A" />
      <rect y="67" width="100" height="16" fill="#F4F5F8" />
      <rect y="83" width="100" height="17" fill="#A51931" />
    </svg>
  ),

  // Казахстан
  kz: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#00AFCA" />
      <circle cx="50" cy="45" r="14" fill="#FEC50C" />
    </svg>
  ),

  // Грузия
  ge: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#FFF" />
      <rect x="42" width="16" height="100" fill="#FF0000" />
      <rect y="42" width="100" height="16" fill="#FF0000" />
    </svg>
  ),

  // Тайвань
  tw: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#FE0000" />
      <rect width="50" height="50" fill="#000095" />
      <circle cx="25" cy="25" r="10" fill="#FFF" />
    </svg>
  ),

  // Аргентина
  ar: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="34" fill="#74ACDF" />
      <rect y="33" width="100" height="34" fill="#FFF" />
      <rect y="66" width="100" height="34" fill="#74ACDF" />
      <circle cx="50" cy="50" r="7" fill="#F6B40E" />
    </svg>
  ),

  // Гонконг
  hk: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#DE2910" />
      <polygon points="50,25 56,43 75,43 60,53 66,72 50,60 34,72 40,53 25,43 44,43" fill="#FFF" />
    </svg>
  ),

  // Португалия
  pt: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="40" height="100" fill="#006600" />
      <rect x="40" width="60" height="100" fill="#FF0000" />
      <circle cx="40" cy="50" r="12" fill="#FFD700" />
    </svg>
  ),

  // Южная Корея
  kr: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect width="100" height="100" fill="#FFF" />
      <circle cx="50" cy="50" r="20" fill="#CD2E3A" />
      <path d="M50,30 A20,20 0 0,1 50,70" fill="#0047A0" />
      <circle cx="50" cy="40" r="10" fill="#0047A0" />
      <circle cx="50" cy="60" r="10" fill="#CD2E3A" />
    </svg>
  ),

  // Малайзия
  my: (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((i) => (
        <rect key={i} y={i * 7.14} width="100" height="7.14" fill={i % 2 === 0 ? "#CC0001" : "#FFF"} />
      ))}
      <rect width="50" height="50" fill="#010066" />
      <circle cx="22" cy="25" r="10" fill="#FC0" />
      <circle cx="26" cy="25" r="10" fill="#010066" />
    </svg>
  )
};

function hashColor(code: string): [string, string] {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = code.charCodeAt(i) + ((h << 5) - h);
  const a = Math.abs(h) % 360;
  return [`hsl(${a},65%,40%)`, `hsl(${(a + 40) % 360},55%,55%)`];
}

export function FlagIcon({ code, size = 28, className }: { code: string; size?: number; className?: string }) {
  const cc = (code || "").toLowerCase().trim();

  if (!cc || cc === "un" || cc === "unknown" || cc.length < 2) {
    return (
      <div
        className={className}
        style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <Globe className="w-4 h-4 text-white/30" strokeWidth={2} />
      </div>
    );
  }

  const flag = FLAGS[cc];
  if (flag) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          overflow: "hidden",
          border: "1.5px solid rgba(255,255,255,0.12)",
          flexShrink: 0
        }}
      >
        {flag}
      </div>
    );
  }

  // Fallback — градиентный кружок
  const [bg1, bg2] = hashColor(cc);
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${bg1}, ${bg2})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: size * 0.38,
        fontWeight: 800,
        letterSpacing: "0.05em",
        textShadow: "0 1px 2px rgba(0,0,0,0.4)",
        border: "1.5px solid rgba(255,255,255,0.15)",
        flexShrink: 0
      }}
    >
      {cc.toUpperCase().slice(0, 2)}
    </div>
  );
}
