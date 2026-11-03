/**
 * Top-down site map drawn from OpenStreetMap geometry (see scripts/build-map.ts),
 * plus the crowd dots. Geometry lives in a north-up 1000 × 750 "site" space
 * (≈0.48 px per metre); the view rotates it so the Fröttmaning → Arena axis runs
 * left to right and zooms onto the 1000 × 620 canvas.
 * Map data © OpenStreetMap contributors (ODbL). Walking routes are traced along the
 * mapped footways; gates and lane separation are simplified.
 */
import type { SimConfig } from '../../sim/config';
import { DT, NEVER, R_CAR, R_OTHER, R_SH, R_U6N, R_U6S, type ScenarioResult } from '../../sim/simulate';
import site from './site-geometry.json';

export const W = 1000;
export const H = 620;
type P = [number, number];

/** View: rotate the site so Fröttmaning → Allianz Arena points right, then zoom. */
const VIEW = { rot: Math.atan2(369, 284), cx: 480, cy: 420, scale: 1.3, ox: -35, oy: -8 };
const PX_PER_M = 0.4817; // site-space pixels per metre (see scripts/build-map.ts)
/** Site point shifted by (dx, dy) screen pixels – for placing upright labels next to features. */
function screenAt(p: P, dx: number, dy: number): P {
  const c = Math.cos(-VIEW.rot);
  const s = Math.sin(-VIEW.rot);
  return [p[0] + (dx * c - dy * s) / VIEW.scale, p[1] + (dx * s + dy * c) / VIEW.scale];
}
function applyView(ctx: CanvasRenderingContext2D) {
  ctx.translate(W / 2 + VIEW.ox * VIEW.scale, H / 2 + VIEW.oy * VIEW.scale);
  ctx.scale(VIEW.scale, VIEW.scale);
  ctx.rotate(VIEW.rot);
  ctx.translate(-VIEW.cx, -VIEW.cy);
}

const G = site as unknown as {
  layers: Record<string, P[][]>;
  named: Record<string, P[]>;
  points: Record<string, P>;
  attribution: string;
};

export const COLORS = {
  green: '#16A34A',
  amber: '#F59E0B',
  red: '#DC052D',
  seat: '#94A3B8',
  egress: '#475569',
  car: '#64748B',
  train: '#1E3A8A',
  ink: '#0F172A',
  muted: '#64748B',
};

// ---------------------------------------------------------------- geometry

const STADIUM = G.named.stadium;
const CENTER: P = (() => {
  const xs = STADIUM.map((p) => p[0]);
  const ys = STADIUM.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
})();
const HALF: P = (() => {
  const xs = STADIUM.map((p) => p[0]);
  const ys = STADIUM.map((p) => p[1]);
  return [(Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...ys) - Math.min(...ys)) / 2];
})();
/** Pitch: 105 × 68 m, long axis north–south (≈0.48 px/m). */
const PITCH = { hw: 16.5, hh: 25.5 };

/** Distance from the centre to the stadium outline along angle a (ray cast on the OSM polygon). */
const OUTLINE_R: number[] = (() => {
  const out: number[] = [];
  for (let d = 0; d < 360; d++) {
    const a = (d * Math.PI) / 180;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = Math.max(HALF[0], HALF[1]);
    for (let i = 0; i < STADIUM.length - 1; i++) {
      const [x1, y1] = STADIUM[i];
      const [x2, y2] = STADIUM[i + 1];
      const ex = x2 - x1;
      const ey = y2 - y1;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((x1 - CENTER[0]) * ey - (y1 - CENTER[1]) * ex) / den;
      const u = ((x1 - CENTER[0]) * dy - (y1 - CENTER[1]) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
    out.push(best);
  }
  return out;
})();
const outlineR = (a: number) => OUTLINE_R[((Math.round((a * 180) / Math.PI) % 360) + 360) % 360];
const pitchR = (a: number) => Math.min(PITCH.hw / Math.max(1e-6, Math.abs(Math.cos(a))), PITCH.hh / Math.max(1e-6, Math.abs(Math.sin(a))));

/** Point on the promenade ring just outside the stadium shell. */
const ring = (a: number): P => {
  const r = outlineR(a) + 7;
  return [CENTER[0] + Math.cos(a) * r, CENTER[1] + Math.sin(a) * r];
};

const deg = (d: number) => (d * Math.PI) / 180;
/** Gate angles (canvas angles, clockwise from east). */
const GATE_ANGLE = { N: deg(-90), O: deg(0), S: deg(97), W: deg(180) } as const;
type Side = keyof typeof GATE_ANGLE;
const SIDES: Side[] = ['N', 'O', 'S', 'W'];

const PLAZA: P = [600, 338]; // Kurt-Landauer-Platz, head of the Esplanade
// Esplanade centreline (layer-2 footways on the garage roof), then the bridge and stairs into Fröttmaning.
const ESPLANADE: P[] = [PLAZA, [592, 380], [578, 430], [560, 490], [541, 546], [521, 574], [495, 596], [468, 610], [440, 604], [417, 598], [380, 586], [352, 575]];
// Separated away lane along the western edge of the Esplanade, merging at the bridge.
const AWAY_LANE: P[] = [ring(GATE_ANGLE.N), ring(deg(-120)), ring(deg(-150)), ring(deg(180)), ring(deg(150)), [553, 338], [544, 380], [528, 440], [511, 500], [498, 548], [481, 586], [462, 604], [440, 604], [417, 598], [380, 586], [352, 575]];
const SHUTTLE_WALK: P[] = [ring(deg(-55)), [690, 186], [672, 168], [650, 160]];
const BUS_OUT: P[] = [[650, 150], [662, 100], [624, 65], [581, 37], [542, 29], [493, 6], [480, -40]];
const CAR_WALK: P[] = [PLAZA, [606, 360], [612, 390]];
const CAR_OUT: P[] = [[640, 410], [649, 396], [625, 461], [601, 526], [556, 610], [540, 656], [511, 686], [470, 699], [449, 734], [430, 790]];
/** Track direction towards the city (south-south-west). */
const TRACK_DIR: P = [-0.29, 0.957];

const PLATFORMS = G.layers.platform;
const PLATFORM_BOX = (() => {
  const pts = PLATFORMS.flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
})();
const BUS_QUEUE = { x: 604, y: 138, w: 70, h: 34 };
const GARAGE = G.named.garage;

interface Poly {
  pts: P[];
  cum: number[];
  len: number;
}
function poly(pts: P[]): Poly {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
const P_MAIN = poly(ESPLANADE);
const P_AWAY = poly(AWAY_LANE);
const P_SHUTTLE = poly(SHUTTLE_WALK);
const P_BUS = poly(BUS_OUT);
const P_CARWALK = poly(CAR_WALK);
const P_CAROUT = poly(CAR_OUT);
/** Where the wide Esplanade narrows into the bridge/stairs funnel. */
const FUNNEL_AT = P_MAIN.cum[7] / P_MAIN.len;

function along(p: Poly, f: number, off: number): P {
  const d = Math.max(0, Math.min(1, f)) * p.len;
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < d) i++;
  const [x0, y0] = p.pts[i - 1];
  const [x1, y1] = p.pts[i];
  const seg = p.cum[i] - p.cum[i - 1] || 1;
  const u = (d - p.cum[i - 1]) / seg;
  const nx = -(y1 - y0) / seg;
  const ny = (x1 - x0) / seg;
  return [x0 + (x1 - x0) * u + nx * off, y0 + (y1 - y0) * u + ny * off];
}

/** Usable half-width of the main route at fraction f (wide Esplanade → narrow funnel). */
function mainHalfWidth(f: number): number {
  if (f < FUNNEL_AT - 0.06) return 26;
  if (f < FUNNEL_AT) return 26 - ((f - (FUNNEL_AT - 0.06)) / 0.06) * 18;
  return 8;
}

/**
 * Lookup: how many held-back people fit between the station end of a route and
 * fraction f along it, using the drawn route width and a packed density of 3.5 p/m².
 */
const HELD_DENSITY = 3.5;
function heldTable(p: Poly, halfWidth: (f: number) => number): { f: number; people: number }[] {
  const rows = [{ f: 1, people: 0 }];
  let people = 0;
  for (let px = 1; px <= p.len; px++) {
    const f = 1 - px / p.len;
    const widthM = (2 * halfWidth(f)) / PX_PER_M;
    people += widthM * (1 / PX_PER_M) * HELD_DENSITY;
    rows.push({ f, people });
  }
  return rows;
}
const MAIN_HELD = heldTable(P_MAIN, mainHalfWidth);
const AWAY_HELD = heldTable(P_AWAY, () => 3.5);
function heldPosition(table: { f: number; people: number }[], held: number): number {
  if (held <= 0) return 1;
  let lo = 0;
  let hi = table.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (table[mid].people < held) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0.02, table[lo].f);
}

// ------------------------------------------------------------ seats & egress

function blockSide(b: number): Side {
  return SIDES[Math.floor(b / 6) % 4];
}

/** Sector angle span: six sectors per stand, stands centred on N/E/S/W. */
function blockAngle(b: number, j: number): number {
  const side = Math.floor(b / 6) % 4;
  const i = b % 6;
  const start = deg(-135) + side * deg(90);
  return start + ((i + 0.08 + j * 0.84) / 6) * deg(90);
}

function seatPos(b: number, j1: number, j2: number): P {
  const a = blockAngle(b, j1);
  const r0 = pitchR(a) + 3;
  const r1 = outlineR(a) * 0.9;
  const r = r0 + (r1 - r0) * j2;
  return [CENTER[0] + Math.cos(a) * r, CENTER[1] + Math.sin(a) * r];
}

export function blockLabelPos(b: number): P {
  const a = blockAngle(b, 0.5);
  const r = (pitchR(a) + outlineR(a) * 0.9) / 2;
  return [CENTER[0] + Math.cos(a) * r, CENTER[1] + Math.sin(a) * r];
}

/** Arc along the promenade ring from angle a0 to a1 (shorter direction). */
function ringArc(a0: number, a1: number): P[] {
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const steps = Math.max(1, Math.ceil(Math.abs(d) / deg(15)));
  return Array.from({ length: steps + 1 }, (_, i) => ring(a0 + (d * i) / steps));
}

const ROUTE_TARGET: Record<number, { angle: number; end: P }> = {
  [R_U6N]: { angle: GATE_ANGLE.S, end: PLAZA },
  [R_U6S]: { angle: GATE_ANGLE.N, end: AWAY_LANE[0] },
  [R_SH]: { angle: deg(-55), end: SHUTTLE_WALK[0] },
  [R_CAR]: { angle: GATE_ANGLE.S, end: PLAZA },
  [R_OTHER]: { angle: deg(-55), end: SHUTTLE_WALK[0] },
};

const egressCache = new Map<string, Poly>();
/** Gate → promenade ring → start of the route. The seat→gate leg is added per dot. */
function egressPath(side: Side, route: number): Poly {
  const key = `${side}${route}`;
  let p = egressCache.get(key);
  if (!p) {
    const target = ROUTE_TARGET[route];
    p = poly([...ringArc(GATE_ANGLE[side], target.angle), target.end]);
    egressCache.set(key, p);
  }
  return p;
}

// ---------------------------------------------------------------- helpers

function densityColor(d: number, safe: number): string {
  if (d >= safe) return COLORS.red;
  if (d >= safe * 0.6) return COLORS.amber;
  return COLORS.green;
}

function sampleAt(arr: Float32Array, t: number): number {
  const m = Math.max(0, Math.min(arr.length - 1, t));
  const lo = Math.floor(m);
  const hi = Math.min(arr.length - 1, lo + 1);
  return arr[lo] + (arr[hi] - arr[lo]) * (m - lo);
}

function stepAt(arr: Float32Array, t: number): number {
  return arr[Math.max(0, Math.min(arr.length - 1, Math.floor(t / DT)))];
}

function path(ctx: CanvasRenderingContext2D, pts: P[], close = false) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = 'left',
  weight = 500,
  rotate = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  // rotate === 0 → upright on screen; otherwise aligned with a path in site space.
  ctx.rotate(rotate || -VIEW.rot);
  ctx.font = `${weight} ${size}px "Inter Variable", Inter, system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(248,250,252,0.9)';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// ------------------------------------------------------------- background

export function drawBackground(ctx: CanvasRenderingContext2D, _c: SimConfig, blockIds: string[], awayIdx: Set<number>) {
  const L = G.layers;
  const base = ctx.getTransform();
  ctx.fillStyle = '#F4F5F2';
  ctx.fillRect(0, 0, W, H);
  applyView(ctx);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const fillAll = (polys: P[][], color: string) => {
    ctx.fillStyle = color;
    for (const p of polys) {
      if (p.length < 3) continue;
      path(ctx, p, true);
      ctx.fill();
    }
  };
  const strokeAll = (polys: P[][], color: string, width: number, dash: number[] = []) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    for (const p of polys) {
      path(ctx, p);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  };

  fillAll(L.meadow, '#E6EFDC');
  fillAll(L.wood, '#D5E5C8');
  fillAll(L.parking, '#E8E9EC');
  for (const k of ['busMitte', 'busSued', 'guestGarage'] as const) if (G.named[k]) fillAll([G.named[k]], '#E3E5EA');
  fillAll([G.named.parkRide], '#E3E5EA');

  // Parking garage (four storeys under the Esplanade).
  fillAll([GARAGE], '#E6E8EE');
  ctx.save();
  path(ctx, GARAGE, true);
  ctx.clip();
  ctx.strokeStyle = '#D6DAE2';
  ctx.lineWidth = 1;
  for (let x = GARAGE[0][0] - 300; x < GARAGE[1][0]; x += 9) {
    path(ctx, [[x, GARAGE[0][1]], [x + 300, GARAGE[2][1]]]);
    ctx.stroke();
  }
  ctx.restore();

  fillAll(L.motorwayArea, '#DADFE7');
  strokeAll(L.motorway, '#C3CAD5', 7);
  strokeAll(L.motorway, '#FFFFFF', 3.5);
  strokeAll(L.road, '#CBD2DC', 5);
  strokeAll(L.road, '#FFFFFF', 3);
  strokeAll(L.service, '#E1E5EB', 1.6);
  strokeAll(L.subway, '#A8AFBC', 1);
  fillAll(L.building, '#DEE1E6');
  strokeAll(L.footway, '#D3D8DF', 0.8, [2, 2]);

  // Esplanade surface on the garage roof.
  ctx.strokeStyle = '#F8F7F4';
  ctx.lineWidth = 64;
  path(ctx, ESPLANADE.slice(0, 8));
  ctx.stroke();
  strokeAll(L.esplanade, '#E7E3DA', 1.2);
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#F8F7F4';
  path(ctx, ESPLANADE.slice(7));
  ctx.stroke();
  // Away lane fence.
  ctx.strokeStyle = '#A5B4FC';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 3]);
  path(ctx, AWAY_LANE.slice(5, 12));
  ctx.stroke();
  ctx.setLineDash([]);

  fillAll(L.platform, '#CBD5E1');

  // Stadium: outer shell, three-tier bowl with 24 sectors, pitch.
  ctx.fillStyle = '#FFFFFF';
  path(ctx, STADIUM, true);
  ctx.fill();
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  for (let b = 0; b < blockIds.length; b++) {
    const pts: P[] = [];
    for (let k = 0; k <= 8; k++) {
      const a = blockAngle(b, -0.05 + (k / 8) * 1.1);
      const r = outlineR(a) * 0.92;
      pts.push([CENTER[0] + Math.cos(a) * r, CENTER[1] + Math.sin(a) * r]);
    }
    for (let k = 8; k >= 0; k--) {
      const a = blockAngle(b, -0.05 + (k / 8) * 1.1);
      const r = pitchR(a) + 2;
      pts.push([CENTER[0] + Math.cos(a) * r, CENTER[1] + Math.sin(a) * r]);
    }
    path(ctx, pts, true);
    ctx.fillStyle = awayIdx.has(b) ? '#E0E7FF' : b % 2 ? '#EEF1F5' : '#E6EAF0';
    ctx.fill();
  }
  ctx.fillStyle = '#CFE8C8';
  ctx.fillRect(CENTER[0] - PITCH.hw, CENTER[1] - PITCH.hh, PITCH.hw * 2, PITCH.hh * 2);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(CENTER[0] - PITCH.hw + 1.5, CENTER[1] - PITCH.hh + 1.5, PITCH.hw * 2 - 3, PITCH.hh * 2 - 3);
  path(ctx, [[CENTER[0] - PITCH.hw + 1.5, CENTER[1]], [CENTER[0] + PITCH.hw - 1.5, CENTER[1]]]);
  ctx.stroke();

  // Gates.
  for (const s of SIDES) {
    const [x, y] = ring(GATE_ANGLE[s]);
    ctx.fillStyle = s === 'N' ? '#6366F1' : '#0F172A';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const gl = (s: Side, text: string, dx: number, dy: number, align: CanvasTextAlign) => {
    const [x, y] = ring(GATE_ANGLE[s]);
    label(ctx, text, x + dx, y + dy, 9.5, COLORS.ink, align, 600);
  };
  gl('N', 'Nord', 6, -6, 'left');
  gl('O', 'Ost', 7, 3, 'left');
  gl('W', 'West', -7, 3, 'right');
  gl('S', 'Süd', 8, 2, 'left');

  // Wind turbine on the Fröttmaninger Berg.
  const wt = G.points.windTurbine;
  if (wt) {
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 3; k++) {
      const a = deg(-90 + k * 120);
      path(ctx, [wt, [wt[0] + Math.cos(a) * 9, wt[1] + Math.sin(a) * 9]]);
      ctx.stroke();
    }
    label(ctx, 'Fröttmaninger Berg', wt[0] + 10, wt[1] + 18, 10.5, COLORS.muted, 'left', 600);
  }

  // Labels.
  label(ctx, 'Allianz Arena', CENTER[0] + HALF[0] + 14, CENTER[1] - HALF[1] + 4, 13, COLORS.ink, 'left', 800);
  const st: P = [(PLATFORM_BOX.x0 + PLATFORM_BOX.x1) / 2, (PLATFORM_BOX.y0 + PLATFORM_BOX.y1) / 2];
  const at = (dx: number, dy: number) => screenAt(st, dx, dy);
  label(ctx, 'Fröttmaning', ...at(-6, -58), 13, COLORS.ink, 'center', 800);
  label(ctx, 'Esplanade', 594, 470, 12, '#57534E', 'center', 700, deg(-72));
  label(ctx, 'Away lane', 492, 470, 9.5, '#6366F1', 'center', 600, deg(-72));
  label(ctx, 'Garage', ...screenAt(GARAGE[1], 18, 34), 10.5, COLORS.ink, 'left', 700);
  label(ctx, 'Shuttles', 580, 84, 11, COLORS.ink, 'right', 700);
  label(ctx, 'A9', 742, 300, 12, '#475569', 'center', 800);
  label(ctx, 'A99', 840, 150, 12, '#475569', 'center', 800);

  // Screen-space overlays: north arrow, 200 m scale bar, attribution.
  ctx.setTransform(base);
  ctx.save();
  ctx.translate(W - 34, 40);
  ctx.rotate(VIEW.rot);
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(-6, 6);
  ctx.lineTo(0, 2);
  ctx.lineTo(6, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.font = '700 11px "Inter Variable", Inter, system-ui, sans-serif';
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = 'center';
  ctx.fillText('N', W - 34 + Math.sin(VIEW.rot) * 24, 40 - Math.cos(VIEW.rot) * 24);
  const bar = 200 * PX_PER_M * VIEW.scale;
  ctx.fillRect(16, H - 22, bar, 3);
  ctx.font = '600 10px "Inter Variable", Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('200 m', 16, H - 28);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`Map data ${G.attribution}`, W - 10, H - 8);
}

// ---------------------------------------------------------------- frame

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  bg: HTMLCanvasElement,
  res: ScenarioResult,
  c: SimConfig,
  t: number,
  scale: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bg, 0, 0);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  applyView(ctx);
  const s = res.series;
  const safe = c.u6.safeDensity;
  const dN = sampleAt(s.densityNorth, t);
  const dS = sampleAt(s.densitySouth, t);
  const q = sampleAt(s.u6Queue, t);
  const shWait = sampleAt(s.shuttleExpectedWait, t);
  const platformCap = c.u6.platformCapacity;

  // Density tint on the station approach and away lane.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = densityColor(dN, safe);
  ctx.lineWidth = 18;
  path(ctx, ESPLANADE.slice(6));
  ctx.stroke();
  ctx.strokeStyle = densityColor(dS, safe);
  ctx.lineWidth = 8;
  path(ctx, AWAY_LANE.slice(5, 12));
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Garage fill: people waiting to drive out.
  const carQ = sampleAt(s.carQueue, t);
  if (carQ > 0) {
    ctx.globalAlpha = Math.min(0.16, 0.03 + (0.13 * carQ) / (c.car.vehicles * c.car.peoplePerCar * 0.6));
    ctx.fillStyle = '#475569';
    path(ctx, GARAGE, true);
    ctx.fill();
    ctx.globalAlpha = 1;
    label(ctx, `${Math.round(carQ).toLocaleString('en-US')} cars queuing`, ...screenAt(GARAGE[1], 18, 47), 10, '#334155', 'left', 600);
  }

  // Train at the platform, departing south towards the city.
  const hw = c.u6.trainHeadwayMin;
  const phase = (((t % hw) + hw) % hw) / hw;
  if (t > 0.1) {
    const cx = (PLATFORM_BOX.x0 + PLATFORM_BOX.x1) / 2 + 2;
    const cy = (PLATFORM_BOX.y0 + PLATFORM_BOX.y1) / 2;
    const len = 56;
    let shift: number | null = null;
    if (phase > 0.55) shift = 0;
    else if (phase < 0.3) shift = (phase / 0.3) * 260;
    if (shift !== null) {
      const x = cx + TRACK_DIR[0] * shift;
      const y = cy + TRACK_DIR[1] * shift;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(TRACK_DIR[1], TRACK_DIR[0]));
      ctx.fillStyle = COLORS.train;
      ctx.beginPath();
      ctx.roundRect(-len / 2, -2.6, len, 5.2, 2);
      ctx.fill();
      ctx.restore();
    }
  }

  const d = res.dots;
  const buckets = new Map<string, number[]>();
  const push = (col: string, x: number, y: number) => {
    let arr = buckets.get(col);
    if (!arr) buckets.set(col, (arr = []));
    arr.push(x, y);
  };
  const qColor = q > platformCap ? COLORS.red : q > platformCap * 0.5 ? COLORS.amber : COLORS.green;

  for (let k = 0; k < d.count; k++) {
    const j1 = d.jitter[k];
    const j2 = d.jitter2[k];
    const r = d.route[k];
    const b = d.block[k];
    if (t < d.depart[k]) {
      const [x, y] = seatPos(b, j1, j2);
      push(COLORS.seat, x, y);
      continue;
    }
    if (t < d.tGate[k]) {
      // Seat → own stand's gate → promenade ring → start of the route.
      const u = (t - d.depart[k]) / Math.max(0.01, d.tGate[k] - d.depart[k]);
      const side = r === R_U6S ? 'N' : blockSide(b);
      const eg = egressPath(side, r);
      const seat = seatPos(b, j1, j2);
      const gate = eg.pts[0];
      const first = 0.35;
      let pt: P;
      if (u < first) {
        const v = u / first;
        pt = [seat[0] + (gate[0] - seat[0]) * v, seat[1] + (gate[1] - seat[1]) * v];
      } else pt = along(eg, (u - first) / (1 - first), (j2 - 0.5) * 6);
      push(COLORS.egress, pt[0], pt[1]);
      continue;
    }
    if (t < d.tQueue[k]) {
      let pt: P;
      let col: string;
      if (r === R_U6N) {
        // Small longitudinal jitter so fans released in the same 30-s step don't walk in lines.
        const prog = stepAt(res.cumNorth, t) - stepAt(res.cumNorth, d.tGate[k]) + (j1 - 0.5) * 0.05;
        pt = along(P_MAIN, prog, (j2 - 0.5) * 2 * mainHalfWidth(prog));
        col = densityColor(dN, safe);
      } else if (r === R_U6S) {
        const prog = stepAt(res.cumSouth, t) - stepAt(res.cumSouth, d.tGate[k]) + (j1 - 0.5) * 0.05;
        pt = along(P_AWAY, prog, (j2 - 0.5) * 7);
        col = densityColor(dS, safe);
      } else if (r === R_SH) {
        pt = along(P_SHUTTLE, (t - d.tGate[k]) / c.shuttle.walkMin, (j2 - 0.5) * 10);
        col = COLORS.green;
      } else if (r === R_CAR) {
        pt = along(P_CARWALK, (t - d.tGate[k]) / c.car.walkMin, (j2 - 0.5) * 14);
        col = COLORS.car;
      } else {
        // Fan coaches / taxis at the bus parks.
        pt = along(P_SHUTTLE, (t - d.tGate[k]) / 8, (j2 - 0.5) * 14);
        col = COLORS.car;
      }
      push(col, pt[0], pt[1]);
      continue;
    }
    const tb = d.tBoard[k] >= NEVER ? Infinity : d.tBoard[k];
    if (t < tb) {
      const f = Number.isFinite(tb) ? (t - d.tQueue[k]) / Math.max(0.01, tb - d.tQueue[k]) : 0;
      if (r === R_U6N || r === R_U6S) {
        const rank = (1 - f) * q;
        if (rank > platformCap) {
          // Held back: the queue fills the stairs and bridge, then backs up the Esplanade (to scale, ~3.5 p/m²).
          const held = rank - platformCap + (j1 - 0.5) * 900;
          const fPos = r === R_U6N ? heldPosition(MAIN_HELD, held) : heldPosition(AWAY_HELD, held);
          const p = r === R_U6N ? along(P_MAIN, fPos, (j2 - 0.5) * 2 * mainHalfWidth(fPos)) : along(P_AWAY, fPos, (j2 - 0.5) * 7);
          push(COLORS.red, p[0], p[1]);
        } else {
          // On the two island platforms.
          const island = j1 < 0.5 ? 0 : 1;
          const box = PLATFORMS[island] ?? PLATFORMS[0];
          const xs = box.map((p) => p[0]);
          const ys = box.map((p) => p[1]);
          const x0 = Math.min(...xs) + 2;
          const x1 = Math.max(...xs) - 2;
          const y0 = Math.min(...ys) + 2;
          const y1 = Math.max(...ys) - 2;
          const yy = y0 + (y1 - y0) * ((rank / platformCap) * 0.7 + j2 * 0.3);
          const xx = x0 + (x1 - x0) * (((j1 * 2) % 1) * 0.5 + 0.25) + (yy - y0) * -0.27;
          push(qColor, xx, yy);
        }
      } else if (r === R_SH) {
        const col = shWait > 25 ? COLORS.red : shWait > 10 ? COLORS.amber : COLORS.green;
        const qn = sampleAt(s.shuttleQueue, t);
        const rank = (1 - f) * qn;
        if (rank < 1200) {
          push(col, BUS_QUEUE.x + j1 * BUS_QUEUE.w, BUS_QUEUE.y + Math.min(1, rank / 1200) * BUS_QUEUE.h * 0.7 + j2 * BUS_QUEUE.h * 0.3);
        } else {
          // Long shuttle queues snake back along the promenade.
          const back = Math.min(1, (rank - 1200) / 14000);
          const p = along(P_SHUTTLE, 1 - back, (j2 - 0.5) * 12);
          const p2 = back > 0.95 ? ring(deg(-55 + (back - 0.95) * 600 * (j1 - 0.3))) : p;
          push(col, p2[0], p2[1]);
        }
      }
      // Car users waiting in the garage are shown as the garage fill level (they are underground).
      continue;
    }
    // Leaving the site after boarding.
    const since = t - tb;
    if (r === R_U6N || r === R_U6S) {
      if (since < 1.2) {
        const cx = (PLATFORM_BOX.x0 + PLATFORM_BOX.x1) / 2 + 2;
        const cy = (PLATFORM_BOX.y0 + PLATFORM_BOX.y1) / 2;
        const shift = (since / 1.2) * 260 + (j1 - 0.5) * 50;
        push(COLORS.train, cx + TRACK_DIR[0] * shift, cy + TRACK_DIR[1] * shift);
      }
    } else if (r === R_SH || r === R_OTHER) {
      if (since < 4) {
        const p = along(P_BUS, since / 4, (j2 - 0.5) * 3);
        push('#334155', p[0], p[1]);
      }
    } else if (since < 8) {
      const p = along(P_CAROUT, since / 8, (j2 - 0.5) * 4);
      push(COLORS.car, p[0], p[1]);
    }
  }

  const size = 1.7;
  for (const [col, pts] of buckets) {
    ctx.fillStyle = col;
    for (let i = 0; i < pts.length; i += 2) ctx.fillRect(pts[i] - size / 2, pts[i + 1] - size / 2, size, size);
  }
}
