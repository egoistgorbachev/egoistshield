import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { getAPI } from "../lib/api";
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
const DEFAULT_USER_LOCATION = COUNTRY_COORDS.ru ?? { lat: 55.75, lng: 37.61, name: "Россия" };

type CoordinatePair = [number, number];
type PolygonRing = CoordinatePair[];
type PolygonGeometry = { type: "Polygon"; coordinates: PolygonRing[] };
type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: PolygonRing[][] };
type LandFeature = { type: "Feature"; geometry: PolygonGeometry | MultiPolygonGeometry };
type LandGeoJson = LandFeature | { type: "FeatureCollection"; features: LandFeature[] };
type ConnectionArcState = { curve: THREE.QuadraticBezierCurve3; particle: THREE.Mesh };

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable for globe texture generation.");
  }
  return context;
}

function isCoordinatePair(value: unknown): value is CoordinatePair {
  return Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number";
}

function getFirstCoordinate(coords: number[][]): CoordinatePair | null {
  const first = coords[0];
  return isCoordinatePair(first) ? first : null;
}

function getLandFeatures(land: unknown): LandFeature[] {
  const geoData = land as LandGeoJson;
  return geoData.type === "FeatureCollection" ? geoData.features : [geoData];
}

function getConnectionArcState(group: THREE.Group): ConnectionArcState | null {
  const userData = group.userData as Partial<ConnectionArcState>;
  if (!(userData.curve instanceof THREE.QuadraticBezierCurve3) || !(userData.particle instanceof THREE.Mesh)) {
    return null;
  }
  return { curve: userData.curve, particle: userData.particle };
}

interface Globe3DProps {
  servers: ServerConfig[];
  onSelectCountry?: (countryCode: string) => void;
  selectedServerId?: string;
  className?: string;
}

function groupByCountry(servers: ServerConfig[]) {
  const map = new Map<string, { servers: ServerConfig[]; bestPing: number }>();
  for (const s of servers) {
    const cc = s.countryCode?.toLowerCase() || "un";
    const group = map.get(cc) || { servers: [], bestPing: Number.POSITIVE_INFINITY };
    group.servers.push(s);
    if (s.ping > 0 && s.ping < group.bestPing) group.bestPing = s.ping;
    map.set(cc, group);
  }
  return map;
}

function getPingColor(ping: number): string {
  if (ping <= 0 || ping === Number.POSITIVE_INFINITY) return "#666666";
  if (ping < 80) return "#10B981";
  if (ping < 200) return "rgba(16, 185, 129, 0.7)"; // Use a softer green/brand for medium ping instead of orange
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
  const ctx = getCanvasContext(canvas);

  // Dark ocean background
  ctx.fillStyle = "#040A18";
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
    if (coords.length < 3) {
      return;
    }
    const firstCoordinate = getFirstCoordinate(coords);
    if (!firstCoordinate) {
      return;
    }
    const [firstLng, firstLat] = firstCoordinate;
    const [sx, sy] = project(firstLng, firstLat);
    ctx.moveTo(sx, sy);
    let prevLng = firstLng;
    for (let i = 1; i < coords.length; i++) {
      const point = coords[i];
      if (!isCoordinatePair(point)) {
        continue;
      }
      const [lng, lat] = point;
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

  // Land fill — cold ice/metal
  ctx.fillStyle = "rgba(100, 140, 200, 0.15)";

  // Render all land features using evenodd fill
  const features = getLandFeatures(land);
  for (const feat of features) {
    const geom = feat.geometry;
    if (geom.type === "Polygon") {
      ctx.beginPath();
      for (const ring of geom.coordinates) {
        drawRing(ring as number[][]);
      }
      ctx.fill("evenodd");
    } else if (geom.type === "MultiPolygon") {
      ctx.beginPath();
      for (const polygon of geom.coordinates) {
        for (const ring of polygon) {
          drawRing(ring as number[][]);
        }
      }
      ctx.fill("evenodd");
    }
  }

  // Smooth over pole convergence artifacts with radial gradient caps
  // North pole cap
  const northGrad = ctx.createRadialGradient(TEXTURE_WIDTH / 2, 0, 0, TEXTURE_WIDTH / 2, 0, TEXTURE_HEIGHT * 0.06);
  northGrad.addColorStop(0, "#040A18");
  northGrad.addColorStop(1, "rgba(4,10,24,0)");
  ctx.fillStyle = northGrad;
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT * 0.08);

  // South pole cap
  const southGrad = ctx.createRadialGradient(
    TEXTURE_WIDTH / 2,
    TEXTURE_HEIGHT,
    0,
    TEXTURE_WIDTH / 2,
    TEXTURE_HEIGHT,
    TEXTURE_HEIGHT * 0.06
  );
  southGrad.addColorStop(0, "#040A18");
  southGrad.addColorStop(1, "rgba(4,10,24,0)");
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
export const Globe3D = memo(function Globe3D({ servers, onSelectCountry, selectedServerId, className }: Globe3DProps) {
  return (
    <div className={cn("relative w-full h-full flex items-center justify-center", className)}>
      <Canvas
        camera={{ position: [0, 0, 6.0], fov: 40 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.08} />
        <directionalLight position={[5, 3, 5]} intensity={0.6} color="#FFFFFF" />
        <directionalLight position={[-4, -2, -4]} intensity={0.25} color="#FF4C29" />
        <pointLight position={[0, 0, 6]} intensity={0.15} color="#FF4C29" />

        <GlobeScene servers={servers} onSelectCountry={onSelectCountry} selectedServerId={selectedServerId} />

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
  onSelectCountry,
  selectedServerId
}: {
  servers: ServerConfig[];
  onSelectCountry?: (countryCode: string) => void;
  selectedServerId?: string;
}) {
  const isConnected = useAppStore((s) => s.isConnected);
  const countryGroups = useMemo(() => groupByCountry(servers), [servers]);
  const selectedServer = useMemo(() => servers.find((s) => s.id === selectedServerId), [servers, selectedServerId]);
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
        <ConnectionArc lat={COUNTRY_COORDS[selectedCC].lat} lng={COUNTRY_COORDS[selectedCC].lng} />
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
        color: "#040A18",
        emissive: "#061224",
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 0.95
      });
    }
    return new THREE.MeshPhongMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: new THREE.Color("#4a8cc7"),
      emissiveIntensity: 0.15,
      shininess: 12,
      transparent: true,
      opacity: 0.98
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
      <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
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
          vec3 color = mix(vec3(0.1, 0.4, 0.8), vec3(0.2, 0.6, 1.0), intensity);
          gl_FragColor = vec4(color, intensity * 0.45);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false
    });
  }, []);

  return (
    <mesh material={mat}>
      <sphereGeometry args={[GLOBE_RADIUS * 1.12, 32, 32]} />
    </mesh>
  );
}

/* ── Server Dot ─────────────────────────────────────────── */
function ServerDot({
  cc,
  lat,
  lng,
  name,
  count,
  ping,
  color,
  isActive,
  isConnected,
  isHovered,
  onHover,
  onClick
}: {
  cc: string;
  lat: number;
  lng: number;
  name: string;
  count: number;
  ping: number;
  color: string;
  isActive: boolean;
  isConnected: boolean;
  isHovered: boolean;
  onHover: (cc: string | null) => void;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const pos = useMemo(() => latLngToVector3(lat, lng, GLOBE_RADIUS + 0.015), [lat, lng]);
  const baseRadius = DOT_RADIUS + Math.min(count * 0.005, 0.03);
  const radius = isActive ? DOT_RADIUS_ACTIVE + 0.02 : isHovered ? baseRadius * 1.4 : baseRadius;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (meshRef.current) {
      if (isConnected) {
        meshRef.current.scale.setScalar(1 + Math.sin(t * 3) * 0.25);
      } else if (isActive) {
        meshRef.current.scale.setScalar(1 + Math.sin(t * 4) * 0.1);
      } else {
        meshRef.current.scale.setScalar(1);
      }
    }

    if (glowRef.current) {
      const pulseSpeed = isConnected ? 3 : isActive ? 2 : 1.5;
      const pulseAmount = isConnected ? 0.4 : 0.2;
      const s = 1 + Math.sin(t * pulseSpeed) * pulseAmount;
      glowRef.current.scale.setScalar(s);
      const material = glowRef.current.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        material.opacity = (isConnected ? 0.2 : 0.1) + Math.sin(t * pulseSpeed) * 0.05;
      }
    }
  });

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      onHover(cc);
    },
    [cc, onHover]
  );
  const handlePointerOut = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      onHover(null);
    },
    [onHover]
  );
  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      onClick();
    },
    [onClick]
  );

  return (
    <group position={pos}>
      {/* Outer glow ring */}
      {(isActive || isHovered) && (
        <mesh ref={glowRef}>
          <sphereGeometry args={[radius * 3.5, 8, 8]} />
          <meshBasicMaterial color={isConnected ? "#10B981" : color} transparent opacity={0.12} depthWrite={false} />
        </mesh>
      )}

      {/* Core dot */}
      <mesh
        ref={meshRef}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerDown={handlePointerDown}
      >
        <sphereGeometry args={[radius, 8, 8]} />
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
            color: isActive ? (isConnected ? "#FF4C29" : "#FF6B47") : "rgba(255,255,255,0.7)",
            textShadow: "0 0 8px rgba(0,0,0,1), 0 0 16px rgba(0,0,0,0.8), 0 1px 4px rgba(0,0,0,0.9)"
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
              boxShadow:
                "0 12px 40px rgba(0,0,0,0.7), 0 0 20px rgba(38,201,154,0.08), inset 0 1px 0 rgba(255,255,255,0.06)"
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, rgba(16,16,28,0.98), rgba(10,10,18,0.99))",
                borderRadius: "15px",
                padding: "10px 14px"
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
                {ping < Number.POSITIVE_INFINITY && ping > 0 && (
                  <div className="flex items-center gap-1.5">
                    {/* Signal bars */}
                    <div className="flex items-end gap-[2px] h-3">
                      {[0.33, 0.55, 0.77, 1.0].map((h, i) => (
                        <div
                          key={`${h}-${i <= 1 ? "low" : i <= 2 ? "mid" : "high"}`}
                          className="w-[3px] rounded-sm"
                          style={{
                            height: `${h * 12}px`,
                            backgroundColor:
                              ping < 80
                                ? i <= 3
                                  ? "#10B981"
                                  : "rgba(255,255,255,0.1)"
                                : ping < 200
                                  ? i <= 2
                                    ? "rgba(16, 185, 129, 0.7)"
                                    : "rgba(255,255,255,0.1)"
                                  : i <= 1
                                    ? "#EF4444"
                                    : "rgba(255,255,255,0.1)"
                          }}
                        />
                      ))}
                    </div>
                    <span
                      className={cn(
                        "font-mono font-bold",
                        ping < 80 ? "text-emerald-400" : ping < 200 ? "text-amber-400" : "text-red-400"
                      )}
                    >
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
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const fetchIp = async () => {
      const api = getAPI();
      const response = api ? await api.system.getMyIp() : null;
      const countryCode = response?.countryCode?.toLowerCase();
      const location = countryCode ? COUNTRY_COORDS[countryCode] : null;
      if (location) {
        setUserLoc(location);
        return;
      }
      setUserLoc(DEFAULT_USER_LOCATION);
    };
    void fetchIp();
  }, []);

  useEffect(() => {
    if (!groupRef.current || !userLoc) {
      return;
    }
    // Clear previous
    while (groupRef.current.children.length > 0) {
      const firstChild = groupRef.current.children[0];
      if (!firstChild) {
        break;
      }
      groupRef.current.remove(firstChild);
    }

    const start = new THREE.Vector3(...latLngToVector3(userLoc.lat, userLoc.lng, GLOBE_RADIUS + 0.015));
    const end = new THREE.Vector3(...latLngToVector3(lat, lng, GLOBE_RADIUS + 0.015));

    const dist = start.distanceTo(end);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const arcHeight = GLOBE_RADIUS + 0.015 + Math.min(dist * 0.4, 1.2);
    mid.normalize().multiplyScalar(arcHeight);

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const points = curve.getPoints(40);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
      color: "#10B981",
      transparent: true,
      opacity: 0.6,
      depthWrite: false
    });

    const line = new THREE.Line(geometry, material);
    groupRef.current.add(line);

    // Particle traveling along the curve
    const particleGeo = new THREE.SphereGeometry(0.035, 8, 8);
    const particleMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 });
    const particle = new THREE.Mesh(particleGeo, particleMat);
    groupRef.current.add(particle);

    groupRef.current.userData = { curve, particle } satisfies ConnectionArcState;

    return () => {
      geometry.dispose();
      material.dispose();
      particleGeo.dispose();
      particleMat.dispose();
    };
  }, [lat, lng, userLoc]);

  // Animate opacity and particle
  useFrame(({ clock }) => {
    if (!groupRef.current) {
      return;
    }
    const arcState = getConnectionArcState(groupRef.current);
    if (!arcState) {
      return;
    }
    const { curve, particle } = arcState;

    const line = groupRef.current.children[0];
    if (line instanceof THREE.Line) {
      const material = line.material;
      if (material instanceof THREE.LineBasicMaterial) {
        material.opacity = 0.3 + Math.sin(clock.elapsedTime * 3) * 0.15;
      }
    }

    const t = (clock.elapsedTime * 0.5) % 1;
    const pos = curve.getPoint(t);
    particle.position.copy(pos);

    const pScale = 1 + Math.sin(clock.elapsedTime * 15) * 0.4;
    particle.scale.setScalar(pScale);
  });

  return <group ref={groupRef} />;
}
