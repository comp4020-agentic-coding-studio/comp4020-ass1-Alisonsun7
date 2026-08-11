import type { CanvasSize } from "./road-canvas";

export interface SparklineOptions {
  maxValue: number;
  lineColor?: string;
  fillColor?: string;
}

const DEFAULT_LINE_COLOR = "#0b5fff";
const DEFAULT_FILL_COLOR = "rgba(11, 95, 255, 0.15)";

// Draws the rolling average-speed history as a filled line chart, normalised
// against maxValue (vMax) so it always fills the available height. Not
// unit-tested for the same reason as road-canvas.ts — no canvas in this
// repo's test environment — so this is verified visually instead.
export function drawSparkline(
  ctx: CanvasRenderingContext2D,
  history: readonly number[],
  size: CanvasSize,
  opts: SparklineOptions,
): void {
  const { width, height } = size;
  ctx.clearRect(0, 0, width, height);

  if (history.length < 2) return;

  const lineColor = opts.lineColor ?? DEFAULT_LINE_COLOR;
  const fillColor = opts.fillColor ?? DEFAULT_FILL_COLOR;
  const max = opts.maxValue > 0 ? opts.maxValue : Math.max(...history, 1);

  const stepX = width / (history.length - 1);
  const toY = (value: number): number => {
    const clamped = Math.max(0, Math.min(value, max));
    return height - (clamped / max) * height;
  };

  ctx.beginPath();
  ctx.moveTo(0, toY(history[0]));
  for (let i = 1; i < history.length; i++) {
    ctx.lineTo(i * stepX, toY(history[i]));
  }
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, toY(history[0]));
  for (let i = 1; i < history.length; i++) {
    ctx.lineTo(i * stepX, toY(history[i]));
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.stroke();
}
