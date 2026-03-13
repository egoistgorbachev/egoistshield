import { OrbitControls, Html } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import { cn } from "../lib/cn";
import { COUNTRY_COORDS, latLngToVector3 } from "../lib/world-map-data";
import type { ServerConfig } from "../store/useAppStore";
import { useAppStore } from "../store/useAppStore";

/* ──────────────────────────────────────────────────────────
   Globe3D v2 — "Inferno Sphere" with REAL continents
   Three.js WebGL globe with:
   - Canvas2D texture generated from world-atlas TopoJSON
   - Real country borders (Natural Earth 110m)
   - Server dots with country labels
   - Atmosphere glow shader
   - Auto-rotation + OrbitControls drag
   ────────────────────────────────────────────────────────── */

const GLOBE_RADIUS = 2.1; // 5% bigger than v1
const DOT_RADIUS = 0.05;
const DOT_RADIUS_ACTIVE = 0.07;
const TEXTURE_WIDTH = 2048;
const TEXTURE_HEIGHT = 1024;

interface Globe3DProps {
  servers: ServerConfig[];
  onSelectCountry?: (countryCode: string) => void;
  className?: string;
}

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

function getPingColor(ping: number): string {
  if (ping <= 0 || ping === Infinity) return "#666666";
  if (ping < 80) return "#10B981";
  if (ping < 200) return "#F59E0B";
  return "#EF4444";
}

/* ── Generate Canvas2D world map texture from TopoJSON ──── */
async function generateWorldTexture(): Promise<THREE.CanvasTexture> {
  const worldTopo = (await import("world-atlas/land-110m.json")) as unknown as Topology<{
    land: GeometryCollection;
  }>;

  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const ctx = canvas.getContext("2d")!;

  // Dark ocean background
  ctx.fillStyle = "#08080C";
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

  // Convert topology to GeoJSON
  const land = feature(worldTopo, worldTopo.objects.land);

  // Equirectangular projection helper
  const project = (lng: number, lat: number): [number, number] => {
    const x = ((lng + 180) / 360) * TEXTURE_WIDTH;
    const y = ((90 - lat) / 180) * TEXTURE_HEIGHT;
    return [x, y];
  };

  // Draw ring with antimeridian split — prevents artifacts when polygons
  // cross the date line (e.g. Russia, Alaska), which creates horizontal
  // lines spanning the entire texture width.
  const drawRing = (coords: number[][]) => {
    if (coords.length < 3) return;
    const [sx, sy] = project(coords[0]![0]!, coords[0]![1]!);
    ctx.moveTo(sx, sy);
    let prevLng = coords[0]![0]!;
    for (let i = 1; i < coords.length; i++) {
      const lng = coords[i]![0]!;
      const lat = coords[i]![1]!;
      const [px, py] = project(lng, lat);
      // Detect antimeridian crossing: large lng jump (> 90°)
      const lngDiff = Math.abs(lng - prevLng);
      if (lngDiff > 90) {
        // Break the path — moveTo instead of lineTo
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
      prevLng = lng;
    }
    ctx.closePath();
  };

  // Land fill — no stroke at all
  ctx.fillStyle = "rgba(255, 107, 0, 0.10)";

  // Render all land features using evenodd fill
  const geoData = land as any;
  const features: any[] = geoData.type === "FeatureCollection" ? geoData.features : [geoData];
  for (const feat of features) {
    const geom = feat.geometry;
    if (geom.type === "Polygon") {
      ctx.beginPath();
      for (const ring of geom.coordinates) {
        drawRing(ring as number[][]);
      }
      ctx.fill('evenodd');
    } else if (geom.type === "MultiPolygon") {
      ctx.beginPath();
      for (const polygon of geom.coordinates) {
        for (const ring of polygon) {
          drawRing(ring as number[][]);
        }
      }
      ctx.fill('evenodd');
    }
  }

  // Smooth over pole convergence artifacts with radial gradient caps
  // North pole cap
  const northGrad = ctx.createRadialGradient(
    TEXTURE_WIDTH / 2, 0, 0,
    TEXTURE_WIDTH / 2, 0, TEXTURE_HEIGHT * 0.06
  );
  northGrad.addColorStop(0, "#08080C");
  northGrad.addColorStop(1, "rgba(8,8,12,0)");
  ctx.fillStyle = northGrad;
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT * 0.08);

  // South pole cap
  const southGrad = ctx.createRadialGradient(
    TEXTURE_WIDTH / 2, TEXTURE_HEIGHT, 0,
    TEXTURE_WIDTH / 2, TEXTURE_HEIGHT, TEXTURE_HEIGHT * 0.06
  );
  southGrad.addColorStop(0, "#08080C");
  southGrad.addColorStop(1, "rgba(8,8,12,0)");
  ctx.fillStyle = southGrad;
  ctx.fillRect(0, TEXTURE_HEIGHT * 0.92, TEXTURE_WIDTH, TEXTURE_HEIGHT * 0.08);

  // Create Three.js texture
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

/* ── Main Globe3D wrapper ───────────────────────────────── */
export const Globe3D = memo(function Globe3D({ servers, onSelectCountry, className }: Globe3DProps) {
  return (
    <div className={cn("relative w-full h-full flex items-center justify-center", className)}>
      <Canvas
        camera={{ position: [0, 0, 6.0], fov: 40 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.08} />
        <directionalLight position={[5, 3, 5]} intensity={0.6} color="#FFFFFF" />
        <directionalLight position={[-4, -2, -4]} intensity={0.25} color="#FF6B00" />
        <pointLight position={[0, 0, 6]} intensity={0.15} color="#FF6B00" />

        <GlobeScene servers={servers} onSelectCountry={onSelectCountry} />

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          rotateSpeed={0.4}
          autoRotate
          autoRotateSpeed={0.3}
          minPolarAngle={Math.PI * 0.1}
          maxPolarAngle={Math.PI * 0.9}
          dampingFactor={0.08}
          enableDamping
        />
      </Canvas>
    </div>
  );
});

/* ── Globe Scene (inside Canvas) ────────────────────────── */
function GlobeScene({
  servers,
  onSelectCountry
}: {
  servers: ServerConfig[];
  onSelectCountry?: (countryCode: string) => void;
}) {
  const selectedServerId = useAppStore((s) => s.selectedServerId);
  const isConnected = useAppStore((s) => s.isConnected);
  const countryGroups = useMemo(() => groupByCountry(servers), [servers]);
  const selectedServer = useMemo(
    () => servers.find((s) => s.id === selectedServerId),
    [servers, selectedServerId]
  );
  const selectedCC = selectedServer?.countryCode?.toLowerCase();
  const [hoveredCC, setHoveredCC] = useState<string | null>(null);

  return (
    <group>
      <GlobeSphere />
      <AtmosphereGlow />

      {/* Server dots */}
      {Array.from(countryGroups.entries()).map(([cc, group]) => {
        const coords = COUNTRY_COORDS[cc];
        if (!coords) return null;
        return (
          <ServerDot
            key={cc}
            cc={cc}
            lat={coords.lat}
            lng={coords.lng}
            name={coords.name}
            count={group.servers.length}
            ping={group.bestPing}
            color={getPingColor(group.bestPing)}
            isActive={cc === selectedCC}
            isConnected={cc === selectedCC && isConnected}
            isHovered={cc === hoveredCC}
            onHover={setHoveredCC}
            onClick={() => onSelectCountry?.(cc)}
          />
        );
      })}

      {/* Connection arc */}
      {isConnected && selectedCC && COUNTRY_COORDS[selectedCC] && (
        <ConnectionArc
          lat={COUNTRY_COORDS[selectedCC].lat}
          lng={COUNTRY_COORDS[selectedCC].lng}
        />
      )}
    </group>
  );
}

/* ── Globe Sphere with Real Continent Texture ───────────── */
function GlobeSphere() {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    generateWorldTexture().then(setTexture);
  }, []);

  const material = useMemo(() => {
    if (!texture) {
      return new THREE.MeshPhongMaterial({
        color: "#0a0a12",
        emissive: "#0d0d1a",
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 0.95,
      });
    }
    return new THREE.MeshPhongMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: new THREE.Color("#FF6B00"),
      emissiveIntensity: 0.25,
      shininess: 12,
      transparent: true,
      opacity: 0.98,
    });
  }, [texture]);

  // Update material when texture loads
  useEffect(() => {
    if (meshRef.current && texture) {
      (meshRef.current.material as THREE.MeshPhongMaterial).map = texture;
      (meshRef.current.material as THREE.MeshPhongMaterial).emissiveMap = texture;
      (meshRef.current.material as THREE.MeshPhongMaterial).needsUpdate = true;
    }
  }, [texture]);

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[GLOBE_RADIUS, 128, 128]} />
    </mesh>
  );
}

/* ── Atmosphere Glow (custom shader) ────────────────────── */
function AtmosphereGlow() {
  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
          vec3 color = mix(vec3(1.0, 0.42, 0.0), vec3(1.0, 0.65, 0.2), intensity);
          gl_FragColor = vec4(color, intensity * 0.45);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
  }, []);

  return (
    <mesh material={mat}>
      <sphereGeometry args={[GLOBE_RADIUS * 1.12, 64, 64]} />
    </mesh>
  );
}

/* ── Server Dot ─────────────────────────────────────────── */
function ServerDot({
  cc, lat, lng, name, count, ping, color,
  isActive, isConnected, isHovered,
  onHover, onClick
}: {
  cc: string; lat: number; lng: number; name: string;
  count: number; ping: number; color: string;
  isActive: boolean; isConnected: boolean; isHovered: boolean;
  onHover: (cc: string | null) => void; onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const pos = useMemo(() => latLngToVector3(lat, lng, GLOBE_RADIUS + 0.015), [lat, lng]);
  const radius = isActive ? DOT_RADIUS_ACTIVE : isHovered ? DOT_RADIUS * 1.4 : DOT_RADIUS;

  useFrame(({ clock }) => {
    if (meshRef.current && isConnected) {
      const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.25;
      meshRef.current.scale.setScalar(s);
    } else if (meshRef.current) {
      meshRef.current.scale.setScalar(1);
    }
    if (glowRef.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 2) * 0.3;
      glowRef.current.scale.setScalar(s);
    }
  });

  const handlePointerOver = useCallback(() => onHover(cc), [cc, onHover]);
  const handlePointerOut = useCallback(() => onHover(null), [onHover]);

  return (
    <group position={pos}>
      {/* Outer glow ring */}
      {(isActive || isHovered) && (
        <mesh ref={glowRef}>
          <sphereGeometry args={[radius * 3.5, 16, 16]} />
          <meshBasicMaterial
            color={isConnected ? "#10B981" : color}
            transparent opacity={0.12} depthWrite={false}
          />
        </mesh>
      )}

      {/* Core dot */}
      <mesh
        ref={meshRef}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      >
        <sphereGeometry args={[radius, 16, 16]} />
        <meshBasicMaterial color={isConnected ? "#10B981" : color} />
      </mesh>

      {/* Country label */}
      <Html
        position={[0, radius + 0.07, 0]}
        center
        distanceFactor={5.2}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          className="text-[11px] font-bold tracking-wider whitespace-nowrap"
          style={{
            color: isActive ? (isConnected ? "#10B981" : "#FF6B00") : "rgba(255,255,255,0.7)",
            textShadow: "0 0 8px rgba(0,0,0,1), 0 0 16px rgba(0,0,0,0.8), 0 1px 4px rgba(0,0,0,0.9)",
          }}
        >
          {cc.toUpperCase()}
          {count > 1 && <span style={{ opacity: 0.5, marginLeft: 2 }}>×{count}</span>}
        </div>
      </Html>

      {/* Premium tooltip on hover */}
      {isHovered && (
        <Html
          position={[0, radius + 0.22, 0]}
          center
          distanceFactor={5.2}
          style={{ pointerEvents: "none", zIndex: 50 }}
        >
          <div
            className="rounded-2xl text-xs shadow-2xl whitespace-nowrap"
            style={{
              background: "linear-gradient(135deg, rgba(12,12,20,0.97), rgba(8,8,14,0.99))",
              padding: "1px",
              borderRadius: "16px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.7), 0 0 20px rgba(255,107,0,0.08), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, rgba(16,16,28,0.98), rgba(10,10,18,0.99))",
                borderRadius: "15px",
                padding: "10px 14px",
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
                />
                <span className="text-white font-bold text-[13px]">{name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-muted font-mono">
                  {cc.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 text-[11px]">
                <span className="text-muted">
                  {count} {count === 1 ? "сервер" : count < 5 ? "сервера" : "серверов"}
                </span>
                {ping < Infinity && ping > 0 && (
                  <div className="flex items-center gap-1.5">
                    {/* Signal bars */}
                    <div className="flex items-end gap-[2px] h-3">
                      {[0.33, 0.55, 0.77, 1.0].map((h, i) => (
                        <div
                          key={i}
                          className="w-[3px] rounded-sm"
                          style={{
                            height: `${h * 12}px`,
                            backgroundColor: ping < 80
                              ? (i <= 3 ? "#10B981" : "rgba(255,255,255,0.1)")
                              : ping < 200
                                ? (i <= 2 ? "#F59E0B" : "rgba(255,255,255,0.1)")
                                : (i <= 1 ? "#EF4444" : "rgba(255,255,255,0.1)"),
                          }}
                        />
                      ))}
                    </div>
                    <span className={cn(
                      "font-mono font-bold",
                      ping < 80 ? "text-emerald-400" : ping < 200 ? "text-amber-400" : "text-red-400"
                    )}>
                      {ping} мс
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

/* ── Connection Arc ─────────────────────────────────────── */
function ConnectionArc({ lat, lng }: { lat: number; lng: number }) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!groupRef.current) return;
    // Clear previous
    while (groupRef.current.children.length) groupRef.current.remove(groupRef.current.children[0]!);

    const start = new THREE.Vector3(0, 0, 0);
    const end = new THREE.Vector3(...latLngToVector3(lat, lng, GLOBE_RADIUS + 0.015));
    const mid = start.clone().add(end).multiplyScalar(0.5);
    mid.normalize().multiplyScalar(GLOBE_RADIUS * 1.5);
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const points = curve.getPoints(50);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: "#10B981",
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    groupRef.current.add(line);

    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [lat, lng]);

  // Animate opacity
  useFrame(({ clock }) => {
    if (!groupRef.current?.children[0]) return;
    const mat = (groupRef.current.children[0] as THREE.Line).material as THREE.LineBasicMaterial;
    mat.opacity = 0.35 + Math.sin(clock.elapsedTime * 2) * 0.15;
  });

  return <group ref={groupRef} />;
}
