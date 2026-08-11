import { classifyCarColor } from "../sim/metrics";
import type { CarColor } from "../sim/metrics";
import type { Car, SimParams } from "../sim/types";

export interface CanvasSize {
  width: number; // CSS pixels
  height: number; // CSS pixels
}

const ROAD_COLOR = "#2b2b2b";
const LANE_MARK_COLOR = "#e8c547";
const ROAD_WIDTH_PX = 18;
const PADDING_PX = 12;

const CAR_COLORS: Record<CarColor, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#dc2626",
};

// Draws the circular road and every car on it, positioned by angle around
// the loop. Not unit-tested — canvas has no representation in this repo's
// Node/JSDOM test environment — so this is verified visually instead.
export function drawRoad(
  ctx: CanvasRenderingContext2D,
  cars: readonly Car[],
  params: SimParams,
  size: CanvasSize,
): void {
  const { width, height } = size;
  ctx.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const trackRadius = Math.min(width, height) / 2 - PADDING_PX - ROAD_WIDTH_PX / 2;

  if (trackRadius <= 0) return;

  ctx.strokeStyle = ROAD_COLOR;
  ctx.lineWidth = ROAD_WIDTH_PX;
  ctx.beginPath();
  ctx.arc(centerX, centerY, trackRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = LANE_MARK_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 10]);
  ctx.beginPath();
  ctx.arc(centerX, centerY, trackRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Sized from the car's actual physical length (not the average spacing) so
  // that when cars queue up close together during a jam, their drawn shapes
  // — which now can never overlap in position, per the model's minimum-gap
  // floor — never overlap on screen either.
  const circumference = 2 * Math.PI * trackRadius;
  const metresToPixels = circumference / params.trackLength;
  const carRadius = Math.max(2, (params.carLength / 2) * metresToPixels);

  for (const car of cars) {
    const fraction = car.position / params.trackLength;
    const angle = fraction * Math.PI * 2 - Math.PI / 2;
    const x = centerX + trackRadius * Math.cos(angle);
    const y = centerY + trackRadius * Math.sin(angle);

    ctx.fillStyle = CAR_COLORS[classifyCarColor(car.velocity, params.vMax)];
    ctx.beginPath();
    ctx.arc(x, y, carRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}
