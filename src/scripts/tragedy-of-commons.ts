import { must } from "./dom";

const TOTAL_FISHERS = 100;
const CAPACITY = 1000;
const REGROWTH_RATE = 0.3;
const SUSTAINABLE_CATCH_PER_FISHER = 0.6;
const DEFECTOR_CATCH_PER_FISHER = 2;
const ROUNDS = 20;
const POND_DOTS = 25;
const STEP_MS = 140;
const COLLAPSE_THRESHOLD = 5;
const CHART_WIDTH = 600;
const CHART_HEIGHT = 200;

function simulate(pctCooperators: number): number[] {
  const cooperators = Math.round((pctCooperators / 100) * TOTAL_FISHERS);
  const defectors = TOTAL_FISHERS - cooperators;
  const totalCatch =
    cooperators * SUSTAINABLE_CATCH_PER_FISHER + defectors * DEFECTOR_CATCH_PER_FISHER;

  const series = [CAPACITY];
  let stock = CAPACITY;
  for (let round = 1; round <= ROUNDS; round += 1) {
    const growth = REGROWTH_RATE * stock * (1 - stock / CAPACITY);
    stock = Math.max(0, stock + growth - totalCatch);
    series.push(stock);
  }
  return series;
}

function findCollapseRound(series: number[]): number | null {
  for (let round = 0; round < series.length; round += 1) {
    if (series[round] <= COLLAPSE_THRESHOLD) {
      return round;
    }
  }
  return null;
}

export function initTragedyOfCommons(): void {
  const slider = must(document.getElementById("coop-slider") as HTMLInputElement | null);
  const coopOutput = must(document.getElementById("coop-output"));
  const breakdown = must(document.getElementById("fisher-breakdown"));
  const pond = must(document.getElementById("pond"));
  const stockLine = must(document.querySelector<SVGPolylineElement>("#stock-line"));
  const roundMarker = must(document.querySelector<SVGLineElement>("#round-marker"));
  const roundStatus = must(document.getElementById("round-status"));
  const outcomeReadout = must(document.getElementById("outcome-readout"));

  for (let i = 0; i < POND_DOTS; i += 1) {
    const dot = document.createElement("span");
    dot.className = "pond-dot";
    dot.textContent = "🐟";
    pond.appendChild(dot);
  }
  const dots = Array.from(pond.children) as HTMLElement[];

  let animationTimer: ReturnType<typeof setInterval> | undefined;

  function renderRound(series: number[], round: number): void {
    const stock = series[round];
    const fraction = stock / CAPACITY;
    const visibleDots = Math.round(fraction * POND_DOTS);
    dots.forEach((dot, index) => {
      dot.style.opacity = index < visibleDots ? "1" : "0.12";
    });

    const markerX = (round / ROUNDS) * CHART_WIDTH;
    roundMarker.setAttribute("x1", markerX.toFixed(1));
    roundMarker.setAttribute("x2", markerX.toFixed(1));

    roundStatus.textContent = `Round ${round} of ${ROUNDS} — stock: ${Math.round(stock)} / ${CAPACITY}`;
  }

  function runAnimation(pct: number): void {
    if (animationTimer !== undefined) {
      clearInterval(animationTimer);
      animationTimer = undefined;
    }

    const series = simulate(pct);
    const points = series
      .map((stock, round) => {
        const x = (round / ROUNDS) * CHART_WIDTH;
        const y = CHART_HEIGHT - (stock / CAPACITY) * CHART_HEIGHT;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    stockLine.setAttribute("points", points);

    const collapseRound = findCollapseRound(series);
    outcomeReadout.textContent = "";

    let round = 0;
    renderRound(series, round);
    animationTimer = setInterval(() => {
      round += 1;
      renderRound(series, round);
      if (round >= ROUNDS) {
        if (animationTimer !== undefined) {
          clearInterval(animationTimer);
          animationTimer = undefined;
        }
        outcomeReadout.textContent =
          collapseRound === null
            ? `The pond holds steady at around ${Math.round(series[ROUNDS])} fish — the catch stays below what the pond can regrow.`
            : `The pond collapses by round ${collapseRound} — once the stock is gone, nobody can fish it, cooperators included.`;
      }
    }, STEP_MS);
  }

  function onSliderChange(): void {
    const pct = Number(slider.value);
    coopOutput.textContent = `${pct}%`;

    const cooperators = Math.round((pct / 100) * TOTAL_FISHERS);
    const defectors = TOTAL_FISHERS - cooperators;
    breakdown.textContent = `${cooperators} of ${TOTAL_FISHERS} fishers take a sustainable share; ${defectors} take more than their share.`;

    runAnimation(pct);
  }

  slider.addEventListener("input", onSliderChange);
  onSliderChange();
}
