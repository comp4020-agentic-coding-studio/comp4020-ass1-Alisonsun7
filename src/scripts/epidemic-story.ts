import { must } from "./dom";

export type Mode = "simple" | "central" | "communities";
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
  masked: boolean;
  isolated: boolean;
}

const WIDTH = 800;
const HEIGHT = 500;
const PARTICLE_RADIUS = 4;
const BASE_SPEED = 1.2;
const FRAMES_PER_DAY = 60;
const DEFAULT_RECOVERY_FRAMES = 240;
const COMMUNITY_COLUMNS = 2;
const COMMUNITY_ROWS = 2;
const COMMUNITY_COUNT = COMMUNITY_COLUMNS * COMMUNITY_ROWS;
const DEFAULT_COMMUNITY_TRAVEL_CHANCE = 0.001;
const CENTRAL_TRIP_CHANCE = 0.01;
const CHART_SAMPLE_EVERY = 6;
const HISTORY_SAFETY_CAP = 20_000;
const DEFAULT_PARTICLE_COUNT = 150;
const DEFAULT_SEED = 913_517_243;
const DEFAULT_RADIUS = 8;
const DEFAULT_CHANCE = 0.06;
const DEFAULT_MASK_EFFECTIVENESS = 0.5;

const ISOLATION_ZONE = { x0: WIDTH - 180, y0: HEIGHT - 130, x1: WIDTH - 10, y1: HEIGHT - 10 };
const ISOLATION_COLS = 5;
const ISOLATION_ROWS = 6;

const MODE_LABELS: Record<Mode, string> = {
  simple: "Simple case",
  central: "Central location case",
  communities: "Communities case",
};

const CHART_X0 = 50;
const CHART_X1 = 390;
const CHART_Y0 = 10;
const CHART_Y1 = 160;

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

// Computes the standard SIR basic reproduction number. Transmission rate over
// recovery rate — NOT the inverse — so that a bigger beta or a smaller gamma
// both correctly push R0 up.
export function computeR0(beta: number, gamma: number): number {
  return beta / gamma;
}

function createParticles(
  mode: Mode,
  rng: () => number,
  particleCount: number,
  maskRate: number,
  vaccinationRate: number,
): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < particleCount; i++) {
    const community = i % COMMUNITY_COUNT;
    const spawnBox =
      mode === "communities" ? communityBox(community) : { x0: 0, y0: 0, x1: WIDTH, y1: HEIGHT };
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
      masked: rng() < maskRate,
      isolated: false,
    });
  }
  // Vaccinate everyone except whoever becomes patient zero below, so a
  // vaccinated room visibly starts with some particles already grey.
  for (let i = 1; i < particles.length; i++) {
    const p = particles[i];
    if (p && rng() < vaccinationRate) p.state = "R";
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

function isolationSlotPosition(index: number): { x: number; y: number } {
  const cellW = (ISOLATION_ZONE.x1 - ISOLATION_ZONE.x0) / ISOLATION_COLS;
  const cellH = (ISOLATION_ZONE.y1 - ISOLATION_ZONE.y0) / ISOLATION_ROWS;
  const slot = index % (ISOLATION_COLS * ISOLATION_ROWS);
  const col = slot % ISOLATION_COLS;
  const row = Math.floor(slot / ISOLATION_COLS);
  return {
    x: ISOLATION_ZONE.x0 + cellW * (col + 0.5),
    y: ISOLATION_ZONE.y0 + cellH * (row + 0.5),
  };
}

interface StepOptions {
  mode: Mode;
  quarantine: boolean;
  rng: () => number;
  communityTravelChance: number;
  isolationCounter: { value: number };
}

function stepParticle(p: Particle, opts: StepOptions): void {
  if (p.state === "I" && opts.quarantine) {
    if (!p.isolated) {
      p.isolated = true;
      const slot = isolationSlotPosition(opts.isolationCounter.value++);
      p.x = slot.x;
      p.y = slot.y;
      p.vx = 0;
      p.vy = 0;
    }
    return;
  }

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
    if (opts.rng() < opts.communityTravelChance) {
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
  bounceWithinBox(p, { x0: 0, y0: 0, x1: WIDTH, y1: HEIGHT });
}

function updateInfections(
  particles: Particle[],
  infectionRadius: number,
  infectionChance: number,
  maskEffectiveness: number,
  recoveryFrames: number,
  frame: number,
  rng: () => number,
): void {
  for (const p of particles) {
    if (p.state !== "I") continue;
    if (frame - p.infectedAtFrame > recoveryFrames) {
      p.state = "R";
      p.isolated = false;
      continue;
    }
    for (const other of particles) {
      if (other.state !== "S") continue;
      if (!distanceBelow(p.x, p.y, other.x, other.y, infectionRadius)) continue;
      const chance = other.masked ? infectionChance * (1 - maskEffectiveness) : infectionChance;
      if (rng() < chance) {
        other.state = "I";
        other.infectedAtFrame = frame;
      }
    }
  }
}

function drawCommunityDividers(ctx: CanvasRenderingContext2D): void {
  const cellW = WIDTH / COMMUNITY_COLUMNS;
  const cellH = HEIGHT / COMMUNITY_ROWS;
  ctx.save();
  ctx.strokeStyle = "rgba(226, 232, 240, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let col = 1; col < COMMUNITY_COLUMNS; col++) {
    ctx.moveTo(col * cellW, 0);
    ctx.lineTo(col * cellW, HEIGHT);
  }
  for (let row = 1; row < COMMUNITY_ROWS; row++) {
    ctx.moveTo(0, row * cellH);
    ctx.lineTo(WIDTH, row * cellH);
  }
  ctx.stroke();
  ctx.restore();
}

function drawIsolationZone(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = "rgba(226, 232, 240, 0.7)";
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 2;
  ctx.strokeRect(
    ISOLATION_ZONE.x0,
    ISOLATION_ZONE.y0,
    ISOLATION_ZONE.x1 - ISOLATION_ZONE.x0,
    ISOLATION_ZONE.y1 - ISOLATION_ZONE.y0,
  );
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText("Isolation zone", ISOLATION_ZONE.x0, ISOLATION_ZONE.y0 - 6);
  ctx.restore();
}

interface DrawOptions {
  mode: Mode;
  quarantine: boolean;
  showRadiusHalo: boolean;
  infectionRadius: number;
}

function draw(ctx: CanvasRenderingContext2D, particles: Particle[], opts: DrawOptions): void {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (opts.mode === "communities") drawCommunityDividers(ctx);
  if (opts.quarantine) drawIsolationZone(ctx);

  if (opts.showRadiusHalo) {
    for (const p of particles) {
      if (p.state !== "I") continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, opts.infectionRadius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(251, 113, 89, 0.12)";
      ctx.fill();
      ctx.strokeStyle = "rgba(251, 113, 89, 0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, PARTICLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = p.state === "S" ? "#38bdf8" : p.state === "I" ? "#fb7159" : "#94a3b8";
    ctx.fill();
    if (p.state === "S" && p.masked) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, PARTICLE_RADIUS + 2, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
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

// Always plots the whole history from a fixed day-0 origin (CHART_X0), so the
// x-axis never scrolls and never discards a run's earliest data — the step
// between points shrinks as history grows, rather than the window sliding.
// HISTORY_SAFETY_CAP is a memory backstop for a tab left running for a very
// long time, not a visible windowing behaviour.
function renderChart(svg: SVGSVGElement, history: Counts[]): void {
  const bandS = must(svg.querySelector<SVGPolygonElement>(".rec-band-s"));
  const bandI = must(svg.querySelector<SVGPolygonElement>(".rec-band-i"));
  const bandR = must(svg.querySelector<SVGPolygonElement>(".rec-band-r"));
  if (history.length < 2) return;

  const plotWidth = CHART_X1 - CHART_X0;
  const plotHeight = CHART_Y1 - CHART_Y0;
  const stepX = plotWidth / (history.length - 1);

  const rTop: string[] = [];
  const iTop: string[] = [];
  const sTop: string[] = [];
  history.forEach((point, idx) => {
    const total = point.s + point.i + point.r;
    const x = CHART_X0 + idx * stepX;
    const rFrac = point.r / total;
    const iFrac = point.i / total;
    const rY = CHART_Y1 - rFrac * plotHeight;
    const iY = rY - iFrac * plotHeight;
    rTop.push(`${x},${rY}`);
    iTop.push(`${x},${iY}`);
    sTop.push(`${x},${CHART_Y0}`);
  });

  const rightEdge = CHART_X0 + (history.length - 1) * stepX;
  const baseline = `${CHART_X0},${CHART_Y1} ${rightEdge},${CHART_Y1}`;
  bandR.setAttribute("points", `${baseline} ${[...rTop].reverse().join(" ")}`);
  bandI.setAttribute("points", `${rTop.join(" ")} ${[...iTop].reverse().join(" ")}`);
  bandS.setAttribute("points", `${iTop.join(" ")} ${[...sTop].reverse().join(" ")}`);

  const totalDays = ((history.length - 1) * CHART_SAMPLE_EVERY) / FRAMES_PER_DAY;
  const xticks = svg.querySelectorAll<SVGTextElement>(".rec-xtick");
  const fractions = [0, 0.25, 0.5, 0.75, 1];
  xticks.forEach((tick, idx) => {
    const frac = fractions[idx] ?? 0;
    tick.textContent = `Day ${Math.round(frac * totalDays)}`;
  });
}

export interface ParticleWidgetOptions {
  mode: Mode;
  quarantine?: boolean;
  infectionRadius?: number;
  infectionChance?: number;
  recoveryFrames?: number;
  communityTravelChance?: number;
  maskRate?: number;
  maskEffectiveness?: number;
  vaccinationRate?: number;
  showRadiusHalo?: boolean;
  particleCount?: number;
  seed?: number;
  chart?: SVGSVGElement | null;
  pctS?: HTMLElement | null;
  pctI?: HTMLElement | null;
  pctR?: HTMLElement | null;
  dayLabel?: HTMLElement | null;
  caseLabel?: HTMLElement | null;
}

export interface ParticleWidget {
  setMode(mode: Mode): void;
  setQuarantine(value: boolean): void;
  setInfectionRadius(value: number): void;
  setInfectionChance(value: number): void;
  setRecoveryFrames(value: number): void;
  setCommunityTravelChance(value: number): void;
  setMaskRate(value: number): void;
  setVaccinationRate(value: number): void;
  pause(): void;
  resume(): void;
  togglePause(): boolean;
  reset(): void;
  destroy(): void;
  getCounts(): Counts;
}

// One independently-configured, independently-animated instance: the page
// creates many of these concurrently (plain demos, a side-by-side quarantine
// comparison, the full capstone sandbox) rather than driving one global
// singleton.
export function createParticleWidget(
  canvas: HTMLCanvasElement,
  opts: ParticleWidgetOptions,
): ParticleWidget {
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) throw new Error("expected 2d canvas context");
  const ctx: CanvasRenderingContext2D = maybeCtx;

  let mode: Mode = opts.mode;
  let quarantine = opts.quarantine ?? false;
  let infectionRadius = opts.infectionRadius ?? DEFAULT_RADIUS;
  let infectionChance = opts.infectionChance ?? DEFAULT_CHANCE;
  let recoveryFrames = opts.recoveryFrames ?? DEFAULT_RECOVERY_FRAMES;
  let communityTravelChance = opts.communityTravelChance ?? DEFAULT_COMMUNITY_TRAVEL_CHANCE;
  let maskRate = opts.maskRate ?? 0;
  const maskEffectiveness = opts.maskEffectiveness ?? DEFAULT_MASK_EFFECTIVENESS;
  let vaccinationRate = opts.vaccinationRate ?? 0;
  const showRadiusHalo = opts.showRadiusHalo ?? false;
  const particleCount = opts.particleCount ?? DEFAULT_PARTICLE_COUNT;
  const seed = opts.seed ?? DEFAULT_SEED;

  let rng = mulberry32(seed);
  let particles = createParticles(mode, rng, particleCount, maskRate, vaccinationRate);
  let frame = 0;
  let paused = false;
  let history: Counts[] = [];
  let animationHandle = 0;
  let resetCount = 0;
  let isolationCounter = { value: 0 };

  function updateReadouts(counts: Counts): void {
    const total = counts.s + counts.i + counts.r;
    if (opts.pctR) opts.pctR.textContent = ((counts.r / total) * 100).toFixed(1);
    if (opts.pctS) opts.pctS.textContent = ((counts.s / total) * 100).toFixed(1);
    if (opts.pctI) opts.pctI.textContent = ((counts.i / total) * 100).toFixed(1);
    if (opts.dayLabel) opts.dayLabel.textContent = `Day ${Math.floor(frame / FRAMES_PER_DAY)}`;
  }

  function reset(): void {
    resetCount += 1;
    rng = mulberry32(seed + resetCount);
    particles = createParticles(mode, rng, particleCount, maskRate, vaccinationRate);
    frame = 0;
    history = [];
    isolationCounter = { value: 0 };
    if (opts.caseLabel) opts.caseLabel.textContent = MODE_LABELS[mode];
    const counts = countStates(particles);
    updateReadouts(counts);
    draw(ctx, particles, { mode, quarantine, showRadiusHalo, infectionRadius });
    if (opts.chart) renderChart(opts.chart, history);
  }

  function tick(): void {
    if (!paused) {
      const stepOpts: StepOptions = {
        mode,
        quarantine,
        rng,
        communityTravelChance,
        isolationCounter,
      };
      for (const p of particles) stepParticle(p, stepOpts);
      updateInfections(
        particles,
        infectionRadius,
        infectionChance,
        maskEffectiveness,
        recoveryFrames,
        frame,
        rng,
      );
      frame++;

      if (frame % CHART_SAMPLE_EVERY === 0) {
        const counts = countStates(particles);
        history.push(counts);
        if (history.length > HISTORY_SAFETY_CAP) history.shift();
        updateReadouts(counts);
        if (opts.chart) renderChart(opts.chart, history);
      }
    }
    draw(ctx, particles, { mode, quarantine, showRadiusHalo, infectionRadius });
    animationHandle = requestAnimationFrame(tick);
  }

  if (opts.caseLabel) opts.caseLabel.textContent = MODE_LABELS[mode];
  updateReadouts(countStates(particles));
  draw(ctx, particles, { mode, quarantine, showRadiusHalo, infectionRadius });
  animationHandle = requestAnimationFrame(tick);

  return {
    setMode(next) {
      mode = next;
      reset();
    },
    setQuarantine(value) {
      quarantine = value;
    },
    setInfectionRadius(value) {
      infectionRadius = value;
    },
    setInfectionChance(value) {
      infectionChance = value;
    },
    setRecoveryFrames(value) {
      recoveryFrames = value;
    },
    setCommunityTravelChance(value) {
      communityTravelChance = value;
    },
    setMaskRate(value) {
      maskRate = value;
      for (const p of particles) p.masked = Math.random() < value;
    },
    setVaccinationRate(value) {
      vaccinationRate = value;
      reset();
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    togglePause() {
      paused = !paused;
      return paused;
    },
    reset,
    destroy() {
      cancelAnimationFrame(animationHandle);
    },
    getCounts() {
      return countStates(particles);
    },
  };
}

interface StandardWidgetOptions {
  mode: Mode;
  quarantine?: boolean;
  seed?: number;
  particleCount?: number;
  infectionRadius?: number;
  infectionChance?: number;
  recoveryFrames?: number;
  communityTravelChance?: number;
  maskRate?: number;
  maskEffectiveness?: number;
  vaccinationRate?: number;
  showRadiusHalo?: boolean;
}

// Wires up one <ParticleWidget> markup instance: pause/reset always; sliders,
// the quarantine checkbox, and mode tabs only where that instance's markup
// actually renders them (queried within its own container, so instances
// without a given control simply skip wiring it).
function setupStandardWidget(prefix: string, engineOpts: StandardWidgetOptions): ParticleWidget {
  const container = must(document.getElementById(`${prefix}-widget`));
  const canvas = must(container.querySelector<HTMLCanvasElement>(".rec-canvas"));
  const pauseButton = must(container.querySelector<HTMLButtonElement>(".rec-pause"));
  const resetButton = must(container.querySelector<HTMLButtonElement>(".rec-reset"));
  const caseLabel = container.querySelector<HTMLElement>(".rec-case-label");
  const chart = container.querySelector<SVGSVGElement>(".rec-chart");
  const pctS = container.querySelector<HTMLElement>(".rec-pct-s");
  const pctI = container.querySelector<HTMLElement>(".rec-pct-i");
  const pctR = container.querySelector<HTMLElement>(".rec-pct-r");
  const dayLabel = container.querySelector<HTMLElement>(".rec-day");
  const radiusSlider = container.querySelector<HTMLInputElement>(".rec-radius-input");
  const radiusOutput = container.querySelector<HTMLElement>(".rec-radius-output");
  const chanceSlider = container.querySelector<HTMLInputElement>(".rec-chance-input");
  const chanceOutput = container.querySelector<HTMLElement>(".rec-chance-output");
  const periodSlider = container.querySelector<HTMLInputElement>(".rec-period-input");
  const periodOutput = container.querySelector<HTMLElement>(".rec-period-output");
  const travelSlider = container.querySelector<HTMLInputElement>(".rec-travel-input");
  const travelOutput = container.querySelector<HTMLElement>(".rec-travel-output");
  const maskSlider = container.querySelector<HTMLInputElement>(".rec-mask-input");
  const maskOutput = container.querySelector<HTMLElement>(".rec-mask-output");
  const maskUnmaskedCallout = container.querySelector<HTMLElement>(".rec-mask-callout-unmasked");
  const maskMaskedCallout = container.querySelector<HTMLElement>(".rec-mask-callout-masked");
  const vaccinationSlider = container.querySelector<HTMLInputElement>(".rec-vaccination-input");
  const vaccinationOutput = container.querySelector<HTMLElement>(".rec-vaccination-output");
  const betaSlider = container.querySelector<HTMLInputElement>(".rec-beta-input");
  const betaOutput = container.querySelector<HTMLElement>(".rec-beta-output");
  const gammaSlider = container.querySelector<HTMLInputElement>(".rec-gamma-input");
  const gammaOutput = container.querySelector<HTMLElement>(".rec-gamma-output");
  const r0Output = container.querySelector<HTMLElement>(".rec-r0-value");
  const quarantineCheckbox = container.querySelector<HTMLInputElement>(".rec-quarantine-input");
  const modeButtons = Array.from(container.querySelectorAll<HTMLButtonElement>("[data-rec-mode]"));

  const widget = createParticleWidget(canvas, {
    mode: engineOpts.mode,
    quarantine: engineOpts.quarantine,
    infectionRadius: engineOpts.infectionRadius,
    infectionChance: engineOpts.infectionChance,
    recoveryFrames: engineOpts.recoveryFrames,
    communityTravelChance: engineOpts.communityTravelChance,
    maskRate: engineOpts.maskRate,
    maskEffectiveness: engineOpts.maskEffectiveness,
    vaccinationRate: engineOpts.vaccinationRate,
    showRadiusHalo: engineOpts.showRadiusHalo,
    particleCount: engineOpts.particleCount,
    seed: engineOpts.seed,
    chart,
    pctS,
    pctI,
    pctR,
    dayLabel,
    caseLabel,
  });

  pauseButton.addEventListener("click", () => {
    const paused = widget.togglePause();
    pauseButton.textContent = paused ? "Resume" : "Pause";
  });
  resetButton.addEventListener("click", () => {
    widget.reset();
    pauseButton.textContent = "Pause";
  });

  if (radiusSlider && radiusOutput) {
    radiusSlider.addEventListener("input", () => {
      radiusOutput.textContent = radiusSlider.value;
      widget.setInfectionRadius(Number(radiusSlider.value));
    });
  }
  if (chanceSlider && chanceOutput) {
    chanceSlider.addEventListener("input", () => {
      chanceOutput.textContent = chanceSlider.value;
      widget.setInfectionChance(Number(chanceSlider.value) / 100);
    });
  }
  if (periodSlider && periodOutput) {
    periodSlider.addEventListener("input", () => {
      periodOutput.textContent = periodSlider.value;
      widget.setRecoveryFrames(Number(periodSlider.value) * FRAMES_PER_DAY);
    });
  }
  if (travelSlider && travelOutput) {
    travelSlider.addEventListener("input", () => {
      travelOutput.textContent = travelSlider.value;
      widget.setCommunityTravelChance(Number(travelSlider.value) / 100);
    });
  }
  if (maskSlider && maskOutput) {
    const effectiveness = engineOpts.maskEffectiveness ?? DEFAULT_MASK_EFFECTIVENESS;
    const unmaskedChance = engineOpts.infectionChance ?? DEFAULT_CHANCE;
    if (maskUnmaskedCallout) maskUnmaskedCallout.textContent = (unmaskedChance * 100).toFixed(0);
    if (maskMaskedCallout) {
      maskMaskedCallout.textContent = (unmaskedChance * (1 - effectiveness) * 100).toFixed(0);
    }
    maskSlider.addEventListener("input", () => {
      maskOutput.textContent = maskSlider.value;
      widget.setMaskRate(Number(maskSlider.value) / 100);
    });
  }
  if (vaccinationSlider && vaccinationOutput) {
    vaccinationSlider.addEventListener("input", () => {
      vaccinationOutput.textContent = vaccinationSlider.value;
      widget.setVaccinationRate(Number(vaccinationSlider.value) / 100);
    });
  }
  if (betaSlider && betaOutput && gammaSlider && gammaOutput && r0Output) {
    const updateBetaGamma = () => {
      const beta = Number(betaSlider.value);
      const gamma = Number(gammaSlider.value);
      betaOutput.textContent = beta.toFixed(2);
      gammaOutput.textContent = gamma.toFixed(2);
      r0Output.textContent = computeR0(beta, gamma).toFixed(2);
      widget.setInfectionChance(beta);
      widget.setRecoveryFrames(Math.round(FRAMES_PER_DAY / gamma));
    };
    betaSlider.addEventListener("input", updateBetaGamma);
    gammaSlider.addEventListener("input", updateBetaGamma);
  }
  if (quarantineCheckbox) {
    quarantineCheckbox.addEventListener("change", () => {
      widget.setQuarantine(quarantineCheckbox.checked);
    });
  }
  for (const button of modeButtons) {
    button.addEventListener("click", () => {
      for (const other of modeButtons) other.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-pressed", "true");
      const nextMode = button.dataset.recMode;
      if (!nextMode) throw new Error("mode button missing data-rec-mode");
      widget.setMode(nextMode as Mode);
    });
  }

  return widget;
}

interface DiseasePreset {
  radius: number;
  chance: number;
}

// Illustrative, hand-ranked stand-ins for "how this looks in the sandbox" —
// not a calibrated translation of the cited R0 figures into this engine's
// radius/chance units. The sourced R0 values (in the markup) are the real
// numbers; these presets only preserve their relative ordering.
const DISEASE_PRESETS: Record<string, DiseasePreset> = {
  flu: { radius: 6, chance: 0.04 },
  covid: { radius: 8, chance: 0.08 },
  ebola: { radius: 8, chance: 0.1 },
  measles: { radius: 14, chance: 0.25 },
  below: { radius: 4, chance: 0.02 },
  at: { radius: 6, chance: 0.05 },
  above: { radius: 12, chance: 0.18 },
};

function wireDiseasePresets(sandbox: ParticleWidget): void {
  const sandboxContainer = must(document.getElementById("sandbox-widget"));
  const radiusSlider = must(sandboxContainer.querySelector<HTMLInputElement>(".rec-radius-input"));
  const radiusOutput = must(sandboxContainer.querySelector<HTMLElement>(".rec-radius-output"));
  const chanceSlider = must(sandboxContainer.querySelector<HTMLInputElement>(".rec-chance-input"));
  const chanceOutput = must(sandboxContainer.querySelector<HTMLElement>(".rec-chance-output"));
  const modeButtons = Array.from(
    sandboxContainer.querySelectorAll<HTMLButtonElement>("[data-rec-mode]"),
  );
  const presetButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-disease-preset]"),
  );

  for (const button of presetButtons) {
    button.addEventListener("click", () => {
      const key = button.dataset.diseasePreset;
      const preset = key ? DISEASE_PRESETS[key] : undefined;
      if (!preset) return;

      for (const modeButton of modeButtons) {
        modeButton.setAttribute("aria-pressed", String(modeButton.dataset.recMode === "simple"));
      }
      radiusSlider.value = String(preset.radius);
      radiusOutput.textContent = String(preset.radius);
      const chancePercent = Math.round(preset.chance * 100);
      chanceSlider.value = String(chancePercent);
      chanceOutput.textContent = String(chancePercent);

      sandbox.setMode("simple");
      sandbox.setInfectionRadius(preset.radius);
      sandbox.setInfectionChance(preset.chance);

      document.getElementById("sandbox")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

// Generic accordion wiring for the R0-track disease/regime detail panels:
// each trigger names its own detail block via data-toggle, and triggers
// sharing a data-toggle-group close each other so only one detail block per
// group is open at a time. A matching `#<group>-placeholder` element (if
// present) is shown only while nothing in that group is open.
function initToggleGroups(): void {
  const triggers = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-toggle]"));
  const byGroup = new Map<string, HTMLButtonElement[]>();
  for (const trigger of triggers) {
    const group = trigger.dataset.toggleGroup ?? trigger.dataset.toggle ?? "";
    byGroup.set(group, [...(byGroup.get(group) ?? []), trigger]);
  }

  function refreshPlaceholder(group: string): void {
    const placeholder = document.getElementById(`${group}-placeholder`);
    if (!placeholder) return;
    const anyOpen = (byGroup.get(group) ?? []).some(
      (t) => t.getAttribute("aria-expanded") === "true",
    );
    placeholder.hidden = anyOpen;
  }

  for (const trigger of triggers) {
    trigger.addEventListener("click", () => {
      const targetId = trigger.dataset.toggle;
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (!target) return;
      const group = trigger.dataset.toggleGroup ?? targetId;
      const wasOpen = trigger.getAttribute("aria-expanded") === "true";

      for (const sibling of byGroup.get(group) ?? []) {
        sibling.setAttribute("aria-expanded", "false");
        const siblingTargetId = sibling.dataset.toggle;
        const siblingTarget = siblingTargetId ? document.getElementById(siblingTargetId) : null;
        if (siblingTarget) siblingTarget.hidden = true;
      }

      if (!wasOpen) {
        trigger.setAttribute("aria-expanded", "true");
        target.hidden = false;
      }
      refreshPlaceholder(group);
    });
  }
}

const ISOLATION_SEED = 500_000_007;

export function initEpidemicStory(): void {
  // Dramatic, always-sweeps defaults: high beta, long-ish infectious period.
  setupStandardWidget("simple", {
    mode: "simple",
    infectionChance: 0.35,
    recoveryFrames: 600,
  });
  setupStandardWidget("measuring", {
    mode: "simple",
    infectionChance: 0.4,
    recoveryFrames: 750,
  });

  setupStandardWidget("radius", { mode: "simple", showRadiusHalo: true, infectionChance: 0.22 });
  setupStandardWidget("period", { mode: "simple", recoveryFrames: 240, infectionChance: 0.22 });
  setupStandardWidget("chance", { mode: "simple", infectionChance: 0.15 });

  const isolationOff = setupStandardWidget("isoa", {
    mode: "simple",
    quarantine: false,
    seed: ISOLATION_SEED,
  });
  const isolationOn = setupStandardWidget("isob", {
    mode: "simple",
    quarantine: true,
    seed: ISOLATION_SEED,
  });
  const resetBothButton = document.getElementById("isolation-reset-both");
  resetBothButton?.addEventListener("click", () => {
    isolationOff.reset();
    isolationOn.reset();
  });

  setupStandardWidget("hotspot", {
    mode: "central",
    infectionChance: 0.25,
    recoveryFrames: 500,
  });
  setupStandardWidget("communities", { mode: "communities" });
  setupStandardWidget("travel", { mode: "communities", communityTravelChance: 0.001 });
  setupStandardWidget("masks", { mode: "simple", infectionChance: 0.15, maskRate: 0.5 });
  setupStandardWidget("vaccination", { mode: "simple", infectionChance: 0.1, vaccinationRate: 0.3 });

  const sandbox = setupStandardWidget("sandbox", { mode: "simple" });
  wireDiseasePresets(sandbox);

  initToggleGroups();
}
