import type { Car, ClassifyStateParams, RollingSample, SimState } from "./types";

export type CarColor = "green" | "yellow" | "red";

// Speed-based car colour: green for smooth movement, yellow for slowing
// down, red for a severe slowdown. Boundaries are fractions of vMax so they
// scale with whatever free-flow speed the simulation is configured with.
export function classifyCarColor(velocity: number, vMax: number): CarColor {
  if (velocity >= vMax * 0.75) return "green";
  if (velocity >= vMax * 0.35) return "yellow";
  return "red";
}

export function computeAverageSpeed(cars: readonly Car[]): number {
  if (cars.length === 0) return 0;
  return cars.reduce((sum, car) => sum + car.velocity, 0) / cars.length;
}

// Cars per metre of track — the raw density the UI converts to cars/km.
export function computeDensity(cars: readonly Car[], trackLength: number): number {
  if (trackLength <= 0) return 0;
  return cars.length / trackLength;
}

// The visual signature of a shockwave: a slow region next to a fast one.
// Cheap (O(n)), normalised to [0, 1] by vMax.
export function computeWaveStrength(cars: readonly Car[], vMax: number): number {
  if (cars.length === 0 || vMax <= 0) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const car of cars) {
    if (car.velocity < min) min = car.velocity;
    if (car.velocity > max) max = car.velocity;
  }
  return (max - min) / vMax;
}

// Looks at a short rolling window, not a single tick, so one momentary blip
// from the brake tap doesn't instantly flag a phantom jam.
export function classifyState(
  history: readonly RollingSample[],
  params: ClassifyStateParams,
): SimState {
  if (history.length === 0) return "stable";

  const recentWave = history.reduce((sum, s) => sum + s.waveStrength, 0) / history.length;
  const recentSpeed = history.reduce((sum, s) => sum + s.avgSpeed, 0) / history.length;

  if (recentWave >= params.jamWaveThreshold && recentSpeed <= params.jamSpeedThreshold) {
    return "phantom-jam";
  }
  if (recentWave >= params.stableWaveThreshold) {
    return "unstable";
  }
  return "stable";
}
