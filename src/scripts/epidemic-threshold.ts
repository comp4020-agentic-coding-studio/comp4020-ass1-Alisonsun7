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

const NUM_CLUSTERS = 4;
const CLUSTER_GAP_FRACTION = 0.08;
const JUMP_PROBABILITY = 0.0006;

const HOTSPOT_FRACTION = 0.07;
const TRIP_PROBABILITY = 0.0015;
const LINGER_FRAMES = 90;

type Mode = "simple" | "central" | "communities";
type NodeState = "S" | "E" | "I" | "R";
type TripPhase = "wander" | "toCenter" | "atCenter";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: NodeState;
  incubatingFor: number;
  infectedFor: number;
  clusterIndex: number;
  tripPhase: TripPhase;
  tripTimer: number;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
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

function clusterBounds(width: number, height: number): Bounds[] {
  const gapX = width * CLUSTER_GAP_FRACTION;
  const gapY = height * CLUSTER_GAP_FRACTION;
  const halfW = (width - gapX) / 2;
  const halfH = (height - gapY) / 2;
  return [
    { minX: 0, maxX: halfW, minY: 0, maxY: halfH },
    { minX: width - halfW, maxX: width, minY: 0, maxY: halfH },
    { minX: 0, maxX: halfW, minY: height - halfH, maxY: height },
    { minX: width - halfW, maxX: width, minY: height - halfH, maxY: height },
  ];
}

function randomPositionIn(rng: () => number, bounds: Bounds): { x: number; y: number } {
  return {
    x: bounds.minX + DRAW_RADIUS + rng() * Math.max(bounds.maxX - bounds.minX - 2 * DRAW_RADIUS, 0),
    y: bounds.minY + DRAW_RADIUS + rng() * Math.max(bounds.maxY - bounds.minY - 2 * DRAW_RADIUS, 0),
  };
}

function newParticle(x: number, y: number, angle: number, clusterIndex: number): Particle {
  return {
    x,
    y,
    vx: Math.cos(angle) * PARTICLE_SPEED,
    vy: Math.sin(angle) * PARTICLE_SPEED,
    state: "S",
    incubatingFor: 0,
    infectedFor: 0,
    clusterIndex,
    tripPhase: "wander",
    tripTimer: 0,
  };
}

function spawnParticles(rng: () => number, mode: Mode, width: number, height: number): Particle[] {
  const particles: Particle[] = [];
  if (mode === "communities") {
    const bounds = clusterBounds(width, height);
    for (let i = 0; i < N_PARTICLES; i += 1) {
      const clusterIndex = i % NUM_CLUSTERS;
      const angle = rng() * Math.PI * 2;
      const { x, y } = randomPositionIn(rng, bounds[clusterIndex]);
      particles.push(newParticle(x, y, angle, clusterIndex));
    }
  } else {
    for (let i = 0; i < N_PARTICLES; i += 1) {
      const angle = rng() * Math.PI * 2;
      const x = DRAW_RADIUS + rng() * (width - 2 * DRAW_RADIUS);
      const y = DRAW_RADIUS + rng() * (height - 2 * DRAW_RADIUS);
      particles.push(newParticle(x, y, angle, 0));
    }
  }
  particles[0].state = "I";
  return particles;
}

function bounceWithin(p: Particle, bounds: Bounds): void {
  if (p.x < bounds.minX + DRAW_RADIUS || p.x > bounds.maxX - DRAW_RADIUS) p.vx *= -1;
  if (p.y < bounds.minY + DRAW_RADIUS || p.y > bounds.maxY - DRAW_RADIUS) p.vy *= -1;
  p.x = Math.min(Math.max(p.x, bounds.minX + DRAW_RADIUS), bounds.maxX - DRAW_RADIUS);
  p.y = Math.min(Math.max(p.y, bounds.minY + DRAW_RADIUS), bounds.maxY - DRAW_RADIUS);
}

function applyCentralTrip(p: Particle, rng: () => number, centerX: number, centerY: number, hotspotRadius: number): void {
  if (p.tripPhase === "wander") {
    if (rng() < TRIP_PROBABILITY) p.tripPhase = "toCenter";
    return;
  }
  if (p.tripPhase === "toCenter") {
    const dx = centerX - p.x;
    const dy = centerY - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < hotspotRadius) {
      p.tripPhase = "atCenter";
      p.tripTimer = LINGER_FRAMES;
      const angle = rng() * Math.PI * 2;
      p.vx = Math.cos(angle) * PARTICLE_SPEED * 0.4;
      p.vy = Math.sin(angle) * PARTICLE_SPEED * 0.4;
    } else {
      p.vx = (dx / dist) * PARTICLE_SPEED;
      p.vy = (dy / dist) * PARTICLE_SPEED;
    }
    return;
  }
  p.tripTimer -= 1;
  if (rng() < 0.05) {
    const angle = rng() * Math.PI * 2;
    p.vx = Math.cos(angle) * PARTICLE_SPEED * 0.4;
    p.vy = Math.sin(angle) * PARTICLE_SPEED * 0.4;
  }
  if (p.tripTimer <= 0) {
    p.tripPhase = "wander";
    const angle = rng() * Math.PI * 2;
    p.vx = Math.cos(angle) * PARTICLE_SPEED;
    p.vy = Math.sin(angle) * PARTICLE_SPEED;
  }
}

function stepPhysics(
  particles: Particle[],
  rng: () => number,
  mode: Mode,
  width: number,
  height: number,
  quarantine: boolean,
): void {
  const worldBounds: Bounds = { minX: 0, maxX: width, minY: 0, maxY: height };
  const communityBounds = mode === "communities" ? clusterBounds(width, height) : null;
  const hotspotRadius = Math.min(width, height) * HOTSPOT_FRACTION;

  for (const p of particles) {
    if (quarantine && p.state === "I") {
      p.vx = 0;
      p.vy = 0;
      continue;
    }
    if (mode === "central") applyCentralTrip(p, rng, width / 2, height / 2, hotspotRadius);

    p.x += p.vx;
    p.y += p.vy;

    if (communityBounds) {
      bounceWithin(p, communityBounds[p.clusterIndex]);
      if (rng() < JUMP_PROBABILITY) {
        const newCluster = (p.clusterIndex + 1 + Math.floor(rng() * (NUM_CLUSTERS - 1))) % NUM_CLUSTERS;
        const { x, y } = randomPositionIn(rng, communityBounds[newCluster]);
        p.clusterIndex = newCluster;
        p.x = x;
        p.y = y;
      }
    } else {
      bounceWithin(p, worldBounds);
    }
  }
}

// Empirically measures how many other particles one particle encounters per
// frame at a given world size, using the SIMPLE layout as a fixed reference
// point regardless of the active mode — the particle-sim analogue of the old
// network model's "average degree". Used to calibrate infection probability
// so the contact-rate slider keeps the same meaning across all three modes:
// expected secondary infections per infectious particle under uniform
// mixing. Whatever a mode's own spatial structure does to real contact
// frequency (a shared hotspot, separated communities) is then a genuine,
// unforced consequence of that structure, not something calibrated away.
function measureAvgEncounters(width: number, height: number): number {
  const rng = mulberry32(MEASURE_SEED);
  const particles = spawnParticles(rng, "simple", width, height);
  let total = 0;
  for (let f = 0; f < MEASURE_FRAMES; f += 1) {
    stepPhysics(particles, rng, "simple", width, height, false);
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
  e: number;
  i: number;
  r: number;
}

export function initEpidemicThreshold(): void {
  const contactSlider = must(document.getElementById("contact-slider") as HTMLInputElement | null);
  const contactOutput = must(document.getElementById("contact-output"));
  const densitySlider = must(document.getElementById("density-slider") as HTMLInputElement | null);
  const densityOutput = must(document.getElementById("density-output"));
  const incubationSlider = must(document.getElementById("incubation-slider") as HTMLInputElement | null);
  const incubationOutput = must(document.getElementById("incubation-output"));
  const quarantineCheckbox = must(document.getElementById("quarantine-checkbox") as HTMLInputElement | null);
  const pauseButton = must(document.getElementById("pause-btn") as HTMLButtonElement | null);
  const resetButton = must(document.getElementById("reset-btn") as HTMLButtonElement | null);
  const canvas = must(document.getElementById("sim-canvas") as HTMLCanvasElement | null);
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) throw new Error("expected 2d canvas context");
  const ctx: CanvasRenderingContext2D = maybeCtx;
  const statS = must(document.getElementById("stat-s"));
  const statE = must(document.getElementById("stat-e"));
  const statI = must(document.getElementById("stat-i"));
  const statR = must(document.getElementById("stat-r"));
  const areaS = must(document.querySelector<SVGPolygonElement>("#chart-area-s"));
  const areaE = must(document.querySelector<SVGPolygonElement>("#chart-area-e"));
  const areaI = must(document.querySelector<SVGPolygonElement>("#chart-area-i"));
  const areaR = must(document.querySelector<SVGPolygonElement>("#chart-area-r"));
  const tickStatus = must(document.getElementById("tick-status"));
  const outcomeReadout = must(document.getElementById("outcome-readout"));
  const presetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-rate]"));
  const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-mode]"));

  let mode: Mode = "simple";
  let worldWidth = CANVAS_W;
  let worldHeight = CANVAS_H;
  let avgEncounters = measureAvgEncounters(worldWidth, worldHeight);
  let particles: Particle[] = [];
  let history: HistoryPoint[] = [];
  let contactRate = Number(contactSlider.value);
  let incubationFrames = Number(incubationSlider.value);
  let infectProbability = 0;
  let paused = false;
  let rafHandle: number | undefined;
  let ended = false;
  let rng: () => number = mulberry32(SIM_SEED);

  function drawScale(): number {
    return CANVAS_W / worldWidth;
  }

  function computeInfectProbability(): number {
    return contactRate / (avgEncounters * INFECTIOUS_DURATION_FRAMES);
  }

  function resetSim(): void {
    rng = mulberry32(SIM_SEED);
    particles = spawnParticles(rng, mode, worldWidth, worldHeight);
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
      ctx.fillStyle =
        p.state === "S" ? "#9ca3af" : p.state === "E" ? "#f59e0b" : p.state === "I" ? "#dc2626" : "#2563eb";
      ctx.fill();
    }
  }

  function counts(): { s: number; e: number; i: number; r: number } {
    let s = 0;
    let e = 0;
    let i = 0;
    let r = 0;
    for (const p of particles) {
      if (p.state === "S") s += 1;
      else if (p.state === "E") e += 1;
      else if (p.state === "I") i += 1;
      else r += 1;
    }
    return { s, e, i, r };
  }

  function updateStats(): void {
    const { s, e, i, r } = counts();
    statS.textContent = `${((s / N_PARTICLES) * 100).toFixed(1)}%`;
    statE.textContent = `${((e / N_PARTICLES) * 100).toFixed(1)}%`;
    statI.textContent = `${((i / N_PARTICLES) * 100).toFixed(1)}%`;
    statR.textContent = `${((r / N_PARTICLES) * 100).toFixed(1)}%`;
    tickStatus.textContent = `Currently infectious: ${i} of ${N_PARTICLES}${e > 0 ? `, incubating: ${e}` : ""}`;
    redrawChart();
  }

  function redrawChart(): void {
    const points = history.slice(-CHART_MAX_POINTS);
    const n = points.length;
    if (n < 2) return;
    const stepX = CHART_WIDTH / (CHART_MAX_POINTS - 1);
    const startIndex = CHART_MAX_POINTS - n;

    const sTop: string[] = [];
    const eTop: string[] = [];
    const iTop: string[] = [];
    const rTop: string[] = [];
    points.forEach((point, index) => {
      const x = (startIndex + index) * stepX;
      const sFrac = point.s / N_PARTICLES;
      const eFrac = point.e / N_PARTICLES;
      const iFrac = point.i / N_PARTICLES;
      sTop.push(`${x.toFixed(1)},${(CHART_HEIGHT * (1 - sFrac)).toFixed(1)}`);
      eTop.push(`${x.toFixed(1)},${(CHART_HEIGHT * (1 - sFrac - eFrac)).toFixed(1)}`);
      iTop.push(`${x.toFixed(1)},${(CHART_HEIGHT * (1 - sFrac - eFrac - iFrac)).toFixed(1)}`);
      rTop.push(`${x.toFixed(1)},${0}`);
    });
    const firstX = startIndex * stepX;
    const lastX = (startIndex + n - 1) * stepX;

    areaS.setAttribute(
      "points",
      `${firstX.toFixed(1)},${CHART_HEIGHT} ${sTop.join(" ")} ${lastX.toFixed(1)},${CHART_HEIGHT}`,
    );
    areaE.setAttribute("points", `${sTop.join(" ")} ${[...eTop].reverse().join(" ")}`);
    areaI.setAttribute("points", `${eTop.join(" ")} ${[...iTop].reverse().join(" ")}`);
    areaR.setAttribute("points", `${iTop.join(" ")} ${[...rTop].reverse().join(" ")}`);
  }

  function tick(): void {
    if (!paused && !ended) {
      const quarantineOn = quarantineCheckbox.checked;
      stepPhysics(particles, rng, mode, worldWidth, worldHeight, quarantineOn);

      const infectious = particles.filter((p) => p.state === "I");
      const newlyExposed = new Set<Particle>();
      for (const infectedParticle of infectious) {
        for (const other of particles) {
          if (other.state !== "S" || newlyExposed.has(other)) continue;
          const dx = infectedParticle.x - other.x;
          const dy = infectedParticle.y - other.y;
          if (Math.sqrt(dx * dx + dy * dy) < CONTACT_DISTANCE && rng() < infectProbability) {
            newlyExposed.add(other);
          }
        }
      }

      for (const p of particles) {
        if (p.state === "E") {
          p.incubatingFor += 1;
          if (p.incubatingFor >= incubationFrames) {
            p.state = "I";
            p.infectedFor = 0;
          }
        } else if (p.state === "I") {
          p.infectedFor += 1;
          if (p.infectedFor >= INFECTIOUS_DURATION_FRAMES) p.state = "R";
        }
      }
      for (const p of newlyExposed) {
        if (p.state === "S") {
          p.state = "E";
          p.incubatingFor = 0;
        }
      }

      const { s, e, i, r } = counts();
      history.push({ s, e, i, r });

      if (e === 0 && i === 0) {
        ended = true;
        outcomeReadout.textContent =
          r >= N_PARTICLES * OUTBREAK_FRACTION
            ? `Full-blown outbreak — ${r} of ${N_PARTICLES} people caught it before it burned out.`
            : `Fizzled out — only ${r} of ${N_PARTICLES} people ever got sick.`;
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

  function setMode(nextMode: Mode): void {
    mode = nextMode;
    for (const button of modeButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === nextMode));
    }
    resetSim();
  }

  contactSlider.addEventListener("input", () => setContactRate(Number(contactSlider.value)));
  densitySlider.addEventListener("input", rebuildDensity);
  incubationSlider.addEventListener("input", () => {
    incubationFrames = Number(incubationSlider.value);
    incubationOutput.textContent = incubationFrames === 0 ? "None (plain S-I-R)" : `${incubationFrames} frames`;
    resetSim();
  });
  quarantineCheckbox.addEventListener("change", () => {
    if (!quarantineCheckbox.checked) {
      for (const p of particles) {
        if (p.state === "I" && p.vx === 0 && p.vy === 0) {
          const angle = rng() * Math.PI * 2;
          p.vx = Math.cos(angle) * PARTICLE_SPEED;
          p.vy = Math.sin(angle) * PARTICLE_SPEED;
        }
      }
    }
  });
  for (const button of presetButtons) {
    button.addEventListener("click", () => setContactRate(Number(button.dataset.rate)));
  }
  for (const button of modeButtons) {
    button.addEventListener("click", () => setMode(button.dataset.mode as Mode));
  }
  pauseButton.addEventListener("click", () => {
    if (ended) return;
    paused = !paused;
    pauseButton.textContent = paused ? "Resume" : "Pause";
  });
  resetButton.addEventListener("click", resetSim);

  contactOutput.textContent = contactRate.toFixed(1);
  densityOutput.textContent = densityLabel(Number(densitySlider.value));
  incubationOutput.textContent = incubationFrames === 0 ? "None (plain S-I-R)" : `${incubationFrames} frames`;
  resetSim();
  rafHandle = requestAnimationFrame(tick);
  window.addEventListener("beforeunload", () => {
    if (rafHandle !== undefined) cancelAnimationFrame(rafHandle);
  });
}
