import { SCENARIOS } from "../lib/sim/scenarios";
import type { ScenarioCaseStudy } from "../lib/sim/scenarios";
import { DEFAULT_PARAMS } from "../lib/sim/types";
import { initConvoyExperiment } from "./convoy-experiment.client";

const NARRATIVE_FIELD_IDS = {
  whatHappens: "scenario-what-happens",
  howItStarts: "scenario-how-it-starts",
  whyFollowersAreAffected: "scenario-why-followers",
  howTheWaveDevelops: "scenario-how-wave-develops",
  whyItOutlastsItsCause: "scenario-why-outlasts",
} as const;

export function initScenarioShowcase(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-scenario]");
  const replayButton = document.querySelector<HTMLButtonElement>("#scenario-replay-button");
  if (buttons.length === 0) return;

  const handle = initConvoyExperiment({
    canvasSelector: "#scenario-canvas",
    carCount: SCENARIOS[0].convoyParams.carCount,
    params: { ...DEFAULT_PARAMS, ...SCENARIOS[0].convoyParams },
  });
  if (!handle) return;

  function selectScenario(scenario: ScenarioCaseStudy): void {
    handle?.setScenario(scenario.convoyParams.carCount, { ...DEFAULT_PARAMS, ...scenario.convoyParams });
    handle?.tap();

    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(button.dataset.scenario === scenario.id));
    }

    for (const [field, elementId] of Object.entries(NARRATIVE_FIELD_IDS)) {
      const el = document.querySelector(`#${elementId}`);
      if (el) el.textContent = scenario.narrative[field as keyof typeof NARRATIVE_FIELD_IDS];
    }
  }

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const scenario = SCENARIOS.find((candidate) => candidate.id === button.dataset.scenario);
      if (scenario) selectScenario(scenario);
    });
  }

  replayButton?.addEventListener("click", () => handle?.tap());

  selectScenario(SCENARIOS[0]);
}
