export function must<T extends Element>(el: T | null, message = "expected element to exist"): T {
  if (!el) throw new Error(message);
  return el;
}

export function randomInt(exclusiveMax: number): number {
  return Math.floor(Math.random() * exclusiveMax);
}
