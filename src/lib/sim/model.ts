import type { Car } from "./types";

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
