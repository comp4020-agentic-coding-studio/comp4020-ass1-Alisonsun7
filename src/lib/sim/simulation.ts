import { applyBrakeTap, createHistoryBuffer, stepSimulation } from "./model";
import { classifyState, computeAverageSpeed, computeWaveStrength } from "./metrics";
import {
  JAM_SPEED_FRACTION,
  JAM_WAVE_THRESHOLD,
  STABLE_WAVE_THRESHOLD,
  STATE_WINDOW_SECONDS,
} from "./types";
import type { Car, ClassifyStateParams, RollingSample, SimParams, SimState } from "./types";

// How many past avgSpeed samples the sparkline keeps — about 10s at the
// default 30Hz tick, long enough to show a wave arriving and dissipating.
const SPEED_HISTORY_CAPACITY = 300;

// Cars start evenly spaced around the loop, all already at a comfortable
// cruising speed — the simulation starts near equilibrium rather than from a
// cold, arbitrary state.
export function createInitialCars(params: SimParams): Car[] {
  const spacing = params.trackLength / params.carCount;
  const initialVelocity = params.vMax * 0.8;
  const initialGap = spacing - params.carLength;

  return Array.from({ length: params.carCount }, (_, i) => ({
    id: i,
    position: i * spacing,
    velocity: initialVelocity,
    history: createHistoryBuffer({ gap: initialGap, velocity: initialVelocity }),
    historyIndex: 0,
    brakeTicksRemaining: 0,
  }));
}

export interface SimSnapshot {
  cars: readonly Car[];
  params: SimParams;
  state: SimState;
  avgSpeed: number;
  waveStrength: number;
  speedHistory: readonly number[];
}

// Owns the whole running simulation: current cars, params, and enough
// rolling history to classify the discrete state. Holds no canvas/DOM
// reference, so the full multi-tick amplify/decay behaviour is unit-testable.
export class Simulation {
  private cars: Car[];
  private params: SimParams;
  private rollingHistory: RollingSample[] = [];
  private speedHistory: number[] = [];

  constructor(params: SimParams) {
    this.params = params;
    this.cars = createInitialCars(params);
  }

  step(): void {
    this.cars = stepSimulation(this.cars, this.params);

    const avgSpeed = computeAverageSpeed(this.cars);
    const waveStrength = computeWaveStrength(this.cars, this.params.vMax);

    this.rollingHistory.push({ avgSpeed, waveStrength });
    const windowTicks = Math.round(STATE_WINDOW_SECONDS / this.params.dt);
    if (this.rollingHistory.length > windowTicks) this.rollingHistory.shift();

    this.speedHistory.push(avgSpeed);
    if (this.speedHistory.length > SPEED_HISTORY_CAPACITY) this.speedHistory.shift();
  }

  // A change to carCount needs a fresh, evenly-spaced ring; every other
  // param (reaction time, following distance, ...) applies to the existing
  // cars in place so a mid-run slider drag doesn't reset positions.
  setParams(nextParams: SimParams): void {
    if (nextParams.carCount !== this.params.carCount) {
      this.params = nextParams;
      this.cars = createInitialCars(nextParams);
      this.rollingHistory = [];
      this.speedHistory = [];
      return;
    }
    this.params = nextParams;
  }

  brakeTap(carId: number, ticks: number): void {
    this.cars = applyBrakeTap(this.cars, carId, ticks);
  }

  getSnapshot(): SimSnapshot {
    const classifyParams: ClassifyStateParams = {
      stableWaveThreshold: STABLE_WAVE_THRESHOLD,
      jamWaveThreshold: JAM_WAVE_THRESHOLD,
      jamSpeedThreshold: this.params.vMax * JAM_SPEED_FRACTION,
    };

    return {
      cars: this.cars,
      params: this.params,
      state: classifyState(this.rollingHistory, classifyParams),
      avgSpeed: computeAverageSpeed(this.cars),
      waveStrength: computeWaveStrength(this.cars, this.params.vMax),
      speedHistory: this.speedHistory,
    };
  }
}
