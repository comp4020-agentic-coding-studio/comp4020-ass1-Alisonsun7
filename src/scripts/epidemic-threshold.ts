import { must } from "./dom";

const CANVAS_W = 800;
const CANVAS_H = 500;
const N_PARTICLES = 180;
const PARTICLE_SPEED = 1.4;
const CONTACT_DISTANCE = 12;
const DRAW_RADIUS = 3.2;
const INFECTIOUS_DURATION_FRAMES = 240;
const SIM_SEED = 1;
const MEASURE_SEED = 9001;
const MEASURE_FRAMES = 1500;
const OUTBREAK_FRACTION = 0.15;
const CHART_WIDTH = 600;
const CHART_HEIGHT = 200;
const CHART_MAX_POINTS = 240;

type NodeState = "S" | "I" | "R";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: NodeState;
  infectedFor: number;
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

function spawnParticles(rng: () => number, width: number, height: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < N_PARTICLES; i += 1) {
    const angle = rng() * Math.PI * 2;
    particles.push({
      x: DRAW_RADIUS + rng() * (width - 2 * DRAW_RADIUS),
      y: DRAW_RADIUS + rng() * (height - 2 * DRAW_RADIUS),
      vx: Math.cos(angle) * PARTICLE_SPEED,
      vy: Math.sin(angle) * PARTICLE_SPEED,
      state: "S",
      infectedFor: 0,
    });
  }
  particles[0].state = "I";
  return particles;
}

function stepPhysics(particles: Particle[], width: number, height: number): void {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < DRAW_RADIUS || p.x > width - DRAW_RADIUS) p.vx *= -1;
    if (p.y < DRAW_RADIUS || p.y > height - DRAW_RADIUS) p.vy *= -1;
    p.x = Math.min(Math.max(p.x, DRAW_RADIUS), width - DRAW_RADIUS);
    p.y = Math.min(Math.max(p.y, DRAW_RADIUS), height - DRAW_RADIUS);
  }
}

// Empirically measures how many other particles one particle encounters per
// frame at a given world size — the particle-sim analogue of the old
// network model's "average degree". Used to calibrate infection probability
// so the contact-rate slider keeps the same meaning: expected secondary
// infections per infectious particle, assuming everyone it meets is
// susceptible.
function measureAvgEncounters(width: number, height: number): number {
  const rng = mulberry32(MEASURE_SEED);
  const particles = spawnParticles(rng, width, height);
  let total = 0;
  for (let f = 0; f < MEASURE_FRAMES; f += 1) {
    stepPhysics(particles, width, height);
    const reference = particles[0];
    for (let i = 1; i < particles.length; i += 1) {
      const dx = particles[i].x - reference.x;
      const dy = particles[i].y - reference.y;
      if (Math.sqrt(dx * dx + dy * dy) < CONTACT_DISTANCE) total += 1;
    }
  }
  return total / MEASURE_FRAMES;
}

const DENSITY_LABELS: Array<[number, string]> = [
  [70, "Very crowded"],
  [90, "Crowded"],
  [110, "Typical spacing"],
  [140, "Spread out"],
  [Infinity, "Very spread out"],
];

function densityLabel(sliderValue: number): string {
  for (const [max, label] of DENSITY_LABELS) {
    if (sliderValue <= max) return label;
  }
  return "Spread out";
}

interface HistoryPoint {
  s: number;
  i: number;
  r: number;
}

export function initEpidemicThreshold(): void {
  const contactSlider = must(document.getElementById("contact-slider") as HTMLInputElement | null);
  const contactOutput = must(document.getElementById("contact-output"));
  const densitySlider = must(document.getElementById("density-slider") as HTMLInputElement | null);
  const densityOutput = must(document.getElementById("density-output"));
  const pauseButton = must(document.getElementById("pause-btn") as HTMLButtonElement | null);
  const resetButton = must(document.getElementById("reset-btn") as HTMLButtonElement | null);
  const canvas = must(document.getElementById("sim-canvas") as HTMLCanvasElement | null);
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) throw new Error("expected 2d canvas context");
  const ctx: CanvasRenderingContext2D = maybeCtx;
  const statS = must(document.getElementById("stat-s"));
  const statI = must(document.getElementById("stat-i"));
  const statR = must(document.getElementById("stat-r"));
  const areaS = must(document.querySelector<SVGPolygonElement>("#chart-area-s"));
  const areaI = must(document.querySelector<SVGPolygonElement>("#chart-area-i"));
  const areaR = must(document.querySelector<SVGPolygonElement>("#chart-area-r"));
  const tickStatus = must(document.getElementById("tick-status"));
  const outcomeReadout = must(document.getElementById("outcome-readout"));
  const presetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-rate]"));

  let worldWidth = CANVAS_W;
  let worldHeight = CANVAS_H;
  let avgEncounters = measureAvgEncounters(worldWidth, worldHeight);
  let particles: Particle[] = [];
  let history: HistoryPoint[] = [];
  let contactRate = Number(contactSlider.value);
  let infectProbability = 0;
  let paused = false;
  let rafHandle: number | undefined;
  let ended = false;

  function drawScale(): number {
    return CANVAS_W / worldWidth;
  }

  function computeInfectProbability(): number {
    return contactRate / (avgEncounters * INFECTIOUS_DURATION_FRAMES);
  }

  function resetSim(): void {
    const rng = mulberry32(SIM_SEED);
    particles = spawnParticles(rng, worldWidth, worldHeight);
    history = [];
    infectProbability = computeInfectProbability();
    paused = false;
    ended = false;
    pauseButton.textContent = "Pause";
    outcomeReadout.textContent = "";
    drawFrame();
    updateStats();
  }

  function drawFrame(): void {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    const scale = drawScale();
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x * scale, p.y * scale, DRAW_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = p.state === "S" ? "#9ca3af" : p.state === "I" ? "#dc2626" : "#2563eb";
      ctx.fill();
    }
  }

  function updateStats(): void {
    const sCount = particles.filter((p) => p.state === "S").length;
    const iCount = particles.filter((p) => p.state === "I").length;
    const rCount = particles.filter((p) => p.state === "R").length;
    statS.textContent = `${((sCount / N_PARTICLES) * 100).toFixed(1)}%`;
    statI.textContent = `${((iCount / N_PARTICLES) * 100).toFixed(1)}%`;
    statR.textContent = `${((rCount / N_PARTICLES) * 100).toFixed(1)}%`;
    tickStatus.textContent = `Currently infected: ${iCount} of ${N_PARTICLES}`;
    redrawChart();
  }

  function redrawChart(): void {
    const points = history.slice(-CHART_MAX_POINTS);
    const n = points.length;
    if (n < 2) return;
    const stepX = CHART_WIDTH / (CHART_MAX_POINTS - 1);
    const startIndex = CHART_MAX_POINTS - n;

    const sTop: string[] = [];
    const iTop: string[] = [];
    const rTop: string[] = [];
    points.forEach((point, index) => {
      const x = (startIndex + index) * stepX;
      const sFrac = point.s / N_PARTICLES;
      const iFrac = point.i / N_PARTICLES;
      sTop.push(`${x.toFixed(1)},${(CHART_HEIGHT * (1 - sFrac)).toFixed(1)}`);
      iTop.push(`${x.toFixed(1)},${(CHART_HEIGHT * (1 - sFrac - iFrac)).toFixed(1)}`);
      rTop.push(`${x.toFixed(1)},${0}`);
    });
    const firstX = startIndex * stepX;
    const lastX = (startIndex + n - 1) * stepX;

    areaS.setAttribute(
      "points",
      `${firstX.toFixed(1)},${CHART_HEIGHT} ${sTop.join(" ")} ${lastX.toFixed(1)},${CHART_HEIGHT}`,
    );
    areaI.setAttribute("points", `${sTop.join(" ")} ${[...iTop].reverse().join(" ")}`);
    areaR.setAttribute("points", `${iTop.join(" ")} ${[...rTop].reverse().join(" ")}`);
  }

  function tick(): void {
    if (!paused && !ended) {
      stepPhysics(particles, worldWidth, worldHeight);

      const infected = particles.filter((p) => p.state === "I");
      const newlyInfected: Particle[] = [];
      for (const infectedParticle of infected) {
        for (const other of particles) {
          if (other.state !== "S") continue;
          const dx = infectedParticle.x - other.x;
          const dy = infectedParticle.y - other.y;
          if (Math.sqrt(dx * dx + dy * dy) < CONTACT_DISTANCE && Math.random() < infectProbability) {
            newlyInfected.push(other);
          }
        }
      }
      for (const infectedParticle of infected) {
        infectedParticle.infectedFor += 1;
        if (infectedParticle.infectedFor >= INFECTIOUS_DURATION_FRAMES) infectedParticle.state = "R";
      }
      for (const p of newlyInfected) {
        if (p.state === "S") p.state = "I";
      }

      const sCount = particles.filter((p) => p.state === "S").length;
      const iCount = particles.filter((p) => p.state === "I").length;
      const rCount = particles.filter((p) => p.state === "R").length;
      history.push({ s: sCount, i: iCount, r: rCount });

      if (iCount === 0) {
        ended = true;
        const everInfected = rCount;
        outcomeReadout.textContent =
          everInfected >= N_PARTICLES * OUTBREAK_FRACTION
            ? `Full-blown outbreak — ${everInfected} of ${N_PARTICLES} people caught it before it burned out.`
            : `Fizzled out — only ${everInfected} of ${N_PARTICLES} people ever got sick.`;
      }

      drawFrame();
      updateStats();
    }
    rafHandle = requestAnimationFrame(tick);
  }

  function setContactRate(value: number): void {
    contactSlider.value = String(value);
    contactOutput.textContent = value.toFixed(1);
    contactRate = value;
    resetSim();
  }

  function rebuildDensity(): void {
    const sliderValue = Number(densitySlider.value);
    worldWidth = CANVAS_W * (sliderValue / 100);
    worldHeight = CANVAS_H * (sliderValue / 100);
    avgEncounters = measureAvgEncounters(worldWidth, worldHeight);
    densityOutput.textContent = densityLabel(sliderValue);
    resetSim();
  }

  contactSlider.addEventListener("input", () => setContactRate(Number(contactSlider.value)));
  densitySlider.addEventListener("input", rebuildDensity);
  for (const button of presetButtons) {
    button.addEventListener("click", () => setContactRate(Number(button.dataset.rate)));
  }
  pauseButton.addEventListener("click", () => {
    if (ended) return;
    paused = !paused;
    pauseButton.textContent = paused ? "Resume" : "Pause";
  });
  resetButton.addEventListener("click", resetSim);

  contactOutput.textContent = contactRate.toFixed(1);
  densityOutput.textContent = densityLabel(Number(densitySlider.value));
  resetSim();
  rafHandle = requestAnimationFrame(tick);
  window.addEventListener("beforeunload", () => {
    if (rafHandle !== undefined) cancelAnimationFrame(rafHandle);
  });
}
