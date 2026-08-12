import { must } from "./dom";

const MONTHLY_CONTRIBUTION = 400;
const ANNUAL_RATE = 0.07;
const MONTHLY_RATE = (1 + ANNUAL_RATE) ** (1 / 12) - 1;
const DELAY_YEARS = 10;
const MAX_YEARS = 35;
const CHART_WIDTH = 600;
const CHART_HEIGHT = 200;

const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

function futureValue(months: number): number {
  if (months <= 0) return 0;
  return MONTHLY_CONTRIBUTION * (((1 + MONTHLY_RATE) ** months - 1) / MONTHLY_RATE);
}

function contributed(months: number): number {
  return MONTHLY_CONTRIBUTION * Math.max(0, months);
}

function alexValueAt(years: number): number {
  return futureValue(years * 12);
}

function jordanValueAt(years: number): number {
  return futureValue(Math.max(0, years - DELAY_YEARS) * 12);
}

export function initCompoundInterest(): void {
  const slider = must(document.getElementById("years-slider") as HTMLInputElement | null);
  const yearsOutput = must(document.getElementById("years-output"));
  const alexValueEl = must(document.getElementById("alex-value"));
  const jordanValueEl = must(document.getElementById("jordan-value"));
  const alexBar = must(document.getElementById("alex-bar"));
  const jordanBar = must(document.getElementById("jordan-bar"));
  const alexLine = must(document.querySelector<SVGPolylineElement>("#alex-line"));
  const jordanLine = must(document.querySelector<SVGPolylineElement>("#jordan-line"));
  const yearMarker = must(document.querySelector<SVGLineElement>("#year-marker"));
  const gapReadout = must(document.getElementById("gap-readout"));

  const maxValue = alexValueAt(MAX_YEARS);

  function seriesPoints(valueAt: (years: number) => number): string {
    const points: string[] = [];
    for (let year = 0; year <= MAX_YEARS; year += 1) {
      const x = (year / MAX_YEARS) * CHART_WIDTH;
      const y = CHART_HEIGHT - (valueAt(year) / maxValue) * CHART_HEIGHT;
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return points.join(" ");
  }

  alexLine.setAttribute("points", seriesPoints(alexValueAt));
  jordanLine.setAttribute("points", seriesPoints(jordanValueAt));

  function render(): void {
    const years = Number(slider.value);
    yearsOutput.textContent = String(years);

    const alexValue = alexValueAt(years);
    const jordanValue = jordanValueAt(years);
    const alexContributed = contributed(years * 12);
    const jordanContributed = contributed((years - DELAY_YEARS) * 12);

    alexValueEl.textContent = currency.format(alexValue);
    jordanValueEl.textContent = currency.format(jordanValue);

    alexBar.style.height = `${Math.min(100, (alexValue / maxValue) * 100)}%`;
    jordanBar.style.height = `${Math.min(100, (jordanValue / maxValue) * 100)}%`;

    const markerX = (years / MAX_YEARS) * CHART_WIDTH;
    yearMarker.setAttribute("x1", markerX.toFixed(1));
    yearMarker.setAttribute("x2", markerX.toFixed(1));

    if (years < DELAY_YEARS) {
      gapReadout.textContent = `Jordan hasn't started yet. Alex already has ${currency.format(alexValue)} after ${years} year${
        years === 1 ? "" : "s"
      } of investing.`;
    } else {
      const gap = alexValue - jordanValue;
      const contributionGap = alexContributed - jordanContributed;
      gapReadout.textContent = `By year ${years}, Alex has contributed ${currency.format(
        alexContributed,
      )} and grown it to ${currency.format(alexValue)}. Jordan has contributed ${currency.format(
        jordanContributed,
      )} and grown it to ${currency.format(jordanValue)} — a gap of ${currency.format(
        gap,
      )}, even though Alex only put in ${currency.format(contributionGap)} more.`;
    }
  }

  slider.addEventListener("input", render);
  render();
}
