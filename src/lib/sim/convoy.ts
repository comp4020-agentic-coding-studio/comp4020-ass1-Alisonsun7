import { applyBrakeTap, clamp, createHistoryBuffer, mod, optimalVelocity, readDelayedSample } from "./model";
import { MIN_GAP_METRES } from "./types";
import type { Car, SimParams } from "./types";

// A single straight line of cars, front to back — no wraparound. Car 0 is
// the leader (nothing ahead of it); every other car follows the one directly
// in front (index i-1). This is the "Single Braking Experiment" and
// "Scenarios" topology: a short, bounded, exactly-repeatable line, as
// opposed to the circular ring's long-run, self-sustaining dynamics.

// Placeholder recorded "gap" for the leader's own history buffer — the
// leader never reads it (it always free-runs toward vMax), so the value
// itself is inert, just large enough to never look like a following car.
const LEADER_VIRTUAL_GAP = 1e6;

// The ring model's brake tap (BRAKE_TAP_VELOCITY_FRACTION, 0.2) is a hard
// emergency stop — deliberately drastic so the ring's long-run thesis wave is
// unmistakable. A convoy demo built around "a small, brief braking action"
// needs a gentler tap: strong enough to touch off a genuine backward-growing
// wave, but not so strong every follower behind it slams to a dead stop in
// one hop, which would flatten the "light → later car brakes harder" story
// into "everyone just stops".
export const CONVOY_BRAKE_TAP_VELOCITY_FRACTION = 0.4;

// A brief tap, not a hold: long enough to visibly touch off the chain,
// short enough to read as "one small braking action" rather than the leader
// simply driving slowly. Paired with CONVOY_BRAKE_TAP_VELOCITY_FRACTION and
// a reactionTimeSeconds/safeFollowingDistance of 0.8/20 during tuning — see
// convoy.test.ts's causal-chain test for the empirical basis.
export const CONVOY_TAP_DURATION_SECONDS = 0.2;

// How far behind cruising speed a car must fall before it counts as having
// noticed the disturbance at all — filters out floating-point noise.
const NOTICE_VELOCITY_DROP_METRES_PER_SECOND = 0.3;

// The gap must let optimalVelocity's saturating tanh curve actually settle
// at (near enough) vMax — a gap only modestly past safeFollowingDistance
// (e.g. 1.5x) leaves cars cruising below vMax, which reads as spurious
// braking (the initial-condition mismatch correcting itself) indistinguishable
// from the real, tap-induced disturbance the whole demo is about.
function equilibriumCruisingGap(params: SimParams): number {
  const excess = Math.atanh(0.999) / params.sensitivity;
  return params.safeFollowingDistance + excess;
}

export function createConvoyCars(count: number, params: SimParams): Car[] {
  const gap = equilibriumCruisingGap(params);
  const spacing = gap + params.carLength;
  const initialVelocity = params.vMax;

  return Array.from({ length: count }, (_, i) => ({
    id: i,
    position: -i * spacing, // car 0 (leader) at position 0; followers trail behind
    velocity: initialVelocity,
    history: createHistoryBuffer({ gap: i === 0 ? LEADER_VIRTUAL_GAP : gap, velocity: initialVelocity }),
    historyIndex: 0,
    brakeTicksRemaining: 0,
  }));
}

// Bumper-to-bumper gap to the car ahead — no modulo, since a convoy is a
// line, not a loop.
export function computeLinearGap(car: Car, carAhead: Car, carLength: number): number {
  return carAhead.position - car.position - carLength;
}

// Advances every car in the convoy by one fixed timestep. Same accel/clamp
// and physical non-overlap floor as stepSimulation, applied to a line: the
// leader free-runs toward vMax (subject to its own brake tap), and every
// other car reacts — after the same reaction-time delay — to the car
// directly ahead, exactly as in the ring model.
export function stepConvoy(cars: readonly Car[], params: SimParams): Car[] {
  const reactionTicks = Math.round(params.reactionTimeSeconds / params.dt);

  return cars.map((car, i) => {
    const isLeader = i === 0;
    const gapNow = isLeader ? LEADER_VIRTUAL_GAP : computeLinearGap(car, cars[i - 1], params.carLength);

    const capacity = car.history.length;
    const newHistory = car.history.slice();
    newHistory[car.historyIndex] = { gap: gapNow, velocity: car.velocity };
    const newHistoryIndex = mod(car.historyIndex + 1, capacity);

    let newVelocity: number;
    if (isLeader) {
      const accel = clamp(params.alpha * (params.vMax - car.velocity), -params.maxDecel, params.maxAccel);
      newVelocity = clamp(car.velocity + accel * params.dt, 0, params.vMax);
    } else {
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
      newVelocity = clamp(car.velocity + accel * params.dt, 0, params.vMax);
    }

    let brakeTicksRemaining = car.brakeTicksRemaining;
    if (brakeTicksRemaining > 0) {
      newVelocity = Math.min(newVelocity, params.vMax * CONVOY_BRAKE_TAP_VELOCITY_FRACTION);
      brakeTicksRemaining -= 1;
    }

    if (!isLeader) {
      const maxAdvance = Math.max(0, gapNow - MIN_GAP_METRES);
      const maxSpeedFromGap = maxAdvance / params.dt;
      newVelocity = Math.min(newVelocity, maxSpeedFromGap);
    }

    const newPosition = car.position + newVelocity * params.dt;

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

export type ConvoyLabelText = "noticed late" | "braking harder" | "recovering";

export interface ConvoyLabel {
  carId: number;
  text: ConvoyLabelText;
  ticksRemaining: number;
}

const LABEL_DISPLAY_TICKS = 45; // 1.5s at the default 30Hz tick

interface CarTrackerState {
  hasNoticed: boolean;
  peakDeceleration: number; // m/s^2, magnitude, since the last brake tap
  wasSlow: boolean; // true once velocity has dipped meaningfully below vMax
}

// Owns one convoy's running state and derives the transient per-car labels
// ("noticed late", "braking harder", "recovering") that make the causal
// chain legible. Holds no canvas/DOM reference, so the whole thing —
// including label timing — is unit-testable.
export class ConvoyExperiment {
  private count: number;
  private params: SimParams;
  private cars: Car[];
  private trackers: CarTrackerState[];
  private activeLabels: Map<number, ConvoyLabel> = new Map();
  private firedLabels: { carId: number; text: ConvoyLabelText }[] = [];

  constructor(count: number, params: SimParams) {
    this.count = count;
    this.params = params;
    this.cars = createConvoyCars(count, params);
    this.trackers = this.makeTrackers();
  }

  private makeTrackers(): CarTrackerState[] {
    return Array.from({ length: this.count }, () => ({
      hasNoticed: false,
      peakDeceleration: 0,
      wasSlow: false,
    }));
  }

  // Resets to a fresh, evenly-spaced cruising line — every "tap the brakes"
  // starts from here, so the demo is exactly repeatable.
  reset(): void {
    this.cars = createConvoyCars(this.count, this.params);
    this.trackers = this.makeTrackers();
    this.activeLabels.clear();
    this.firedLabels = [];
  }

  setParams(params: SimParams): void {
    this.params = params;
    this.reset();
  }

  brakeTap(ticks: number): void {
    this.reset();
    this.cars = applyBrakeTap(this.cars, 0, ticks);
  }

  step(): void {
    const prevVelocities = this.cars.map((car) => car.velocity);
    this.cars = stepConvoy(this.cars, this.params);

    for (const [carId, label] of this.activeLabels) {
      label.ticksRemaining -= 1;
      if (label.ticksRemaining <= 0) this.activeLabels.delete(carId);
    }

    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const prevVelocity = prevVelocities[i];
      const decel = Math.max(0, (prevVelocity - car.velocity) / this.params.dt);
      const tracker = this.trackers[i];

      if (!tracker.hasNoticed && prevVelocity - car.velocity > NOTICE_VELOCITY_DROP_METRES_PER_SECOND) {
        tracker.hasNoticed = true;
        if (i > 0 && this.trackers[i - 1].hasNoticed) {
          this.setLabel(car.id, "noticed late");
        }
      }

      if (i > 0 && decel > tracker.peakDeceleration && decel > this.trackers[i - 1].peakDeceleration) {
        this.setLabel(car.id, "braking harder");
      }
      tracker.peakDeceleration = Math.max(tracker.peakDeceleration, decel);

      if (car.velocity < this.params.vMax * 0.9) tracker.wasSlow = true;
      if (tracker.wasSlow && car.velocity - prevVelocity > 0.05 && car.velocity < this.params.vMax * 0.98) {
        this.setLabel(car.id, "recovering");
        tracker.wasSlow = false;
      }
    }
  }

  private setLabel(carId: number, text: ConvoyLabelText): void {
    this.activeLabels.set(carId, { carId, text, ticksRemaining: LABEL_DISPLAY_TICKS });
    this.firedLabels.push({ carId, text });
  }

  getFiredLabels(): readonly { carId: number; text: ConvoyLabelText }[] {
    return this.firedLabels;
  }

  getSnapshot(): { cars: readonly Car[]; params: SimParams; labels: ConvoyLabel[] } {
    return {
      cars: this.cars,
      params: this.params,
      labels: [...this.activeLabels.values()],
    };
  }
}
