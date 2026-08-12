import { must } from "./dom";

interface Rung {
  icon: string;
  label: string;
  bytes: number;
  fact: string;
}

const RUNGS: Rung[] = [
  {
    icon: "🔤",
    label: "One text character",
    bytes: 1,
    fact: "A single letter like “A”, stored as one byte of plain text.",
  },
  {
    icon: "😀",
    label: "One emoji",
    bytes: 4,
    fact: "Most emoji take 4 bytes in UTF-8 — four letters' worth for one face.",
  },
  {
    icon: "💬",
    label: "A text message",
    bytes: 160,
    fact: "A 160-character SMS is the classic limit of one text message.",
  },
  {
    icon: "📷",
    label: "A phone photo",
    bytes: 3_000_000,
    fact: "A compressed photo from a phone camera, roughly 3 megabytes.",
  },
  {
    icon: "🎵",
    label: "A song",
    bytes: 8_000_000,
    fact: "A streaming-quality track, about four minutes long.",
  },
  {
    icon: "🎥",
    label: "A one-minute video",
    bytes: 130_000_000,
    fact: "One minute of 1080p phone video.",
  },
  {
    icon: "🎬",
    label: "A two-hour movie",
    bytes: 4_000_000_000,
    fact: "A full HD movie file, start to end.",
  },
  {
    icon: "📚",
    label: "All of English Wikipedia's text",
    bytes: 22_000_000_000,
    fact: "Every article, text only — no images — across the entire encyclopedia.",
  },
];

const MIN_FONT_REM = 2.5;
const MAX_FONT_REM = 11;

function formatBytes(bytes: number): string {
  if (bytes < 1000) {
    return `${bytes} byte${bytes === 1 ? "" : "s"}`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatMultiplier(current: number, previous: number): string {
  const ratio = current / previous;
  if (ratio >= 100) {
    return `${Math.round(ratio).toLocaleString("en-AU")}×`;
  }
  return `${ratio.toFixed(1)}×`;
}

export function initByteScale(): void {
  const trail = must(document.getElementById("trail"));
  const currentIcon = must(document.getElementById("current-icon"));
  const rungLabel = must(document.getElementById("rung-label"));
  const rungBytes = must(document.getElementById("rung-bytes"));
  const rungFact = must(document.getElementById("rung-fact"));
  const backBtn = must(document.getElementById("back-btn") as HTMLButtonElement | null);
  const nextBtn = must(document.getElementById("next-btn") as HTMLButtonElement | null);
  const stepStatus = must(document.getElementById("step-status"));

  const minLog = Math.log10(RUNGS[0].bytes);
  const maxLog = Math.log10(RUNGS[RUNGS.length - 1].bytes);
  let index = 0;

  function render(): void {
    const rung = RUNGS[index];

    const scale = (Math.log10(rung.bytes) - minLog) / (maxLog - minLog);
    const fontSize = MIN_FONT_REM + scale * (MAX_FONT_REM - MIN_FONT_REM);
    currentIcon.style.fontSize = `min(${fontSize.toFixed(2)}rem, 32vw)`;
    currentIcon.textContent = rung.icon;

    rungLabel.textContent = rung.label;
    rungBytes.textContent = formatBytes(rung.bytes);

    if (index === 0) {
      rungFact.textContent = rung.fact;
    } else {
      const prev = RUNGS[index - 1];
      rungFact.textContent = `${formatMultiplier(rung.bytes, prev.bytes)} the size of ${prev.label.toLowerCase()}. ${rung.fact}`;
    }

    trail.innerHTML = "";
    for (let i = 0; i < index; i += 1) {
      const span = document.createElement("span");
      span.className = "trail-icon";
      span.textContent = RUNGS[i].icon;
      trail.appendChild(span);
    }

    backBtn.disabled = index === 0;
    nextBtn.disabled = index === RUNGS.length - 1;
    stepStatus.textContent = `Step ${index + 1} of ${RUNGS.length}`;
  }

  backBtn.addEventListener("click", () => {
    if (index > 0) {
      index -= 1;
      render();
    }
  });

  nextBtn.addEventListener("click", () => {
    if (index < RUNGS.length - 1) {
      index += 1;
      render();
    }
  });

  render();
}
