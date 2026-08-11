import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// This is the week's own contract, turned into tests: the interactive
// controls and readouts the brief asks for must actually be present in the
// built page, not just described in prose.
const doc = new JSDOM(readFileSync(resolve("dist/index.html"), "utf8")).window.document;

describe("traffic simulator: visuals", () => {
  it("gives the road canvas an accessible name", () => {
    const canvas = doc.querySelector("#road-canvas");
    expect(canvas?.getAttribute("role")).toBe("img");
    expect(canvas?.getAttribute("aria-label")?.trim()).not.toBe("");
  });

  it("gives the chart canvas an accessible name", () => {
    const canvas = doc.querySelector("#chart-canvas");
    expect(canvas?.getAttribute("role")).toBe("img");
    expect(canvas?.getAttribute("aria-label")?.trim()).not.toBe("");
  });
});

describe("traffic simulator: controls", () => {
  const sliders: Array<{ id: string; min: string; max: string }> = [
    { id: "car-count-input", min: "15", max: "60" },
    { id: "reaction-time-input", min: "0.1", max: "2" },
    { id: "following-distance-input", min: "5", max: "30" },
  ];

  for (const { id, min, max } of sliders) {
    it(`${id} is a labelled range input with the right bounds`, () => {
      const input = doc.querySelector<HTMLInputElement>(`#${id}`);
      expect(input).toBeTruthy();
      expect(input?.getAttribute("type")).toBe("range");
      expect(input?.getAttribute("min")).toBe(min);
      expect(input?.getAttribute("max")).toBe(max);

      const label = doc.querySelector(`label[for="${id}"]`);
      expect(label, `#${id} needs a <label for="${id}">`).toBeTruthy();

      expect(input?.getAttribute("aria-valuetext")?.trim()).not.toBe("");
    });
  }

  it("has a brake-tap disturbance button", () => {
    const button = doc.querySelector("#brake-tap-button");
    expect(button?.tagName).toBe("BUTTON");
  });

  it("has a preset button for every named scenario", () => {
    const presetButtons = doc.querySelectorAll("[data-preset]");
    expect(presetButtons.length).toBeGreaterThanOrEqual(3);
  });
});

describe("traffic simulator: readouts", () => {
  it("has a single aria-live region for the discrete state", () => {
    const liveRegions = doc.querySelectorAll('[aria-live="polite"]');
    expect(liveRegions.length).toBe(1);
  });

  for (const id of ["metric-avg-speed", "metric-density", "metric-wave-strength"]) {
    it(`has a ${id} readout element`, () => {
      expect(doc.querySelector(`#${id}`)).toBeTruthy();
    });
  }
});
