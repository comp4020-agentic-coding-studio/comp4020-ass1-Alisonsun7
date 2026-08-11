import { drawRoad } from "../lib/render/road-canvas";
import { Simulation } from "../lib/sim/simulation";
import { BRAKE_TAP_DURATION_SECONDS, DEFAULT_PARAMS } from "../lib/sim/types";
import type { SimParams } from "../lib/sim/types";

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

  const roadCtxEl = roadCanvasEl?.getContext("2d");
  if (!roadCanvasEl || !roadCtxEl) return;
  const canvas: HTMLCanvasElement = roadCanvasEl;
  const ctx: CanvasRenderingContext2D = roadCtxEl;

  let params: SimParams = { ...DEFAULT_PARAMS };
  const sim = new Simulation(params);

  function updateParams(patch: Partial<SimParams>): void {
    params = { ...params, ...patch };
    sim.setParams(params);
  }

  resizeCanvasToDisplaySize(canvas, ctx);
  window.addEventListener("resize", () => resizeCanvasToDisplaySize(canvas, ctx));

  carCountInput?.addEventListener("input", () => {
    const carCount = Number(carCountInput.value);
    updateParams({ carCount });
    if (carCountOutput) carCountOutput.textContent = `${carCount} cars`;
    canvas.setAttribute("aria-label", `Circular road with ${carCount} cars`);
  });

  reactionTimeInput?.addEventListener("input", () => {
    const reactionTimeSeconds = Number(reactionTimeInput.value);
    updateParams({ reactionTimeSeconds });
    if (reactionTimeOutput) reactionTimeOutput.textContent = `${reactionTimeSeconds.toFixed(1)} s`;
  });

  followingDistanceInput?.addEventListener("input", () => {
    const safeFollowingDistance = Number(followingDistanceInput.value);
    updateParams({ safeFollowingDistance });
    if (followingDistanceOutput) followingDistanceOutput.textContent = `${safeFollowingDistance} m`;
  });

  brakeButton?.addEventListener("click", () => {
    sim.brakeTap(BRAKE_TAP_CAR_ID, Math.round(BRAKE_TAP_DURATION_SECONDS / params.dt));
  });

  let lastTimeMs: number | null = null;
  let accumulatorSeconds = 0;

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

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
