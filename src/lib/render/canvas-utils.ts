// Backs a canvas's pixel buffer with its real device resolution while
// keeping drawing code in CSS-pixel units — otherwise canvases look blurry
// on high-DPI screens and wrong-sized after any layout change.
export function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
