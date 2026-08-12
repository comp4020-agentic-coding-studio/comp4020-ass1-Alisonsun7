import { describe, expect, it } from "vitest";
import { applyBrakeTap } from "./model";
import {
  CONVOY_BRAKE_TAP_VELOCITY_FRACTION,
  ConvoyExperiment,
  computeLinearGap,
  createConvoyCars,
  stepConvoy,
} from "./convoy";
import { DEFAULT_PARAMS, MIN_GAP_METRES } from "./types";
import type { SimParams } from "./types";

describe("createConvoyCars", () => {
  it("lines up cars evenly with car 0 as the frontmost leader", () => {
    const cars = createConvoyCars(5, DEFAULT_PARAMS);
    expect(cars).toHaveLength(5);
    for (let i = 1; i < cars.length; i++) {
      expect(cars[i].position).toBeLessThan(cars[i - 1].position);
    }
  });
});

describe("stepConvoy — leader", () => {
  it("free-runs to vMax and holds it when never tapped", () => {
    const params: SimParams = { ...DEFAULT_PARAMS, carCount: 5 };
    let cars = createConvoyCars(5, params);
    for (let tick = 0; tick < 200; tick++) {
      cars = stepConvoy(cars, params);
    }
    expect(cars[0].velocity).toBeCloseTo(params.vMax, 1);
  });

  it("dips below vMax while a brake tap is active, then recovers", () => {
    const params: SimParams = { ...DEFAULT_PARAMS, carCount: 5 };
    const tapTicks = Math.round(0.5 / params.dt);
    let cars = applyBrakeTap(createConvoyCars(5, params), 0, tapTicks);
    for (let tick = 0; tick < tapTicks; tick++) cars = stepConvoy(cars, params);
    expect(cars[0].velocity).toBeLessThanOrEqual(params.vMax * CONVOY_BRAKE_TAP_VELOCITY_FRACTION + 1e-6);

    for (let tick = 0; tick < 400; tick++) cars = stepConvoy(cars, params);
    expect(cars[0].velocity).toBeCloseTo(params.vMax, 1);
  });
});

describe("stepConvoy — non-overlap floor", () => {
  it("never lets a follower close its gap below MIN_GAP_METRES, even with a long reaction delay", () => {
    const params: SimParams = {
      ...DEFAULT_PARAMS,
      carCount: 10,
      reactionTimeSeconds: 2,
      safeFollowingDistance: 5,
    };
    let cars = applyBrakeTap(createConvoyCars(params.carCount, params), 0, Math.round(2 / params.dt));

    for (let tick = 0; tick < 300; tick++) {
      cars = stepConvoy(cars, params);
      for (let i = 1; i < cars.length; i++) {
        const gap = computeLinearGap(cars[i], cars[i - 1], params.carLength);
        expect(gap).toBeGreaterThanOrEqual(MIN_GAP_METRES - 1e-6);
      }
    }
  });
});

describe("stepConvoy — causal chain", () => {
  it("has each follower dip further below vMax than the follower ahead of it, for the first several cars back", () => {
    // Empirically tuned (via a disposable probe script) so the disturbance
    // amplifies cleanly across the first several followers before saturating:
    // a gentler, more realistic tap (safeFollowingDistance 20, a 0.2s tap)
    // than the ring's emergency-stop defaults, which would flatten the whole
    // line to a dead stop in one hop instead of showing graded intensity.
    const params: SimParams = {
      ...DEFAULT_PARAMS,
      carCount: 8,
      reactionTimeSeconds: 0.8,
      safeFollowingDistance: 20,
    };
    let cars = applyBrakeTap(createConvoyCars(params.carCount, params), 0, Math.round(0.2 / params.dt));

    // Peak per-tick deceleration is noisy here: the shared MIN_GAP_METRES
    // floor can snap a car's speed down in a single "emergency stop" tick,
    // producing spikes unrelated to the reaction-based braking this test is
    // about. The velocity dip since the tap — vMax minus the running-minimum
    // velocity — is the robust, physically meaningful signal for "how hard
    // did this car end up braking".
    const minVelocity = cars.map((car) => car.velocity);

    for (let tick = 0; tick < 500; tick++) {
      cars = stepConvoy(cars, params);
      for (let i = 0; i < cars.length; i++) {
        minVelocity[i] = Math.min(minVelocity[i], cars[i].velocity);
      }
    }

    const dip = minVelocity.map((v) => params.vMax - v);

    // Car 0's own "dip" is the injected disturbance itself (the tap), not a
    // reaction, so the amplifying-chain claim is compared among the
    // followers that actually react to it: cars 1 through 4, which the
    // tuning sweep confirmed dip further each hop back before the wave
    // saturates into a sustained jam for cars further behind.
    for (let i = 2; i <= 4; i++) {
      expect(dip[i]).toBeGreaterThan(dip[i - 1]);
    }
    // The disturbance must actually reach car 1, not merely fail to shrink
    // from an already-negligible baseline.
    expect(dip[1]).toBeGreaterThan(5);
  });
});

describe("ConvoyExperiment", () => {
  it("resets to a fresh cruising line on brakeTap", () => {
    const experiment = new ConvoyExperiment(6, DEFAULT_PARAMS);
    for (let tick = 0; tick < 50; tick++) experiment.step();
    experiment.brakeTap(Math.round(0.5 / DEFAULT_PARAMS.dt));

    const { cars } = experiment.getSnapshot();
    expect(cars[0].brakeTicksRemaining).toBeGreaterThan(0);
    for (let i = 1; i < cars.length; i++) {
      expect(cars[i].velocity).toBeCloseTo(DEFAULT_PARAMS.vMax, 5);
    }
  });

  it("fires 'braking harder' and later 'recovering' labels during a tuned brake tap", () => {
    const params: SimParams = {
      ...DEFAULT_PARAMS,
      carCount: 8,
      reactionTimeSeconds: 0.8,
      safeFollowingDistance: 20,
    };
    const experiment = new ConvoyExperiment(params.carCount, params);
    experiment.brakeTap(Math.round(0.2 / params.dt));

    for (let tick = 0; tick < 600; tick++) experiment.step();

    const fired = experiment.getFiredLabels();
    expect(fired.some((label) => label.text === "braking harder")).toBe(true);
    expect(fired.some((label) => label.text === "recovering")).toBe(true);
  });
});
