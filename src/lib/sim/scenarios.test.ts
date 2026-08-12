import { describe, expect, it } from "vitest";
import { SCENARIOS } from "./scenarios";
import { CAR_COUNT_RANGE, FOLLOWING_DISTANCE_RANGE, REACTION_TIME_RANGE } from "./types";

describe("SCENARIOS", () => {
  it.each(SCENARIOS)("$label stays within every slider range", (scenario) => {
    expect(scenario.convoyParams.carCount).toBeGreaterThanOrEqual(CAR_COUNT_RANGE.min);
    expect(scenario.convoyParams.carCount).toBeLessThanOrEqual(CAR_COUNT_RANGE.max);

    expect(scenario.convoyParams.reactionTimeSeconds).toBeGreaterThanOrEqual(REACTION_TIME_RANGE.min);
    expect(scenario.convoyParams.reactionTimeSeconds).toBeLessThanOrEqual(REACTION_TIME_RANGE.max);

    expect(scenario.convoyParams.safeFollowingDistance).toBeGreaterThanOrEqual(FOLLOWING_DISTANCE_RANGE.min);
    expect(scenario.convoyParams.safeFollowingDistance).toBeLessThanOrEqual(FOLLOWING_DISTANCE_RANGE.max);
  });

  it.each(SCENARIOS)("$label has a complete, non-empty five-point narrative", (scenario) => {
    for (const value of Object.values(scenario.narrative)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("has unique ids", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
