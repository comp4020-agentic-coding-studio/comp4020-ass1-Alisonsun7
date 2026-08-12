import { resizeCanvasToDisplaySize } from "../lib/render/canvas-utils";
import { drawConvoy } from "../lib/render/convoy-canvas";
import { CONVOY_TAP_DURATION_SECONDS, ConvoyExperiment } from "../lib/sim/convoy";
import type { SimParams } from "../lib/sim/types";

export interface ConvoyExperimentConfig {
  canvasSelector: string;
  buttonSelector?: string; // wires a "tap the brakes" click handler, if present
  carCount: number;
  params: SimParams;
  tapDurationSeconds?: number;
  /** Play the tap immediately once the experiment is (re)initialised. */
  autoTap?: boolean;
}

export interface ConvoyExperimentHandle {
  /** Re-initialises with a new scenario's car count/params and replays the tap. */
  setScenario(carCount: number, params: SimParams): void;
  tap(): void;
}

// Drives one convoy canvas: owns its ConvoyExperiment instance, its RAF
// loop, and (optionally) its "Tap the brakes" button. Section 1 uses this
// directly; Section 2's scenario picker reuses it via the returned handle's
// setScenario/tap instead of re-registering a second RAF loop per scenario.
export function initConvoyExperiment(config: ConvoyExperimentConfig): ConvoyExperimentHandle | null {
  const canvasEl = document.querySelector<HTMLCanvasElement>(config.canvasSelector);
  const ctxEl = canvasEl?.getContext("2d");
  if (!canvasEl || !ctxEl) return null;
  const canvas: HTMLCanvasElement = canvasEl;
  const ctx: CanvasRenderingContext2D = ctxEl;

  const tapDurationSeconds = config.tapDurationSeconds ?? CONVOY_TAP_DURATION_SECONDS;

  let params = config.params;
  let experiment = new ConvoyExperiment(config.carCount, params);

  function tap(): void {
    experiment.brakeTap(Math.round(tapDurationSeconds / params.dt));
  }

  function setScenario(carCount: number, newParams: SimParams): void {
    params = newParams;
    experiment = new ConvoyExperiment(carCount, params);
  }

  const button = config.buttonSelector
    ? document.querySelector<HTMLButtonElement>(config.buttonSelector)
    : null;
  button?.addEventListener("click", tap);

  resizeCanvasToDisplaySize(canvas, ctx);
  window.addEventListener("resize", () => resizeCanvasToDisplaySize(canvas, ctx));

  let lastTimeMs: number | null = null;
  let accumulatorSeconds = 0;

  function frame(nowMs: number): void {
    if (lastTimeMs === null) lastTimeMs = nowMs;
    accumulatorSeconds += (nowMs - lastTimeMs) / 1000;
    lastTimeMs = nowMs;

    while (accumulatorSeconds >= params.dt) {
      experiment.step();
      accumulatorSeconds -= params.dt;
    }

    const snapshot = experiment.getSnapshot();
    drawConvoy(ctx, snapshot.cars, snapshot.params, snapshot.labels, {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    });

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  if (config.autoTap) tap();

  return { setScenario, tap };
}
