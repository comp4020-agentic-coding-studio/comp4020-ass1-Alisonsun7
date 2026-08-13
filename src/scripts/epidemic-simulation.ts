import { must } from "./dom";

type Mode = "simple" | "central" | "communities";
type State = "S" | "I" | "R";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: State;
  infectedAtFrame: number;
  home: { x: number; y: number };
  community: number;
  target: { x: number; y: number } | null;
}

const WIDTH = 640;
const HEIGHT = 420;
const PARTICLE_COUNT = 150;
const PARTICLE_RADIUS = 4;
const BASE_SPEED = 1.2;
const INFECTION_RADIUS = 11;
const BASE_INFECT_CHANCE = 0.015;
const RECOVERY_FRAMES = 260;
const COMMUNITY_COLUMNS = 2;
const COMMUNITY_ROWS = 2;
const COMMUNITY_COUNT = COMMUNITY_COLUMNS * COMMUNITY_ROWS;
const COMMUNITY_TRAVEL_CHANCE = 0.001;
const CENTRAL_TRIP_CHANCE = 0.01;
const CHART_SAMPLE_EVERY = 6;
const CHART_MAX_POINTS = 140;
const SIM_SEED = 913_517_243;

function mulberry32(seed: number): () => number {
  let state = seed;
  return function rng(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function densityBox(density: number): { x0: number; y0: number; x1: number; y1: number } {
  const scale = 0.45 + (10 - density) * 0.055;
  const w = WIDTH * scale;
  const h = HEIGHT * scale;
  return {
    x0: (WIDTH - w) / 2,
    y0: (HEIGHT - h) / 2,
    x1: (WIDTH + w) / 2,
    y1: (HEIGHT + h) / 2,
  };
}

function communityBox(index: number): { x0: number; y0: number; x1: number; y1: number } {
  const col = index % COMMUNITY_COLUMNS;
  const row = Math.floor(index / COMMUNITY_COLUMNS);
  const cellW = WIDTH / COMMUNITY_COLUMNS;
  const cellH = HEIGHT / COMMUNITY_ROWS;
  const pad = 14;
  return {
    x0: col * cellW + pad,
    y0: row * cellH + pad,
    x1: (col + 1) * cellW - pad,
    y1: (row + 1) * cellH - pad,
  };
}

function bounceWithinBox(
  p: Particle,
  box: { x0: number; y0: number; x1: number; y1: number },
): void {
  if (p.x < box.x0) {
    p.x = box.x0;
    p.vx = Math.abs(p.vx);
  } else if (p.x > box.x1) {
    p.x = box.x1;
    p.vx = -Math.abs(p.vx);
  }
  if (p.y < box.y0) {
    p.y = box.y0;
    p.vy = Math.abs(p.vy);
  } else if (p.y > box.y1) {
    p.y = box.y1;
    p.vy = -Math.abs(p.vy);
  }
}

function randomVelocity(rng: () => number): { vx: number; vy: number } {
  const angle = rng() * Math.PI * 2;
  return { vx: Math.cos(angle) * BASE_SPEED, vy: Math.sin(angle) * BASE_SPEED };
}

function createParticles(mode: Mode, density: number, rng: () => number): Particle[] {
  const particles: Particle[] = [];
  const box = mode === "simple" ? densityBox(density) : null;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const community = i % COMMUNITY_COUNT;
    const spawnBox = mode === "communities" ? communityBox(community) : (box ?? { x0: 0, y0: 0, x1: WIDTH, y1: HEIGHT });
    const x = spawnBox.x0 + rng() * (spawnBox.x1 - spawnBox.x0);
    const y = spawnBox.y0 + rng() * (spawnBox.y1 - spawnBox.y0);
    const { vx, vy } = randomVelocity(rng);
    particles.push({
      x,
      y,
      vx,
      vy,
      state: "S",
      infectedAtFrame: -1,
      home: { x, y },
      community,
      target: null,
    });
  }
  const patientZero = particles[0];
  if (!patientZero) throw new Error("expected at least one particle");
  patientZero.state = "I";
  patientZero.infectedAtFrame = 0;
  return particles;
}

function distanceBelow(ax: number, ay: number, bx: number, by: number, limit: number): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy < limit * limit;
}

interface StepOptions {
  mode: Mode;
  density: number;
  quarantine: boolean;
  frame: number;
  rng: () => number;
}

function stepParticle(p: Particle, opts: StepOptions): void {
  if (p.state === "I" && opts.quarantine) return;

  if (opts.mode === "central") {
    const center = { x: WIDTH / 2, y: HEIGHT / 2 };
    if (!p.target || distanceBelow(p.x, p.y, p.target.x, p.target.y, 6)) {
      p.target = opts.rng() < CENTRAL_TRIP_CHANCE ? center : p.home;
    }
    const dx = p.target.x - p.x;
    const dy = p.target.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    p.vx = (dx / len) * BASE_SPEED;
    p.vy = (dy / len) * BASE_SPEED;
    p.x += p.vx;
    p.y += p.vy;
    return;
  }

  if (opts.mode === "communities") {
    if (opts.rng() < COMMUNITY_TRAVEL_CHANCE) {
      p.community = Math.floor(opts.rng() * COMMUNITY_COUNT);
    }
    if (opts.rng() < 0.02) {
      const { vx, vy } = randomVelocity(opts.rng);
      p.vx = vx;
      p.vy = vy;
    }
    p.x += p.vx;
    p.y += p.vy;
    bounceWithinBox(p, communityBox(p.community));
    return;
  }

  if (opts.rng() < 0.02) {
    const { vx, vy } = randomVelocity(opts.rng);
    p.vx = vx;
    p.vy = vy;
  }
  p.x += p.vx;
  p.y += p.vy;
  bounceWithinBox(p, densityBox(opts.density));
}

function updateInfections(particles: Particle[], contactRate: number, frame: number, rng: () => number): void {
  for (const p of particles) {
    if (p.state !== "I") continue;
    if (frame - p.infectedAtFrame > RECOVERY_FRAMES) {
      p.state = "R";
      continue;
    }
    for (const other of particles) {
      if (other.state !== "S") continue;
      if (!distanceBelow(p.x, p.y, other.x, other.y, INFECTION_RADIUS)) continue;
      if (rng() < BASE_INFECT_CHANCE * contactRate) {
        other.state = "I";
        other.infectedAtFrame = frame;
      }
    }
  }
}

function draw(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, PARTICLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = p.state === "S" ? "#c8ccd6" : p.state === "I" ? "#e0455f" : "#4d8dff";
    ctx.fill();
  }
}

interface Counts {
  s: number;
  i: number;
  r: number;
}

function countStates(particles: Particle[]): Counts {
  let s = 0;
  let i = 0;
  let r = 0;
  for (const p of particles) {
    if (p.state === "S") s++;
    else if (p.state === "I") i++;
    else r++;
  }
  return { s, i, r };
}

function renderChart(svg: SVGSVGElement, history: Counts[]): void {
  const bandS = must(svg.querySelector<SVGPolygonElement>("#rec-band-s"));
  const bandI = must(svg.querySelector<SVGPolygonElement>("#rec-band-i"));
  const bandR = must(svg.querySelector<SVGPolygonElement>("#rec-band-r"));
  if (history.length < 2) return;

  const w = 300;
  const h = 120;
  const stepX = w / (CHART_MAX_POINTS - 1);
  const startX = w - (history.length - 1) * stepX;

  const rTop: string[] = [];
  const iTop: string[] = [];
  const sTop: string[] = [];
  history.forEach((point, idx) => {
    const total = point.s + point.i + point.r;
    const x = startX + idx * stepX;
    const rFrac = point.r / total;
    const iFrac = point.i / total;
    const rY = h - rFrac * h;
    const iY = rY - iFrac * h;
    rTop.push(`${x},${rY}`);
    iTop.push(`${x},${iY}`);
    sTop.push(`${x},0`);
  });

  const baseline = `${startX},${h} ${w},${h}`;
  bandR.setAttribute("points", `${baseline} ${[...rTop].reverse().join(" ")}`);
  bandI.setAttribute("points", `${rTop.join(" ")} ${[...iTop].reverse().join(" ")}`);
  bandS.setAttribute("points", `${iTop.join(" ")} ${[...sTop].reverse().join(" ")}`);
}

export function initEpidemicSimulation(): void {
  const canvas = must(document.querySelector<HTMLCanvasElement>("#rec-canvas"));
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) throw new Error("expected 2d canvas context");
  const ctx: CanvasRenderingContext2D = maybeCtx;
  const chart = must(document.querySelector<SVGSVGElement>("#rec-chart"));
  const densitySlider = must(document.querySelector<HTMLInputElement>("#rec-density"));
  const densityOutput = must(document.querySelector<HTMLOutputElement>("#rec-density-output"));
  const contactSlider = must(document.querySelector<HTMLInputElement>("#rec-contact"));
  const contactOutput = must(document.querySelector<HTMLOutputElement>("#rec-contact-output"));
  const quarantineCheckbox = must(document.querySelector<HTMLInputElement>("#rec-quarantine"));
  const pauseButton = must(document.querySelector<HTMLButtonElement>("#rec-pause"));
  const resetButton = must(document.querySelector<HTMLButtonElement>("#rec-reset"));
  const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-rec-mode]"));
  const dayOut = must(document.querySelector<HTMLElement>("#rec-day"));
  const sOut = must(document.querySelector<HTMLElement>("#rec-s"));
  const iOut = must(document.querySelector<HTMLElement>("#rec-i"));
  const rOut = must(document.querySelector<HTMLElement>("#rec-r"));

  let mode: Mode = "simple";
  let rng = mulberry32(SIM_SEED);
  let particles = createParticles(mode, Number(densitySlider.value), rng);
  let frame = 0;
  let paused = false;
  let history: Counts[] = [];
  let animationHandle = 0;

  function updateStats(counts: Counts): void {
    dayOut.textContent = String(Math.floor(frame / 60));
    sOut.textContent = String(counts.s);
    iOut.textContent = String(counts.i);
    rOut.textContent = String(counts.r);
  }

  function reset(): void {
    rng = mulberry32(SIM_SEED + frame);
    particles = createParticles(mode, Number(densitySlider.value), rng);
    frame = 0;
    history = [];
    const counts = countStates(particles);
    updateStats(counts);
    draw(ctx, particles);
  }

  function tick(): void {
    if (!paused) {
      const opts: StepOptions = {
        mode,
        density: Number(densitySlider.value),
        quarantine: quarantineCheckbox.checked,
        frame,
        rng,
      };
      for (const p of particles) stepParticle(p, opts);
      updateInfections(particles, Number(contactSlider.value), frame, rng);
      frame++;

      if (frame % CHART_SAMPLE_EVERY === 0) {
        const counts = countStates(particles);
        history.push(counts);
        if (history.length > CHART_MAX_POINTS) history.shift();
        updateStats(counts);
        renderChart(chart, history);
      }
    }
    draw(ctx, particles);
    animationHandle = requestAnimationFrame(tick);
  }

  densitySlider.addEventListener("input", () => {
    densityOutput.textContent = densitySlider.value;
  });
  contactSlider.addEventListener("input", () => {
    contactOutput.textContent = Number(contactSlider.value).toFixed(1);
  });

  pauseButton.addEventListener("click", () => {
    paused = !paused;
    pauseButton.textContent = paused ? "Resume" : "Pause";
  });

  resetButton.addEventListener("click", reset);

  for (const button of modeButtons) {
    button.addEventListener("click", () => {
      for (const other of modeButtons) other.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-pressed", "true");
      const nextMode = button.dataset.recMode;
      if (!nextMode) throw new Error("mode button missing data-rec-mode");
      mode = nextMode as Mode;
      reset();
    });
  }

  updateStats(countStates(particles));
  draw(ctx, particles);
  animationHandle = requestAnimationFrame(tick);

  window.addEventListener("beforeunload", () => cancelAnimationFrame(animationHandle));
}
