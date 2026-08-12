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

// Margin (metres) left empty on each side of the convoy so cars at the very
// front/back don't render flush against the canvas edge.
const CAMERA_PADDING_METRES = 15;

// A floor on the metres considered "on screen", so a near-empty or
// single-car convoy doesn't zoom in absurdly far.
const MIN_VISIBLE_SPAN_METRES = 40;

// A floor on car marker radius, in pixels. The convoy's realistic cruising
// gap (tens of metres, so the leader settles near vMax before any tap) means
// fitting the whole convoy into view yields only ~1-1.5 px/metre — drawing
// cars at their true physical size at that scale renders them as
// near-invisible 5-6px dots, which hides exactly the colour change the demo
// is trying to show. The gap between cars is wide enough at that scale
// (tens of pixels) that a larger fixed floor doesn't risk overlap.
const MIN_CAR_RADIUS_PX = 8;

// Horizontal margin (pixels) kept clear at each canvas edge for label text,
// separate from CAMERA_PADDING_METRES (which reserves space for the car
// marker itself). The frontmost car — typically the leader, where the brake
// tap happens — sits close to the right edge under the fit-to-span camera,
// so a centred label above it would otherwise render half off-canvas.
const LABEL_EDGE_MARGIN_PX = 4;

// Draws a single straight line of cars, front (highest position) to the
// right, back (most negative position) to the left. The camera fits the
// whole convoy — from its current backmost car to its current frontmost car
// — into the canvas width every frame, rather than holding a fixed
// metres-to-pixels scale centred on the centroid: the cruising gap between
// cars is deliberately large (tens of metres, so the optimal-velocity curve
// settles near vMax), which made a fixed scale zoom in far enough that the
// leader — where the brake tap happens — and the followers reacting to it
// rendered well outside the canvas while only unaffected middle-of-the-pack
// cars were ever visible. Fitting the full convoy keeps the tap and the
// backward-propagating wave in view for the whole demo. Not unit-tested —
// canvas has no representation in this repo's Node/JSDOM test environment —
// so this is verified visually instead.
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
  const positions = cars.map((car) => car.position);
  const minPosition = Math.min(...positions);
  const maxPosition = Math.max(...positions);
  const spanMetres = Math.max(maxPosition - minPosition, MIN_VISIBLE_SPAN_METRES) + CAMERA_PADDING_METRES * 2;
  const pixelsPerMetre = width / spanMetres;
  const toScreenX = (position: number): number =>
    (position - minPosition + CAMERA_PADDING_METRES) * pixelsPerMetre;

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

  const carRadius = Math.max(MIN_CAR_RADIUS_PX, (params.carLength / 2) * pixelsPerMetre);

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
    const carX = toScreenX(car.position);
    const halfTextWidth = ctx.measureText(label.text).width / 2;
    const x = Math.min(
      Math.max(carX, LABEL_EDGE_MARGIN_PX + halfTextWidth),
      width - LABEL_EDGE_MARGIN_PX - halfTextWidth,
    );
    ctx.fillText(label.text, x, roadY - carRadius - 10);
  }
}
