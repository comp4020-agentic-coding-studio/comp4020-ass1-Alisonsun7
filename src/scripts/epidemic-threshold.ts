import { must } from "./dom";

const NODE_COUNT = 120;
const WIDTH = 600;
const HEIGHT = 400;
const MARGIN = 25;
const DEFAULT_RADIUS = 60;
const INFECTIOUS_DURATION = 4;
const MAX_TICKS = 40;
const LAYOUT_SEED = 1234;
const SIM_SEED = 1;
const STEP_MS = 180;
const OUTBREAK_THRESHOLD = 15;
const CHART_WIDTH = 600;
const CHART_HEIGHT = 200;

type NodeState = "S" | "I" | "R";

interface Point {
  x: number;
  y: number;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function random(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildLayout(seed: number): Point[] {
  const rng = mulberry32(seed);
  const points: Point[] = [];
  for (let i = 0; i < NODE_COUNT; i += 1) {
    points.push({
      x: MARGIN + rng() * (WIDTH - 2 * MARGIN),
      y: MARGIN + rng() * (HEIGHT - 2 * MARGIN),
    });
  }
  return points;
}

function buildAdjacency(positions: Point[], radius: number): number[][] {
  const adjacency: number[][] = Array.from({ length: NODE_COUNT }, () => []);
  for (let i = 0; i < NODE_COUNT; i += 1) {
    for (let j = i + 1; j < NODE_COUNT; j += 1) {
      const dx = positions[i].x - positions[j].x;
      const dy = positions[i].y - positions[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < radius) {
        adjacency[i].push(j);
        adjacency[j].push(i);
      }
    }
  }
  return adjacency;
}

function computeAvgDegree(adjacency: number[][]): number {
  return adjacency.reduce((sum, edges) => sum + edges.length, 0) / NODE_COUNT;
}

interface ComponentInfo {
  count: number;
  giant: number;
}

function countComponents(adjacency: number[][]): ComponentInfo {
  const seen = Array.from({ length: NODE_COUNT }, () => false);
  let count = 0;
  let giant = 0;
  for (let start = 0; start < NODE_COUNT; start += 1) {
    if (seen[start]) continue;
    count += 1;
    let size = 0;
    const stack = [start];
    seen[start] = true;
    while (stack.length > 0) {
      const node = stack.pop() as number;
      size += 1;
      for (const neighbour of adjacency[node]) {
        if (!seen[neighbour]) {
          seen[neighbour] = true;
          stack.push(neighbour);
        }
      }
    }
    if (size > giant) giant = size;
  }
  return { count, giant };
}

const positions = buildLayout(LAYOUT_SEED);
const initialAdjacency = buildAdjacency(positions, DEFAULT_RADIUS);
const initialAvgDegree = computeAvgDegree(initialAdjacency);
const patientZero = initialAdjacency.reduce(
  (best, edges, index) =>
    Math.abs(edges.length - initialAvgDegree) < Math.abs(initialAdjacency[best].length - initialAvgDegree)
      ? index
      : best,
  0,
);

let adjacency = initialAdjacency;
let avgDegree = initialAvgDegree;
let componentInfo = countComponents(adjacency);

interface SimResult {
  frames: NodeState[][];
  infectedCounts: number[];
  totalEverInfected: number;
}

function simulate(contactRate: number): SimResult {
  const rng = mulberry32(SIM_SEED);
  const p = contactRate / (avgDegree * INFECTIOUS_DURATION);

  const state: NodeState[] = Array.from({ length: NODE_COUNT }, () => "S");
  const infectedFor = Array.from({ length: NODE_COUNT }, () => 0);
  state[patientZero] = "I";

  const frames: NodeState[][] = [[...state]];
  const infectedCounts = [1];

  for (let tick = 1; tick <= MAX_TICKS; tick += 1) {
    const infectedCount = state.filter((s) => s === "I").length;
    if (infectedCount === 0) break;

    const newlyInfected: number[] = [];
    for (let i = 0; i < NODE_COUNT; i += 1) {
      if (state[i] !== "I") continue;
      for (const neighbour of adjacency[i]) {
        if (state[neighbour] === "S" && rng() < p) {
          newlyInfected.push(neighbour);
        }
      }
    }

    for (let i = 0; i < NODE_COUNT; i += 1) {
      if (state[i] === "I") {
        infectedFor[i] += 1;
        if (infectedFor[i] >= INFECTIOUS_DURATION) state[i] = "R";
      }
    }
    for (const node of newlyInfected) {
      if (state[node] === "S") state[node] = "I";
    }

    frames.push([...state]);
    infectedCounts.push(state.filter((s) => s === "I").length);
  }

  const totalEverInfected = state.filter((s) => s === "I" || s === "R").length;
  return { frames, infectedCounts, totalEverInfected };
}

export function initEpidemicThreshold(): void {
  const contactSlider = must(document.getElementById("contact-slider") as HTMLInputElement | null);
  const contactOutput = must(document.getElementById("contact-output"));
  const densitySlider = must(document.getElementById("density-slider") as HTMLInputElement | null);
  const densityOutput = must(document.getElementById("density-output"));
  const nodesGroup = must(document.querySelector<SVGGElement>("#network-nodes"));
  const edgesGroup = must(document.querySelector<SVGGElement>("#network-edges"));
  const infectedLine = must(document.querySelector<SVGPolylineElement>("#infected-line"));
  const tickStatus = must(document.getElementById("tick-status"));
  const outcomeReadout = must(document.getElementById("outcome-readout"));
  const presetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-rate]"));

  const nodeCircles: SVGCircleElement[] = positions.map((point) => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", point.x.toFixed(1));
    circle.setAttribute("cy", point.y.toFixed(1));
    circle.setAttribute("r", "4.5");
    circle.setAttribute("class", "node node-s");
    nodesGroup.appendChild(circle);
    return circle;
  });

  function renderEdges(): void {
    edgesGroup.replaceChildren();
    for (const [i, edges] of adjacency.entries()) {
      for (const j of edges) {
        if (j <= i) continue;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", positions[i].x.toFixed(1));
        line.setAttribute("y1", positions[i].y.toFixed(1));
        line.setAttribute("x2", positions[j].x.toFixed(1));
        line.setAttribute("y2", positions[j].y.toFixed(1));
        line.setAttribute("class", "edge");
        edgesGroup.appendChild(line);
      }
    }
  }

  let animationTimer: ReturnType<typeof setInterval> | undefined;

  function renderFrame(sim: SimResult, tick: number): void {
    const state = sim.frames[tick];
    state.forEach((s, i) => {
      nodeCircles[i].setAttribute("class", `node node-${s.toLowerCase()}`);
    });

    const points = sim.infectedCounts
      .slice(0, tick + 1)
      .map((count, index) => {
        const x = (index / (sim.frames.length - 1)) * CHART_WIDTH;
        const y = CHART_HEIGHT - (count / NODE_COUNT) * CHART_HEIGHT;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    infectedLine.setAttribute("points", points);

    tickStatus.textContent = `Tick ${tick} of ${sim.frames.length - 1} — currently infected: ${sim.infectedCounts[tick]}`;
  }

  function runAnimation(contactRate: number): void {
    if (animationTimer !== undefined) {
      clearInterval(animationTimer);
      animationTimer = undefined;
    }

    const sim = simulate(contactRate);
    outcomeReadout.textContent = "";

    let tick = 0;
    renderFrame(sim, tick);
    animationTimer = setInterval(() => {
      tick += 1;
      renderFrame(sim, tick);
      if (tick >= sim.frames.length - 1) {
        if (animationTimer !== undefined) {
          clearInterval(animationTimer);
          animationTimer = undefined;
        }
        const reachabilityNote =
          componentInfo.giant < NODE_COUNT
            ? ` At this network density, only ${componentInfo.giant} of ${NODE_COUNT} people are even reachable from patient zero.`
            : "";
        outcomeReadout.textContent =
          (sim.totalEverInfected >= OUTBREAK_THRESHOLD
            ? `Full-blown outbreak — ${sim.totalEverInfected} of ${NODE_COUNT} people caught it before it burned out.`
            : `Fizzled out — only ${sim.totalEverInfected} of ${NODE_COUNT} people ever got sick.`) + reachabilityNote;
      }
    }, STEP_MS);
  }

  function setContactRate(value: number): void {
    contactSlider.value = String(value);
    contactOutput.textContent = value.toFixed(1);
    runAnimation(value);
  }

  function onContactSliderInput(): void {
    setContactRate(Number(contactSlider.value));
  }

  function onDensitySliderInput(): void {
    const radius = Number(densitySlider.value);
    adjacency = buildAdjacency(positions, radius);
    avgDegree = computeAvgDegree(adjacency);
    componentInfo = countComponents(adjacency);
    densityOutput.textContent = `≈${avgDegree.toFixed(1)} contacts each`;
    renderEdges();
    runAnimation(Number(contactSlider.value));
  }

  contactSlider.addEventListener("input", onContactSliderInput);
  densitySlider.addEventListener("input", onDensitySliderInput);
  for (const button of presetButtons) {
    button.addEventListener("click", () => {
      setContactRate(Number(button.dataset.rate));
    });
  }

  renderEdges();
  contactOutput.textContent = Number(contactSlider.value).toFixed(1);
  densityOutput.textContent = `≈${avgDegree.toFixed(1)} contacts each`;
  runAnimation(Number(contactSlider.value));
}
