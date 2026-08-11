// One ring-buffer sample of a car's own perceived state, recorded each tick.
export interface HistorySample {
  gap: number;
  velocity: number;
}

export interface Car {
  id: number;
  position: number; // metres along the loop, wraps into [0, trackLength)
  velocity: number; // m/s
  history: HistorySample[]; // fixed-length ring buffer of past perceived state
  historyIndex: number; // next slot to write
  brakeTicksRemaining: number; // >0 while a brake-tap forces a low speed ceiling
}

export interface SimParams {
  carCount: number; // 15–60
  reactionTimeSeconds: number; // driver reaction/perception delay
  safeFollowingDistance: number; // metres; shifts the optimal-velocity curve
  trackLength: number; // metres, fixed
  carLength: number; // metres, fixed
  vMax: number; // free-flow speed, m/s
  alpha: number; // relaxation coefficient (how hard a driver corrects toward desired velocity)
  sensitivity: number; // steepness of the optimal-velocity curve
  maxAccel: number; // m/s^2
  maxDecel: number; // m/s^2
  dt: number; // fixed simulation timestep, seconds
}

export type SimState = "stable" | "unstable" | "phantom-jam";

export const DEFAULT_PARAMS: SimParams = {
  carCount: 30,
  reactionTimeSeconds: 0.8,
  safeFollowingDistance: 15,
  trackLength: 1000,
  carLength: 4.5,
  vMax: 16.7, // ~60 km/h
  alpha: 0.8,
  sensitivity: 0.15,
  maxAccel: 2,
  maxDecel: 4,
  dt: 1 / 30,
};

// Duration and depth of the forced brake-tap disturbance on the designated car.
export const BRAKE_TAP_DURATION_SECONDS = 0.5;
export const BRAKE_TAP_VELOCITY_FRACTION = 0.2; // fraction of vMax the tapped car is capped to

// classifyState looks at this many seconds of rolling history so a single
// momentary blip doesn't instantly flag a jam.
export const STATE_WINDOW_SECONDS = 3;

// Thresholds for classifyState, tuned against DEFAULT_PARAMS so a genuine
// phantom jam (not just the brake-tap blip itself) is what trips "phantom-jam".
export const STABLE_WAVE_THRESHOLD = 0.15;
export const JAM_WAVE_THRESHOLD = 0.45;
export const JAM_SPEED_FRACTION = 0.4; // fraction of vMax below which flow counts as jammed

export interface RollingSample {
  avgSpeed: number;
  waveStrength: number;
}

export interface ClassifyStateParams {
  stableWaveThreshold: number;
  jamWaveThreshold: number;
  jamSpeedThreshold: number; // absolute speed, not a fraction — caller resolves vMax
}

export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

// The three params exposed as sliders; presets and UI controls are both
// validated against these ranges.
export const CAR_COUNT_RANGE: SliderRange = { min: 15, max: 60, step: 1 };
export const REACTION_TIME_RANGE: SliderRange = { min: 0.1, max: 2, step: 0.1 };
export const FOLLOWING_DISTANCE_RANGE: SliderRange = { min: 5, max: 30, step: 1 };
