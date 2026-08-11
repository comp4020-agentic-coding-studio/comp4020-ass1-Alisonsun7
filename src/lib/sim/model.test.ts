import { describe, expect, it } from "vitest";
import { computeGap, optimalVelocity } from "./model";
import type { Car } from "./types";

function makeCar(id: number, position: number): Car {
  return { id, position, velocity: 0, history: [], historyIndex: 0, brakeTicksRemaining: 0 };
}

describe("optimalVelocity", () => {
  it("is zero at and under the safe following distance", () => {
    expect(optimalVelocity(5, 15, 16.7, 0.15)).toBe(0);
    expect(optimalVelocity(15, 15, 16.7, 0.15)).toBe(0);
  });

  it("is monotonically increasing once past the safe distance", () => {
    const a = optimalVelocity(20, 15, 16.7, 0.15);
    const b = optimalVelocity(40, 15, 16.7, 0.15);
    const c = optimalVelocity(80, 15, 16.7, 0.15);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it("saturates toward vMax for a very large gap", () => {
    const v = optimalVelocity(10_000, 15, 16.7, 0.15);
    expect(v).toBeGreaterThan(16.6);
    expect(v).toBeLessThanOrEqual(16.7);
  });
});

describe("computeGap", () => {
  it("computes a plain bumper-to-bumper gap when the car ahead has a larger position", () => {
    const car = makeCar(0, 100);
    const ahead = makeCar(1, 130);
    expect(computeGap(car, ahead, 1000, 4.5)).toBeCloseTo(30 - 4.5);
  });

  it("wraps across the loop boundary when the car ahead is the last car", () => {
    const car = makeCar(0, 980);
    const ahead = makeCar(1, 10);
    // wraps: (10 - 980 + 1000) mod 1000 = 30
    expect(computeGap(car, ahead, 1000, 4.5)).toBeCloseTo(30 - 4.5);
  });
});
