import { BRAKE_TAP_VELOCITY_FRACTION, MIN_GAP_METRES } from "./types";
import type { Car, HistorySample, SimParams } from "./types";

// Fixed ring-buffer capacity for each car's own perceived-history record —
// generous relative to the reaction-time slider's max, so the delay a driver
// reacts to is always genuinely `reactionTimeSeconds` old, never buffer-limited.
export const HISTORY_CAPACITY = 256;

export function createHistoryBuffer(initialSample: HistorySample): HistorySample[] {
  return Array.from({ length: HISTORY_CAPACITY }, () => ({ ...initialSample }));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// A driver's desired speed given the (possibly stale, delayed) gap to the car
// ahead. Zero at or under the safe following distance, then a saturating
// climb toward vMax as the gap opens up — deliberately simplified (not fit to
// measured traffic data), but monotonic and boundary-correct, which is what
// the following-distance slider needs to visibly change behaviour.
export function optimalVelocity(
  gap: number,
  safeDistance: number,
  vMax: number,
  sensitivity: number,
): number {
  const excess = Math.max(0, gap - safeDistance);
  return vMax * Math.tanh(sensitivity * excess);
}

// Bumper-to-bumper gap to the car ahead, wrapping across the loop boundary.
export function computeGap(
  car: Car,
  carAhead: Car,
  trackLength: number,
  carLength: number,
): number {
  const raw = (((carAhead.position - car.position) % trackLength) + trackLength) % trackLength;
  return raw - carLength;
}

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

// The stale sample a driver actually reacts to: this tick's real gap/velocity
// were just written at `latestIndex`; `ticksBack` steps back from there is the
// genuine phase delay behind "reaction time" — the mechanism that lets a
// disturbance amplify rather than merely arrive late. Exported so the linear
// convoy model (`convoy.ts`) can reuse the exact same delayed-reaction
// mechanism instead of reimplementing it.
export function readDelayedSample(
  history: readonly HistorySample[],
  latestIndex: number,
  ticksBack: number,
): HistorySample {
  const capacity = history.length;
  const clampedTicksBack = clamp(ticksBack, 0, capacity - 1);
  return history[mod(latestIndex - clampedTicksBack, capacity)];
}

// Advances every car by one fixed timestep. Reads only from the previous
// tick's snapshot (`cars`) and returns a new array of new car objects — never
// mutates its input, so the order cars happen to be processed in can't bias
// who "sees" whose already-updated state.
export function stepSimulation(cars: readonly Car[], params: SimParams): Car[] {
  const n = cars.length;
  const reactionTicks = Math.round(params.reactionTimeSeconds / params.dt);

  return cars.map((car, i) => {
    const carAhead = cars[(i + 1) % n];
    const gapNow = computeGap(car, carAhead, params.trackLength, params.carLength);

    const capacity = car.history.length;
    const newHistory = car.history.slice();
    newHistory[car.historyIndex] = { gap: gapNow, velocity: car.velocity };
    const newHistoryIndex = mod(car.historyIndex + 1, capacity);

    const delayed = readDelayedSample(newHistory, car.historyIndex, reactionTicks);
    const desiredV = optimalVelocity(
      delayed.gap,
      params.safeFollowingDistance,
      params.vMax,
      params.sensitivity,
    );
    const accel = clamp(
      params.alpha * (desiredV - delayed.velocity),
      -params.maxDecel,
      params.maxAccel,
    );

    let newVelocity = clamp(car.velocity + accel * params.dt, 0, params.vMax);
    let brakeTicksRemaining = car.brakeTicksRemaining;
    if (brakeTicksRemaining > 0) {
      newVelocity = Math.min(newVelocity, params.vMax * BRAKE_TAP_VELOCITY_FRACTION);
      brakeTicksRemaining -= 1;
    }

    // Hard physical floor: whatever the (delayed) reactive model wants, a car
    // can never advance further than the *actual* current gap allows minus a
    // minimum buffer — a real driver's emergency stop, not subject to
    // perception lag. This is what turns "drives through the car ahead" into
    // "queues up nose-to-tail" during a jam.
    const maxAdvance = Math.max(0, gapNow - MIN_GAP_METRES);
    const maxSpeedFromGap = maxAdvance / params.dt;
    newVelocity = Math.min(newVelocity, maxSpeedFromGap);

    const newPosition = mod(car.position + newVelocity * params.dt, params.trackLength);

    return {
      id: car.id,
      position: newPosition,
      velocity: newVelocity,
      history: newHistory,
      historyIndex: newHistoryIndex,
      brakeTicksRemaining,
    };
  });
}

// Forces the designated car to a low speed ceiling for a short duration —
// the "brake tap" disturbance the whole thesis rides on. Pure over the car
// array, just like stepSimulation.
export function applyBrakeTap(cars: readonly Car[], targetCarId: number, ticks: number): Car[] {
  return cars.map((car) =>
    car.id === targetCarId ? { ...car, brakeTicksRemaining: ticks } : car,
  );
}
