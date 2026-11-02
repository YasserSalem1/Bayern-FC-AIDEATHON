/**
 * Single source of truth for every simulation parameter.
 * Every default below is an ASSUMPTION for demonstration purposes and can be
 * edited in the Settings panel.
 */

export type SegmentId = 'families' | 'international' | 'seasonTicket' | 'fanClub' | 'away';
export type IncentiveId = 'store_points' | 'partner_cafe_points' | 'ticket_lottery_entry' | 'none';
export type RouteId = 'u6North' | 'u6South' | 'shuttle' | 'car' | 'other';
export type MatchResult = 'win' | 'draw' | 'loss';
export type Weather = 'dry' | 'rain' | 'cold';
export type ScenarioId = 'none' | 'naive' | 'ai';

export const SEGMENTS: SegmentId[] = ['families', 'international', 'seasonTicket', 'fanClub', 'away'];
export const INCENTIVES: IncentiveId[] = ['store_points', 'partner_cafe_points', 'ticket_lottery_entry', 'none'];
export const SCENARIOS: ScenarioId[] = ['none', 'naive', 'ai'];

export const SEGMENT_LABEL: Record<SegmentId, string> = {
  families: 'Families',
  international: 'International visitors',
  seasonTicket: 'Season-ticket holders',
  fanClub: 'Fan-club members',
  away: 'Away fans',
};

export const INCENTIVE_LABEL: Record<IncentiveId, string> = {
  store_points: 'Store points',
  partner_cafe_points: 'Partner café points',
  ticket_lottery_entry: 'Ticket-lottery entry',
  none: 'No incentive',
};

export const ROUTE_LABEL: Record<RouteId, string> = {
  u6North: 'Esplanade → Fröttmaning (U6)',
  u6South: 'Esplanade Süd → U6 (away, fixed)',
  shuttle: 'Shuttle bus (Busparkplatz Mitte)',
  car: 'Parking garage under the Esplanade',
  other: 'Fan coaches, taxis, bikes & walking',
};

export const SCENARIO_LABEL: Record<ScenarioId, string> = {
  none: 'No coordination',
  naive: 'Naive app',
  ai: 'AI load balancer',
};

export interface SegmentParams {
  /** Probability of following the advice, per incentive offered. */
  acceptance: Record<IncentiveId, number>;
  /** Share of this segment that travels by car (fixed, never re-routed). */
  carShare: number;
  /** Share leaving by fan-club coach, taxi, bike or on foot (no U6/shuttle/car-park load). */
  otherShare: number;
  /** Share of public-transport users who take the shuttle without any app. */
  naturalShuttleShare: number;
  /** Relative cost of one minute of waiting (higher = served earlier by the optimizer). */
  waitAversion: number;
}

export interface BlockDef {
  id: string;
  /** Fraction of the 24-block capacity; normalized so all blocks sum to totalFans. */
  weight: number;
  /** Segment mix (fractions summing to 1). */
  mix: Partial<Record<SegmentId, number>>;
  isAway?: boolean;
}

export interface SimConfig {
  seed: number;
  totalFans: number;
  horizonMin: number;
  /** Fraction of fans who have the club app installed and see advice. */
  appAdoption: number;
  match: {
    result: MatchResult;
    kickoff: string; // "HH:MM"
    weather: Weather;
    /** Minutes from kick-off to final whistle (incl. half-time and stoppage). */
    whistleOffsetMin: number;
  };
  leaving: {
    /** Median minutes after the final whistle that a fan stands up and leaves (before context shifts). */
    baseMedianMin: number;
    /** Log-normal spread of leaving times. */
    sigma: number;
    winLingerFactor: number;
    lossHurryFactor: number;
    rainHurryFactor: number;
    coldHurryFactor: number;
    lateKickoffHurryFactor: number;
  };
  u6: {
    walkMin: number; // free-flow walk time via Esplanade
    esplanadeAreaM2: number; // usable walking area of the Esplanade (slows walkers when crowded)
    walkwayAreaM2: number; // effective area of the station approach (bridge & stairs) where queues build
    awayWalkwayAreaM2: number; // separated away lane (Esplanade Süd)
    safeDensity: number; // persons per m²
    jamDensity: number; // persons per m² where walking stops
    trainHeadwayMin: number;
    trainCapacity: number;
    platformCapacity: number; // people the station can hold before access is metered
    crowdedBoardingLoss: number; // capacity lost per train when the station is overcrowded
    rideMin: number; // base ride + onward time
  };
  shuttle: {
    buses: number;
    seatsPerBus: number;
    roundTripMin: number;
    walkMin: number;
    rideMin: number;
  };
  car: {
    vehicles: number; // car-park capacity
    clearMin: number; // minutes to clear a full car park
    peoplePerCar: number;
    walkMin: number;
    driveMin: number;
  };
  naive: {
    /** Minutes between recommendation updates of the naive app. */
    updateEveryMin: number;
    /** Share of app users who follow the naive "fastest route" tip. */
    followRate: number;
  };
  optimizer: {
    slotMin: number;
    maxWaveMin: number;
    /** Planned queue the optimizer will not exceed at the U6 station. */
    u6QueueTarget: number;
    shuttleQueueTarget: number;
    /** Safety margin on throughput (0.05 = plan with 95% of nominal capacity). */
    capacityMargin: number;
  };
  rewards: {
    pointsPerMinuteWaited: number;
    storePointsBudget: number;
    cafeSeats: number;
    cafePointsPerFan: number;
    lotteryEntriesMax: number;
    lotteryMinDelayMin: number;
    minDelayForIncentiveMin: number;
  };
  segments: Record<SegmentId, SegmentParams>;
  blocks: BlockDef[];
}

const acc = (store: number, cafe: number, lottery: number, none: number): Record<IncentiveId, number> => ({
  store_points: store,
  partner_cafe_points: cafe,
  ticket_lottery_entry: lottery,
  none,
});

/**
 * 24 simulated sectors, six per stand, in clockwise order from the north:
 * N = Nordkurve, O = Osttribüne, S = Südkurve, W = Westtribüne.
 * The away section sits in the Nordkurve (away entrance on the north side).
 * Sector names are simplified; they are not the stadium's official block numbers.
 */
function defaultBlocks(): BlockDef[] {
  const blocks: BlockDef[] = [];
  const mixes: Record<string, Partial<Record<SegmentId, number>>> = {
    N: { seasonTicket: 0.5, international: 0.25, families: 0.15, fanClub: 0.1 },
    O: { families: 0.45, seasonTicket: 0.3, international: 0.15, fanClub: 0.1 },
    S: { fanClub: 0.55, seasonTicket: 0.35, international: 0.05, families: 0.05 },
    W: { seasonTicket: 0.4, international: 0.35, families: 0.15, fanClub: 0.1 },
  };
  for (const side of ['N', 'O', 'S', 'W']) {
    for (let i = 1; i <= 6; i++) {
      const id = `${side}${i}`;
      const isAway = id === 'N3' || id === 'N4';
      // Slight variation so blocks are not identical.
      const weight = 1 + (((i * 7 + side.charCodeAt(0)) % 5) - 2) * 0.06;
      blocks.push({
        id,
        weight: isAway ? 1.05 : weight,
        mix: isAway ? { away: 1 } : jitterMix(mixes[side], i),
        isAway,
      });
    }
  }
  return blocks;
}

function jitterMix(mix: Partial<Record<SegmentId, number>>, i: number): Partial<Record<SegmentId, number>> {
  const keys = Object.keys(mix) as SegmentId[];
  const out: Partial<Record<SegmentId, number>> = {};
  let sum = 0;
  keys.forEach((k, j) => {
    const v = Math.max(0.02, (mix[k] ?? 0) * (1 + (((i + j * 3) % 5) - 2) * 0.12));
    out[k] = v;
    sum += v;
  });
  keys.forEach((k) => (out[k] = Math.round(((out[k] ?? 0) / sum) * 100) / 100));
  return out;
}

export const DEFAULT_CONFIG: SimConfig = {
  seed: 1900,
  totalFans: 75024,
  horizonMin: 240,
  appAdoption: 0.8,
  match: { result: 'win', kickoff: '20:30', weather: 'dry', whistleOffsetMin: 112 },
  leaving: {
    baseMedianMin: 9,
    sigma: 0.75,
    winLingerFactor: 1.35,
    lossHurryFactor: 0.7,
    rainHurryFactor: 0.75,
    coldHurryFactor: 0.88,
    lateKickoffHurryFactor: 0.9,
  },
  u6: {
    walkMin: 15,
    esplanadeAreaM2: 60000,
    walkwayAreaM2: 12000,
    awayWalkwayAreaM2: 4000,
    safeDensity: 1.5,
    jamDensity: 5,
    trainHeadwayMin: 2.5,
    trainCapacity: 940,
    platformCapacity: 3000,
    crowdedBoardingLoss: 0.12,
    rideMin: 22,
  },
  shuttle: { buses: 20, seatsPerBus: 90, roundTripMin: 20, walkMin: 6, rideMin: 30 },
  car: { vehicles: 11000, clearMin: 150, peoplePerCar: 2.5, walkMin: 9, driveMin: 30 },
  naive: { updateEveryMin: 10, followRate: 0.7 },
  optimizer: {
    slotMin: 5,
    maxWaveMin: 110,
    u6QueueTarget: 1500,
    shuttleQueueTarget: 300,
    capacityMargin: 0.05,
  },
  rewards: {
    pointsPerMinuteWaited: 10,
    storePointsBudget: 2_500_000,
    cafeSeats: 6000,
    cafePointsPerFan: 300,
    lotteryEntriesMax: 12000,
    lotteryMinDelayMin: 30,
    minDelayForIncentiveMin: 10,
  },
  segments: {
    families: { acceptance: acc(0.55, 0.7, 0.35, 0.15), carShare: 0.45, otherShare: 0.04, naturalShuttleShare: 0.05, waitAversion: 2.0 },
    international: { acceptance: acc(0.65, 0.55, 0.25, 0.25), carShare: 0.1, otherShare: 0.12, naturalShuttleShare: 0.03, waitAversion: 1.4 },
    seasonTicket: { acceptance: acc(0.45, 0.5, 0.75, 0.2), carShare: 0.38, otherShare: 0.06, naturalShuttleShare: 0.03, waitAversion: 1.0 },
    fanClub: { acceptance: acc(0.5, 0.6, 0.8, 0.25), carShare: 0.22, otherShare: 0.3, naturalShuttleShare: 0.02, waitAversion: 0.8 },
    away: { acceptance: acc(1, 1, 1, 1), carShare: 0, otherShare: 0, naturalShuttleShare: 0, waitAversion: 1.0 },
  },
  blocks: defaultBlocks(),
};

export function cloneConfig(c: SimConfig): SimConfig {
  return JSON.parse(JSON.stringify(c)) as SimConfig;
}

/** Final whistle as minutes since midnight. */
export function whistleClockMin(c: SimConfig): number {
  const [h, m] = c.match.kickoff.split(':').map(Number);
  return h * 60 + m + c.match.whistleOffsetMin;
}

export function formatClock(minutesSinceMidnight: number): string {
  const total = Math.round(minutesSinceMidnight) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Effective U6 throughput in people per minute (nominal). */
export function u6Throughput(c: SimConfig): number {
  return c.u6.trainCapacity / c.u6.trainHeadwayMin;
}

export function shuttleThroughput(c: SimConfig): number {
  return (c.shuttle.buses * c.shuttle.seatsPerBus) / c.shuttle.roundTripMin;
}
