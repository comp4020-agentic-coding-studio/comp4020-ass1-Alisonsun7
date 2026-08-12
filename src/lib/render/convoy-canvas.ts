import { classifyCarColor } from "../sim/metrics";
import type { CarColor } from "../sim/metrics";
import type { ConvoyLabel } from "../sim/convoy";
import type { CanvasSize } from "./road-canvas";
import type { Car, SimParams } from "../sim/types";

const ROAD_COLOR = "#2b2b2b";
const LANE_MARK_COLOR = "#e8c547";
const ROAD_WIDTH_PX = 40;
const LEADER_OUTLINE_COLOR = "#0b5fff";
const LABEL_TEXT_COLOR = "#1f1f1f";
const LABEL_FONT = "600 13px system-ui, sans-serif";

const CAR_COLORS: Record<CarColor, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#dc2626",
};

// Metres-to-pixels scale for the convoy line. Fixed (not fit-to-canvas) so a
// car's on-screen size and spacing stay stable as the convoy plays out —
// only the camera pans, per drawConvoy's centroid recenter below.
const PIXELS_PER_METRE = 2.6;

// Draws a single straight line of cars, front (highest position) to the
// right, back (most negative position) to the left, camera-following the
// convoy's centroid so it never drifts off-canvas regardless of how long the
// leader has been free-running. Not unit-tested — canvas has no
// representation in this repo's Node/JSDOM test environment — so this is
// verified visually instead.
export function drawConvoy(
  ctx: CanvasRenderingContext2D,
  cars: readonly Car[],
  params: SimParams,
  labels: readonly ConvoyLabel[],
  size: CanvasSize,
): void {
  const { width, height } = size;
  ctx.clearRect(0, 0, width, height);
  if (cars.length === 0) return;

  const roadY = height / 2;
  const centroid = cars.reduce((sum, car) => sum + car.position, 0) / cars.length;
  const toScreenX = (position: number): number => width / 2 + (position - centroid) * PIXELS_PER_METRE;

  ctx.strokeStyle = ROAD_COLOR;
  ctx.lineWidth = ROAD_WIDTH_PX;
  ctx.beginPath();
  ctx.moveTo(0, roadY);
  ctx.lineTo(width, roadY);
  ctx.stroke();

  ctx.strokeStyle = LANE_MARK_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([10, 12]);
  ctx.beginPath();
  ctx.moveTo(0, roadY);
  ctx.lineTo(width, roadY);
  ctx.stroke();
  ctx.setLineDash([]);

  const carRadius = Math.max(3, (params.carLength / 2) * PIXELS_PER_METRE);

  for (const car of cars) {
    const x = toScreenX(car.position);
    ctx.fillStyle = CAR_COLORS[classifyCarColor(car.velocity, params.vMax)];
    ctx.beginPath();
    ctx.arc(x, roadY, carRadius, 0, Math.PI * 2);
    ctx.fill();

    // The leader (car 0, frontmost — nothing ahead of it) gets a ring so it
    // reads as "where the tap happens", distinct from the followers reacting
    // to it.
    if (car.id === 0) {
      ctx.strokeStyle = LEADER_OUTLINE_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, roadY, carRadius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.font = LABEL_FONT;
  ctx.fillStyle = LABEL_TEXT_COLOR;
  ctx.textAlign = "center";
  for (const label of labels) {
    const car = cars.find((candidate) => candidate.id === label.carId);
    if (!car) continue;
    const x = toScreenX(car.position);
    ctx.fillText(label.text, x, roadY - carRadius - 10);
  }
}
