import { describe, expect, it } from "vitest";
import { applyPreset, PRESETS } from "./presets";
import {
  CAR_COUNT_RANGE,
  DEFAULT_PARAMS,
  FOLLOWING_DISTANCE_RANGE,
  REACTION_TIME_RANGE,
} from "./types";

describe("PRESETS", () => {
  it.each(PRESETS)("$label stays within every slider range", (preset) => {
    expect(preset.params.carCount).toBeGreaterThanOrEqual(CAR_COUNT_RANGE.min);
    expect(preset.params.carCount).toBeLessThanOrEqual(CAR_COUNT_RANGE.max);

    expect(preset.params.reactionTimeSeconds).toBeGreaterThanOrEqual(REACTION_TIME_RANGE.min);
    expect(preset.params.reactionTimeSeconds).toBeLessThanOrEqual(REACTION_TIME_RANGE.max);

    expect(preset.params.safeFollowingDistance).toBeGreaterThanOrEqual(FOLLOWING_DISTANCE_RANGE.min);
    expect(preset.params.safeFollowingDistance).toBeLessThanOrEqual(FOLLOWING_DISTANCE_RANGE.max);
  });

  it("has unique ids", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("applyPreset", () => {
  it("overrides only the preset's own three params, keeping the rest", () => {
    const next = applyPreset(DEFAULT_PARAMS, PRESETS[0]);

    expect(next.carCount).toBe(PRESETS[0].params.carCount);
    expect(next.reactionTimeSeconds).toBe(PRESETS[0].params.reactionTimeSeconds);
    expect(next.safeFollowingDistance).toBe(PRESETS[0].params.safeFollowingDistance);
    expect(next.vMax).toBe(DEFAULT_PARAMS.vMax);
    expect(next.trackLength).toBe(DEFAULT_PARAMS.trackLength);
  });

  it("does not mutate the input params", () => {
    const before = { ...DEFAULT_PARAMS };
    applyPreset(DEFAULT_PARAMS, PRESETS[1]);
    expect(DEFAULT_PARAMS).toEqual(before);
  });
});
