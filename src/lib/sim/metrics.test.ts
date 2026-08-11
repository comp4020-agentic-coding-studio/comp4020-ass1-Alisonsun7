import { describe, expect, it } from "vitest";
import {
  classifyCarColor,
  classifyState,
  computeAverageSpeed,
  computeDensity,
  computeWaveStrength,
} from "./metrics";
import type { Car, RollingSample } from "./types";

const VMAX = 16.7;

function makeCar(id: number, velocity: number): Car {
  return {
    id,
    position: 0,
    velocity,
    history: [],
    historyIndex: 0,
    brakeTicksRemaining: 0,
  };
}

describe("classifyCarColor", () => {
  it("is green at and above 0.75 vMax", () => {
    expect(classifyCarColor(VMAX * 0.75, VMAX)).toBe("green");
    expect(classifyCarColor(VMAX, VMAX)).toBe("green");
  });

  it("is yellow between 0.35 and 0.75 vMax", () => {
    expect(classifyCarColor(VMAX * 0.35, VMAX)).toBe("yellow");
    expect(classifyCarColor(VMAX * 0.74, VMAX)).toBe("yellow");
  });

  it("is red below 0.35 vMax", () => {
    expect(classifyCarColor(VMAX * 0.34, VMAX)).toBe("red");
    expect(classifyCarColor(0, VMAX)).toBe("red");
  });
});

describe("computeAverageSpeed", () => {
  it("averages velocities", () => {
    const cars = [makeCar(0, 10), makeCar(1, 20), makeCar(2, 0)];
    expect(computeAverageSpeed(cars)).toBeCloseTo(10);
  });

  it("is zero for an empty array", () => {
    expect(computeAverageSpeed([])).toBe(0);
  });
});

describe("computeDensity", () => {
  it("is car count divided by track length", () => {
    const cars = [makeCar(0, 0), makeCar(1, 0)];
    expect(computeDensity(cars, 1000)).toBeCloseTo(2 / 1000);
  });
});

describe("computeWaveStrength", () => {
  it("is zero when every car moves at the same speed", () => {
    const cars = [makeCar(0, 10), makeCar(1, 10), makeCar(2, 10)];
    expect(computeWaveStrength(cars, VMAX)).toBe(0);
  });

  it("is higher when one car is much slower than the rest", () => {
    const uniform = [makeCar(0, 10), makeCar(1, 10), makeCar(2, 10)];
    const withSlowCar = [makeCar(0, 10), makeCar(1, 2), makeCar(2, 10)];
    expect(computeWaveStrength(withSlowCar, VMAX)).toBeGreaterThan(computeWaveStrength(uniform, VMAX));
  });
});

describe("classifyState", () => {
  const params = { stableWaveThreshold: 0.15, jamWaveThreshold: 0.45, jamSpeedThreshold: VMAX * 0.4 };

  it("is stable given a flat, high-speed, low-wave history", () => {
    const history: RollingSample[] = Array.from({ length: 10 }, () => ({
      avgSpeed: VMAX * 0.9,
      waveStrength: 0.02,
    }));
    expect(classifyState(history, params)).toBe("stable");
  });

  it("is unstable given an elevated but not-yet-sustained wave strength", () => {
    const history: RollingSample[] = Array.from({ length: 10 }, () => ({
      avgSpeed: VMAX * 0.7,
      waveStrength: 0.25,
    }));
    expect(classifyState(history, params)).toBe("unstable");
  });

  it("is phantom-jam given sustained low speed and high wave strength", () => {
    const history: RollingSample[] = Array.from({ length: 10 }, () => ({
      avgSpeed: VMAX * 0.2,
      waveStrength: 0.6,
    }));
    expect(classifyState(history, params)).toBe("phantom-jam");
  });

  it("is stable for an empty history", () => {
    expect(classifyState([], params)).toBe("stable");
  });
});
