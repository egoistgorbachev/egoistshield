import { AnimatePresence, motion } from "framer-motion";
import { memo, useMemo, useState } from "react";
import { cn } from "../lib/cn";
import { CONTINENT_PATHS, COUNTRY_COORDS, latLngToSvg } from "../lib/world-map-data";
import type { ServerConfig } from "../store/useAppStore";
import { useAppStore } from "../store/useAppStore";

/* ──────────────────────────────────────────────────────────
   WorldMap v1 — "Inferno Atlas"
   Interactive SVG world map with server dots.
   Dot color = ping quality. Click = select server.
   Connected state = pulse + connection line.
   ────────────────────────────────────────────────────────── */

interface WorldMapProps {
  servers: ServerConfig[];
  onSelectCountry?: (countryCode: string) => void;
  className?: string;
}

/** Group servers by countryCode */
function groupByCountry(servers: ServerConfig[]) {
  const map = new Map<string, { servers: ServerConfig[]; bestPing: number }>();
  for (const s of servers) {
    const cc = s.countryCode?.toLowerCase() || "un";
    const group = map.get(cc) || { servers: [], bestPing: Infinity };
    group.servers.push(s);
    if (s.ping > 0 && s.ping < group.bestPing) group.bestPing = s.ping;
    map.set(cc, group);
  }
  return map;
}

/** Get dot color by ping */
function getPingColor(ping: number): { fill: string; glow: string; label: string } {
  if (ping <= 0 || ping === Infinity) return { fill: "#555", glow: "rgba(85,85,85,0.3)", label: "gray" };
  if (ping < 80) return { fill: "#10B981", glow: "rgba(16,185,129,0.5)", label: "green" };
  if (ping < 200) return { fill: "#F59E0B", glow: "rgba(245,158,11,0.5)", label: "yellow" };
  return { fill: "#EF4444", glow: "rgba(239,68,68,0.5)", label: "red" };
}

export const WorldMap = memo(function WorldMap({ servers, onSelectCountry, className }: WorldMapProps) {
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const selectedServerId = useAppStore((s) => s.selectedServerId);
  const isConnected = useAppStore((s) => s.isConnected);

  const countryGroups = useMemo(() => groupByCountry(servers), [servers]);

  // Find which country the selected server belongs to
  const selectedServer = useMemo(
    () => servers.find((s) => s.id === selectedServerId),
    [servers, selectedServerId]
  );
  const selectedCountryCode = selectedServer?.countryCode?.toLowerCase();

  // Get hovered group info for tooltip
  const hoveredGroup = hoveredCountry ? countryGroups.get(hoveredCountry) : null;
  const hoveredPoint = hoveredCountry ? COUNTRY_COORDS[hoveredCountry] : null;
  const hoveredCoords = hoveredPoint ? { ...latLngToSvg(hoveredPoint.lat, hoveredPoint.lng), name: hoveredPoint.name } : null;

  return (
    <div className={cn("relative w-full select-none", className)}>
      <svg
        viewBox="0 0 1000 500"
        className="w-full h-full"
        style={{ filter: "drop-shadow(0 0 40px rgba(255,107,0,0.05))" }}
      >
        <defs>
          {/* Gradient for continents */}
          <linearGradient id="continent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,107,0,0.06)" />
            <stop offset="100%" stopColor="rgba(255,107,0,0.02)" />
          </linearGradient>
          {/* Connection line gradient */}
          <linearGradient id="connection-line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(16,185,129,0.1)" />
            <stop offset="50%" stopColor="rgba(16,185,129,0.6)" />
            <stop offset="100%" stopColor="rgba(16,185,129,0.1)" />
          </linearGradient>
        </defs>

        {/* ── Continent outlines ── */}
        {CONTINENT_PATHS.map((d, i) => (
          <path
            key={`continent-${i}`}
            d={d}
            fill="url(#continent-grad)"
            stroke="rgba(255,107,0,0.08)"
            strokeWidth="0.8"
          />
        ))}

        {/* ── Grid dots (subtle) ── */}
        {Array.from({ length: 20 }, (_, xi) =>
          Array.from({ length: 10 }, (_, yi) => (
            <circle
              key={`grid-${xi}-${yi}`}
              cx={xi * 50 + 25}
              cy={yi * 50 + 25}
              r="0.5"
              fill="rgba(255,255,255,0.03)"
            />
          ))
        )}

        {/* ── Connection line (when connected) ── */}
        {isConnected && selectedCountryCode && COUNTRY_COORDS[selectedCountryCode] && (() => {
          const sv = latLngToSvg(COUNTRY_COORDS[selectedCountryCode]!.lat, COUNTRY_COORDS[selectedCountryCode]!.lng);
          return <motion.line
            x1="500"
            y1="250"
            x2={sv.x}
            y2={sv.y}
            stroke="url(#connection-line-grad)"
            strokeWidth="1.5"
            strokeDasharray="6 4"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
          />;
        })()}

        {/* ── Server dots ── */}
        {Array.from(countryGroups.entries()).map(([cc, group]) => {
          const point = COUNTRY_COORDS[cc];
          if (!point) return null;
          const coords = latLngToSvg(point.lat, point.lng);

          const pingColor = getPingColor(group.bestPing);
          const isActive = cc === selectedCountryCode;
          const isHovered = cc === hoveredCountry;
          const dotRadius = isActive ? 5 : isHovered ? 4.5 : 3.5;

          return (
            <g key={cc}>
              {/* Glow ring for active */}
              {isActive && isConnected && (
                <circle
                  cx={coords.x}
                  cy={coords.y}
                  r="12"
                  fill="none"
                  stroke="rgba(16,185,129,0.3)"
                  strokeWidth="1"
                  className="animate-connect-ring"
                  style={{ transformOrigin: `${coords.x}px ${coords.y}px` }}
                />
              )}

              {/* Outer glow */}
              <circle
                cx={coords.x}
                cy={coords.y}
                r={dotRadius + 4}
                fill={isActive ? "rgba(16,185,129,0.15)" : isHovered ? pingColor.glow : "transparent"}
                style={{ transition: "all 0.2s ease" }}
              />

              {/* Server dot */}
              <circle
                cx={coords.x}
                cy={coords.y}
                r={dotRadius}
                fill={isActive && isConnected ? "#10B981" : pingColor.fill}
                stroke={isActive ? "rgba(255,255,255,0.5)" : isHovered ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)"}
                strokeWidth={isActive ? "1.5" : "0.8"}
                className="cursor-pointer"
                style={{ transition: "all 0.2s ease", filter: isHovered || isActive ? `drop-shadow(0 0 6px ${pingColor.glow})` : "none" }}
                onMouseEnter={(e) => {
                  setHoveredCountry(cc);
                  const svgRect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
                  if (svgRect) {
                    const scaleX = svgRect.width / 1000;
                    const scaleY = svgRect.height / 500;
                    setTooltipPos({
                      x: coords.x * scaleX,
                      y: coords.y * scaleY
                    });
                  }
                }}
                onMouseLeave={() => setHoveredCountry(null)}
                onClick={() => onSelectCountry?.(cc)}
              />

              {/* Server count badge for clusters */}
              {group.servers.length > 1 && (
                <text
                  x={coords.x}
                  y={coords.y + 0.5}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize="5"
                  fontWeight="bold"
                  className="pointer-events-none"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                >
                  {group.servers.length}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* ── Tooltip ── */}
      <AnimatePresence>
        {hoveredCountry && hoveredGroup && hoveredCoords && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="absolute pointer-events-none z-50"
            style={{
              left: tooltipPos.x,
              top: tooltipPos.y - 8,
              transform: "translate(-50%, -100%)"
            }}
          >
            <div
              className="px-3 py-2 rounded-xl text-xs font-bold shadow-xl border whitespace-nowrap"
              style={{
                background: "rgba(12,12,18,0.95)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.08)"
              }}
            >
              <div className="text-white/90 mb-0.5">{hoveredCoords?.name}</div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="text-muted">
                  {hoveredGroup.servers.length} {hoveredGroup.servers.length === 1 ? "сервер" : hoveredGroup.servers.length < 5 ? "сервера" : "серверов"}
                </span>
                {hoveredGroup.bestPing < Infinity && (
                  <span className={cn(
                    "font-mono",
                    hoveredGroup.bestPing < 80 ? "text-emerald-400" :
                    hoveredGroup.bestPing < 200 ? "text-amber-400" : "text-red-400"
                  )}>
                    {hoveredGroup.bestPing} мс
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
