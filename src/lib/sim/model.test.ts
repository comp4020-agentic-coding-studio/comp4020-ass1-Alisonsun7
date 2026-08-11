import { describe, expect, it } from "vitest";
import { applyBrakeTap, computeGap, createHistoryBuffer, optimalVelocity, stepSimulation } from "./model";
import { DEFAULT_PARAMS, MIN_GAP_METRES } from "./types";
import type { Car, SimParams } from "./types";

function makeCar(id: number, position: number, velocity = 0): Car {
  return {
    id,
    position,
    velocity,
    history: createHistoryBuffer({ gap: 20, velocity }),
    historyIndex: 0,
    brakeTicksRemaining: 0,
  };
}

function makeRing(count: number, trackLength: number, velocity: number): Car[] {
  return Array.from({ length: count }, (_, i) => makeCar(i, (i * trackLength) / count, velocity));
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

describe("stepSimulation", () => {
  const params: SimParams = { ...DEFAULT_PARAMS, carCount: 5, trackLength: 500 };

  it("does not mutate its input cars or their history buffers", () => {
    const cars = makeRing(params.carCount, params.trackLength, 8);
    const snapshot = JSON.parse(JSON.stringify(cars));

    stepSimulation(cars, params);

    expect(JSON.parse(JSON.stringify(cars))).toEqual(snapshot);
  });

  it("returns the same number of cars with advanced positions", () => {
    const cars = makeRing(params.carCount, params.trackLength, 8);
    const next = stepSimulation(cars, params);

    expect(next).toHaveLength(cars.length);
    for (let i = 0; i < cars.length; i++) {
      expect(next[i].id).toBe(cars[i].id);
    }
  });

  it("wraps a car's position back to zero once it crosses the track length", () => {
    const cars = makeRing(2, 100, 0);
    cars[0].position = 99;
    cars[0].velocity = params.vMax;
    const next = stepSimulation(cars, { ...params, trackLength: 100 });
    expect(next[0].position).toBeLessThan(100);
    expect(next[0].position).toBeGreaterThanOrEqual(0);
  });
});

describe("stepSimulation — non-overlap floor", () => {
  it("never lets a car close its gap below MIN_GAP_METRES, even with a long reaction delay", () => {
    const params: SimParams = {
      ...DEFAULT_PARAMS,
      carCount: 10,
      trackLength: 200,
      reactionTimeSeconds: 2, // worst case: the reactive model lags as long as possible
      safeFollowingDistance: 5,
    };
    let cars = applyBrakeTap(
      makeRing(params.carCount, params.trackLength, params.vMax * 0.8),
      0,
      Math.round(2 / params.dt), // a long, hard brake — the disturbance most likely to overshoot
    );

    for (let tick = 0; tick < 300; tick++) {
      cars = stepSimulation(cars, params);
      for (let i = 0; i < cars.length; i++) {
        const ahead = cars[(i + 1) % cars.length];
        const gap = computeGap(cars[i], ahead, params.trackLength, params.carLength);
        expect(gap).toBeGreaterThanOrEqual(MIN_GAP_METRES - 1e-6);
      }
    }
  });
});

describe("applyBrakeTap", () => {
  it("sets brakeTicksRemaining only on the targeted car", () => {
    const cars = makeRing(3, 300, 8);
    const tapped = applyBrakeTap(cars, 1, 15);

    expect(tapped[0].brakeTicksRemaining).toBe(0);
    expect(tapped[1].brakeTicksRemaining).toBe(15);
    expect(tapped[2].brakeTicksRemaining).toBe(0);
  });

  it("does not mutate the input array", () => {
    const cars = makeRing(3, 300, 8);
    applyBrakeTap(cars, 1, 15);
    expect(cars[1].brakeTicksRemaining).toBe(0);
  });

  it("caps the tapped car's velocity while ticks remain", () => {
    const params: SimParams = { ...DEFAULT_PARAMS, carCount: 3, trackLength: 300 };
    let cars = applyBrakeTap(makeRing(3, 300, params.vMax), 0, 5);
    cars = stepSimulation(cars, params);
    expect(cars[0].velocity).toBeLessThanOrEqual(params.vMax * 0.2 + 1e-6);
  });
});
