import type { SimParams } from "./types";

export interface Preset {
  id: string;
  label: string;
  description: string;
  params: Pick<SimParams, "carCount" | "reactionTimeSeconds" | "safeFollowingDistance">;
}

// The first two mirror the exact scenarios validated in simulation.test.ts —
// "sunday-morning" decays a brake tap, "school-pickup" sustains one. Same
// physics, just given a name a driver would recognise.
export const PRESETS: Preset[] = [
  {
    id: "sunday-morning",
    label: "Sunday morning",
    description: "Light traffic, alert drivers, generous gaps — a tap on the brakes barely ripples.",
    params: { carCount: 10, reactionTimeSeconds: 0.3, safeFollowingDistance: 25 },
  },
  {
    id: "peak-hour",
    label: "Peak hour",
    description: "Moderate density on the edge of stability — a tap can go either way.",
    params: { carCount: 15, reactionTimeSeconds: 0.4, safeFollowingDistance: 25 },
  },
  {
    id: "school-pickup",
    label: "School pickup",
    description: "Dense traffic, distracted drivers, tight gaps — a tap becomes a standing jam.",
    params: { carCount: 30, reactionTimeSeconds: 2, safeFollowingDistance: 22 },
  },
];

export function applyPreset(params: SimParams, preset: Preset): SimParams {
  return { ...params, ...preset.params };
}
