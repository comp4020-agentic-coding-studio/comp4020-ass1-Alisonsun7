import { drawSparkline } from "../lib/render/chart-canvas";
import { drawRoad } from "../lib/render/road-canvas";
import { computeDensity } from "../lib/sim/metrics";
import { applyPreset, PRESETS } from "../lib/sim/presets";
import { Simulation } from "../lib/sim/simulation";
import { BRAKE_TAP_DURATION_SECONDS, DEFAULT_PARAMS } from "../lib/sim/types";
import type { SimParams, SimState } from "../lib/sim/types";

const METRES_PER_SECOND_TO_KMH = 3.6;
const METRES_TO_KM = 1000;

const STATE_COPY: Record<SimState, { label: string; explanation: string }> = {
  stable: {
    label: "Stable flow.",
    explanation: "Every car is moving freely — a tap on the brakes dies out almost as fast as it starts.",
  },
  unstable: {
    label: "Wave forming.",
    explanation: "Speed is bunching up in places — a disturbance is rippling through traffic rather than fading.",
  },
  "phantom-jam": {
    label: "Phantom jam.",
    explanation: "No accident, no lights — just density, following distance, and reaction time. The wave is sustaining itself.",
  },
};

const BRAKE_TAP_CAR_ID = 0;

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function initTrafficSim(): void {
  const roadCanvasEl = document.querySelector<HTMLCanvasElement>("#road-canvas");
  const brakeButton = document.querySelector<HTMLButtonElement>("#brake-tap-button");
  const carCountInput = document.querySelector<HTMLInputElement>("#car-count-input");
  const reactionTimeInput = document.querySelector<HTMLInputElement>("#reaction-time-input");
  const followingDistanceInput = document.querySelector<HTMLInputElement>("#following-distance-input");
  const carCountOutput = document.querySelector<HTMLOutputElement>("#car-count-output");
  const reactionTimeOutput = document.querySelector<HTMLOutputElement>("#reaction-time-output");
  const followingDistanceOutput = document.querySelector<HTMLOutputElement>("#following-distance-output");
  const chartCanvasEl = document.querySelector<HTMLCanvasElement>("#chart-canvas");
  const avgSpeedEl = document.querySelector("#metric-avg-speed");
  const densityEl = document.querySelector("#metric-density");
  const waveStrengthEl = document.querySelector("#metric-wave-strength");
  const stateLabelEl = document.querySelector("#sim-state-label");
  const stateExplanationEl = document.querySelector("#sim-state-explanation");
  const presetButtons = document.querySelectorAll<HTMLButtonElement>("[data-preset]");

  const roadCtxEl = roadCanvasEl?.getContext("2d");
  const chartCtxEl = chartCanvasEl?.getContext("2d");
  if (!roadCanvasEl || !roadCtxEl || !chartCanvasEl || !chartCtxEl) return;
  const canvas: HTMLCanvasElement = roadCanvasEl;
  const ctx: CanvasRenderingContext2D = roadCtxEl;
  const chartCanvas: HTMLCanvasElement = chartCanvasEl;
  const chartCtx: CanvasRenderingContext2D = chartCtxEl;

  let params: SimParams = { ...DEFAULT_PARAMS };
  const sim = new Simulation(params);

  function updateParams(patch: Partial<SimParams>): void {
    params = { ...params, ...patch };
    sim.setParams(params);
  }

  function syncControlsToParams(): void {
    if (carCountInput) {
      carCountInput.value = String(params.carCount);
      carCountInput.setAttribute("aria-valuetext", `${params.carCount} cars`);
    }
    if (carCountOutput) carCountOutput.textContent = `${params.carCount} cars`;
    canvas.setAttribute("aria-label", `Circular road with ${params.carCount} cars`);

    if (reactionTimeInput) {
      reactionTimeInput.value = String(params.reactionTimeSeconds);
      reactionTimeInput.setAttribute("aria-valuetext", `${params.reactionTimeSeconds.toFixed(1)} seconds`);
    }
    if (reactionTimeOutput) reactionTimeOutput.textContent = `${params.reactionTimeSeconds.toFixed(1)} s`;

    if (followingDistanceInput) {
      followingDistanceInput.value = String(params.safeFollowingDistance);
      followingDistanceInput.setAttribute("aria-valuetext", `${params.safeFollowingDistance} metres`);
    }
    if (followingDistanceOutput) followingDistanceOutput.textContent = `${params.safeFollowingDistance} m`;
  }

  resizeCanvasToDisplaySize(canvas, ctx);
  resizeCanvasToDisplaySize(chartCanvas, chartCtx);
  window.addEventListener("resize", () => {
    resizeCanvasToDisplaySize(canvas, ctx);
    resizeCanvasToDisplaySize(chartCanvas, chartCtx);
  });

  syncControlsToParams();

  carCountInput?.addEventListener("input", () => {
    updateParams({ carCount: Number(carCountInput.value) });
    syncControlsToParams();
  });

  reactionTimeInput?.addEventListener("input", () => {
    updateParams({ reactionTimeSeconds: Number(reactionTimeInput.value) });
    syncControlsToParams();
  });

  followingDistanceInput?.addEventListener("input", () => {
    updateParams({ safeFollowingDistance: Number(followingDistanceInput.value) });
    syncControlsToParams();
  });

  brakeButton?.addEventListener("click", () => {
    sim.brakeTap(BRAKE_TAP_CAR_ID, Math.round(BRAKE_TAP_DURATION_SECONDS / params.dt));
  });

  for (const button of presetButtons) {
    button.addEventListener("click", () => {
      const preset = PRESETS.find((candidate) => candidate.id === button.dataset.preset);
      if (!preset) return;
      updateParams(applyPreset(params, preset));
      syncControlsToParams();
    });
  }

  let lastTimeMs: number | null = null;
  let accumulatorSeconds = 0;
  let lastState: SimState | null = null;

  function frame(nowMs: number): void {
    if (lastTimeMs === null) lastTimeMs = nowMs;
    accumulatorSeconds += (nowMs - lastTimeMs) / 1000;
    lastTimeMs = nowMs;

    while (accumulatorSeconds >= params.dt) {
      sim.step();
      accumulatorSeconds -= params.dt;
    }

    const snapshot = sim.getSnapshot();
    drawRoad(ctx, snapshot.cars, snapshot.params, {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    });
    drawSparkline(chartCtx, snapshot.speedHistory, {
      width: chartCanvas.clientWidth,
      height: chartCanvas.clientHeight,
    }, { maxValue: snapshot.params.vMax });

    if (avgSpeedEl) {
      avgSpeedEl.textContent = `${Math.round(snapshot.avgSpeed * METRES_PER_SECOND_TO_KMH)} km/h`;
    }
    if (densityEl) {
      const carsPerKm = computeDensity(snapshot.cars, snapshot.params.trackLength) * METRES_TO_KM;
      densityEl.textContent = `${carsPerKm.toFixed(1)} cars/km`;
    }
    if (waveStrengthEl) {
      waveStrengthEl.textContent = snapshot.waveStrength.toFixed(2);
    }

    if (snapshot.state !== lastState) {
      lastState = snapshot.state;
      const copy = STATE_COPY[snapshot.state];
      if (stateLabelEl) stateLabelEl.textContent = copy.label;
      if (stateExplanationEl) stateExplanationEl.textContent = copy.explanation;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
