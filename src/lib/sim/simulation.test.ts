import { describe, expect, it } from "vitest";
import { computeGap } from "./model";
import { Simulation } from "./simulation";
import { DEFAULT_PARAMS, MIN_GAP_METRES } from "./types";
import type { SimParams } from "./types";

function runTicks(sim: Simulation, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.step();
}

// Runs `ticks` steps, asserting after every single one that no car has
// closed its gap below the physical floor — a jam must stay a queue, not a
// pile-up, at every tick along the way, not just at the end.
function runTicksAssertingNoOverlap(sim: Simulation, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    sim.step();
    const { cars, params } = sim.getSnapshot();
    for (let j = 0; j < cars.length; j++) {
      const ahead = cars[(j + 1) % cars.length];
      const gap = computeGap(cars[j], ahead, params.trackLength, params.carLength);
      expect(gap).toBeGreaterThanOrEqual(MIN_GAP_METRES - 1e-6);
    }
  }
}

// These two scenarios are the assignment's actual thesis, run as code: the
// same brake tap either decays or amplifies depending only on density,
// following distance, and reaction time — no accident or traffic light
// involved. Values were tuned by observing this exact model's behaviour
// (see PROCESS.md), not guessed and then asserted.
describe("Simulation — core causal claim", () => {
  it("a brake tap decays under low density, large following distance, fast reaction", () => {
    const params: SimParams = {
      ...DEFAULT_PARAMS,
      carCount: 15,
      safeFollowingDistance: 25,
      reactionTimeSeconds: 0.3,
    };
    const sim = new Simulation(params);
    runTicks(sim, 90); // settle to equilibrium before disturbing it
    sim.brakeTap(0, Math.round(0.5 / params.dt));

    runTicksAssertingNoOverlap(sim, 900); // 30s to let the wave play out
    const snap = sim.getSnapshot();

    expect(snap.waveStrength).toBeLessThan(0.1);
    expect(snap.avgSpeed).toBeGreaterThan(params.vMax * 0.9);
  });

  it("a brake tap sustains under high density, small following distance, slow reaction", () => {
    const params: SimParams = {
      ...DEFAULT_PARAMS,
      carCount: 55,
      safeFollowingDistance: 8,
      reactionTimeSeconds: 1.5,
    };
    const sim = new Simulation(params);
    runTicks(sim, 90);
    sim.brakeTap(0, Math.round(0.5 / params.dt));

    runTicksAssertingNoOverlap(sim, 900);
    const snap = sim.getSnapshot();

    expect(snap.waveStrength).toBeGreaterThan(0.5);
    expect(snap.avgSpeed).toBeLessThan(params.vMax * 0.85);
  });
});

describe("Simulation — API surface", () => {
  it("setParams keeps existing cars when carCount is unchanged", () => {
    const sim = new Simulation(DEFAULT_PARAMS);
    runTicks(sim, 10);
    const before = sim.getSnapshot().cars.map((c) => c.position);

    sim.setParams({ ...DEFAULT_PARAMS, reactionTimeSeconds: 1.2 });
    const after = sim.getSnapshot().cars.map((c) => c.position);

    expect(after).toEqual(before);
  });

  it("setParams rebuilds the ring when carCount changes", () => {
    const sim = new Simulation(DEFAULT_PARAMS);
    runTicks(sim, 10);

    sim.setParams({ ...DEFAULT_PARAMS, carCount: 20 });
    const snap = sim.getSnapshot();

    expect(snap.cars).toHaveLength(20);
    expect(snap.speedHistory).toHaveLength(0);
  });

  it("brakeTap only affects the targeted car's speed ceiling", () => {
    const sim = new Simulation(DEFAULT_PARAMS);
    sim.brakeTap(0, 10);
    sim.step();
    const snap = sim.getSnapshot();
    const tapped = snap.cars.find((c) => c.id === 0);

    expect(tapped?.velocity).toBeLessThanOrEqual(DEFAULT_PARAMS.vMax * 0.2 + 1e-6);
  });
});
