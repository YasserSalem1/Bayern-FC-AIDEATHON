/**
 * Builds src/components/map/site-geometry.json from OpenStreetMap (Overpass API).
 * Run: npx tsx scripts/build-map.ts
 *
 * The output is committed, so the app needs no network at runtime.
 * Map data © OpenStreetMap contributors, available under the ODbL.
 */
import { writeFileSync } from 'node:fs';

// Projection window (WGS84) → 1000 × 750 logical canvas, north up, ~0.48 px per metre.
export const BOUNDS = { lat0: 48.2093, lat1: 48.2233, lon0: 11.6075, lon1: 11.6355, w: 1000, h: 750 };
const BBOX = `${BOUNDS.lat0},${BOUNDS.lon0},${BOUNDS.lat1},${BOUNDS.lon1}`;

const QUERY = `[out:json][timeout:90];
(
  way["leisure"="stadium"](${BBOX});
  way["railway"~"subway|platform"](${BBOX});
  way["highway"~"^(motorway|motorway_link|trunk|primary|secondary|tertiary|unclassified|service|footway|pedestrian|path|steps)$"](${BBOX});
  way["area:highway"~"motorway|motorway_link"](${BBOX});
  way["landuse"~"grass|meadow|forest"](${BBOX});
  way["natural"~"wood|scrub|grassland|heath"](${BBOX});
  way["building"](${BBOX});
  way["amenity"="parking"](${BBOX});
  relation["amenity"="parking"](${BBOX});
  node["power"="generator"](${BBOX});
);
out geom tags;`;

type Pt = [number, number];
interface El {
  type: string;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  lat?: number;
  lon?: number;
}

const proj = (lat: number, lon: number): Pt => [
  Math.round(((lon - BOUNDS.lon0) / (BOUNDS.lon1 - BOUNDS.lon0)) * BOUNDS.w * 10) / 10,
  Math.round(((BOUNDS.lat1 - lat) / (BOUNDS.lat1 - BOUNDS.lat0)) * BOUNDS.h * 10) / 10,
];

/** Ramer–Douglas–Peucker simplification. */
function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = 0;
  let max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], a, b);
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

const inView = (pts: Pt[]) => pts.some(([x, y]) => x > -60 && x < BOUNDS.w + 60 && y > -60 && y < BOUNDS.h + 60);

async function main() {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'the-third-half-demo/1.0' },
    body: new URLSearchParams({ data: QUERY }),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const { elements } = (await res.json()) as { elements: El[] };

  const out: Record<string, Pt[][]> = {
    meadow: [],
    wood: [],
    building: [],
    motorwayArea: [],
    motorway: [],
    road: [],
    service: [],
    footway: [],
    esplanade: [],
    subway: [],
    platform: [],
    parking: [],
  };
  const named: Record<string, Pt[]> = {};
  const points: Record<string, Pt> = {};

  for (const e of elements) {
    const t = e.tags ?? {};
    if (e.type === 'node' && e.lat !== undefined && e.lon !== undefined) {
      if (t.power === 'generator') points.windTurbine = proj(e.lat, e.lon);
      continue;
    }
    if (e.type === 'relation' && e.bounds) {
      const b = e.bounds;
      const rect: Pt[] = [proj(b.maxlat, b.minlon), proj(b.maxlat, b.maxlon), proj(b.minlat, b.maxlon), proj(b.minlat, b.minlon)];
      if (t.name === 'Parkhaus der Allianz-Arena') named.garage = rect;
      else if (t.name === 'P&R Fröttmaning') named.parkRide = rect;
      continue;
    }
    const raw = (e.geometry ?? []).map((g) => proj(g.lat, g.lon));
    if (raw.length < 2 || !inView(raw)) continue;
    const pts = rdp(raw, 0.4);
    if (t.leisure === 'stadium') named.stadium = rdp(raw, 0.25);
    else if (t.amenity === 'parking') {
      if (t.name?.startsWith('Mitte')) named.busMitte = pts;
      else if (t.name?.startsWith('Süd')) named.busSued = pts;
      else if (t.name?.includes('Gästeparkhaus')) named.guestGarage = pts;
      else out.parking.push(pts);
    } else if (t.railway === 'subway') out.subway.push(pts);
    else if (t.railway === 'platform') out.platform.push(pts);
    else if (t['area:highway']) out.motorwayArea.push(pts);
    else if (t.highway === 'motorway' || t.highway === 'motorway_link') out.motorway.push(pts);
    else if (['trunk', 'primary', 'secondary', 'tertiary', 'unclassified'].includes(t.highway)) out.road.push(pts);
    else if (t.highway === 'service') out.service.push(pts);
    else if (['footway', 'pedestrian', 'path', 'steps'].includes(t.highway)) {
      // Footways on layer 2 run on the Esplanade (on top of the parking garage).
      (t.layer === '2' ? out.esplanade : out.footway).push(pts);
    } else if (t.building) out.building.push(pts);
    else if (t.landuse === 'forest' || t.natural === 'wood' || t.natural === 'scrub') out.wood.push(pts);
    else out.meadow.push(pts);
  }

  const file = new URL('../src/components/map/site-geometry.json', import.meta.url);
  writeFileSync(file, JSON.stringify({ bounds: BOUNDS, attribution: '© OpenStreetMap contributors', layers: out, named, points }));
  console.log('Wrote', file.pathname, Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])), Object.keys(named), points);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
