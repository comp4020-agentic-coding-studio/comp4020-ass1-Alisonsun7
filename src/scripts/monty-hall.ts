import { must, randomInt } from "./dom";

type Phase = "choose" | "revealed" | "result";
type Strategy = "stay" | "switch";

interface Tally {
  wins: number;
  total: number;
}

export function initMontyHall(): void {
  const doorButtons = [0, 1, 2].map((i) => must(document.getElementById(`door-${i}`) as HTMLButtonElement | null));
  const roundStatus = must(document.getElementById("round-status"));
  const decisionRow = must(document.getElementById("decision-buttons"));
  const stayBtn = must(document.getElementById("stay-btn") as HTMLButtonElement | null);
  const switchBtn = must(document.getElementById("switch-btn") as HTMLButtonElement | null);
  const nextRoundRow = must(document.getElementById("next-round-row"));
  const newRoundBtn = must(document.getElementById("new-round-btn") as HTMLButtonElement | null);
  const stayRateEl = must(document.getElementById("stay-rate"));
  const stayTotalEl = must(document.getElementById("stay-total"));
  const switchRateEl = must(document.getElementById("switch-rate"));
  const switchTotalEl = must(document.getElementById("switch-total"));
  const autoplaySwitchBtn = must(document.getElementById("autoplay-switch") as HTMLButtonElement | null);
  const autoplayStayBtn = must(document.getElementById("autoplay-stay") as HTMLButtonElement | null);
  const autoplayStatus = must(document.getElementById("autoplay-status"));

  const stay: Tally = { wins: 0, total: 0 };
  const swap: Tally = { wins: 0, total: 0 };

  let carDoor = randomInt(3);
  let chosenDoor: number | null = null;
  let goatRevealedDoor: number | null = null;
  let phase: Phase = "choose";
  let autoplaying = false;

  function resetDoorVisuals(): void {
    doorButtons.forEach((btn, i) => {
      btn.textContent = `Door ${i + 1}`;
      btn.disabled = false;
      delete btn.dataset.state;
    });
  }

  function renderRate(el: HTMLElement, totalEl: HTMLElement, label: string, tally: Tally): void {
    el.textContent = tally.total === 0 ? "—" : `${Math.round((tally.wins / tally.total) * 100)}%`;
    totalEl.textContent = `${label} ${tally.total} time${tally.total === 1 ? "" : "s"}`;
  }

  function renderStats(): void {
    renderRate(stayRateEl, stayTotalEl, "Stayed", stay);
    renderRate(switchRateEl, switchTotalEl, "Switched", swap);
  }

  function startRound(): void {
    carDoor = randomInt(3);
    chosenDoor = null;
    goatRevealedDoor = null;
    phase = "choose";
    resetDoorVisuals();
    decisionRow.hidden = true;
    nextRoundRow.hidden = true;
    roundStatus.textContent = "Pick a door to begin.";
  }

  function otherGoatDoor(excludeChosen: number): number {
    if (excludeChosen === carDoor) {
      const options = [0, 1, 2].filter((d) => d !== excludeChosen);
      return options[randomInt(options.length)];
    }
    return [0, 1, 2].find((d) => d !== excludeChosen && d !== carDoor) as number;
  }

  function chooseDoor(index: number): void {
    if (phase !== "choose") return;
    chosenDoor = index;
    goatRevealedDoor = otherGoatDoor(index);
    phase = "revealed";

    doorButtons.forEach((btn, i) => {
      if (i === goatRevealedDoor) {
        btn.textContent = `Door ${i + 1} — goat`;
        btn.dataset.state = "goat";
      }
      btn.disabled = true;
    });

    const remaining = [0, 1, 2].find((d) => d !== chosenDoor && d !== goatRevealedDoor) as number;
    roundStatus.textContent = `You picked door ${index + 1}. The host reveals a goat behind door ${
      (goatRevealedDoor as number) + 1
    }. Stay with door ${index + 1}, or switch to door ${remaining + 1}?`;
    decisionRow.hidden = false;
  }

  function decide(strategy: Strategy): void {
    if (phase !== "revealed" || chosenDoor === null) return;
    const finalDoor =
      strategy === "stay" ? chosenDoor : ([0, 1, 2].find((d) => d !== chosenDoor && d !== goatRevealedDoor) as number);
    const won = finalDoor === carDoor;

    const tally = strategy === "stay" ? stay : swap;
    tally.total += 1;
    if (won) tally.wins += 1;

    doorButtons.forEach((btn, i) => {
      btn.textContent = i === carDoor ? `Door ${i + 1} — car` : `Door ${i + 1} — goat`;
      btn.dataset.state = i === carDoor ? (i === finalDoor ? "car-win" : "car-lost") : "goat";
    });

    roundStatus.textContent = won
      ? `You ${strategy === "stay" ? "stayed" : "switched"} and won the car!`
      : `You ${strategy === "stay" ? "stayed" : "switched"} and got a goat.`;

    phase = "result";
    decisionRow.hidden = true;
    nextRoundRow.hidden = false;
    renderStats();
  }

  function simulateOneRound(strategy: Strategy): boolean {
    const car = randomInt(3);
    const picked = randomInt(3);
    const goat = picked === car ? [0, 1, 2].filter((d) => d !== picked)[randomInt(2)] : ([0, 1, 2].find((d) => d !== picked && d !== car) as number);
    const final = strategy === "stay" ? picked : ([0, 1, 2].find((d) => d !== picked && d !== goat) as number);
    return final === car;
  }

  function runAutoplay(strategy: Strategy): void {
    if (autoplaying) return;
    autoplaying = true;
    autoplaySwitchBtn.disabled = true;
    autoplayStayBtn.disabled = true;
    doorButtons.forEach((btn) => (btn.disabled = true));
    stayBtn.disabled = true;
    switchBtn.disabled = true;

    const tally = strategy === "stay" ? stay : swap;
    let played = 0;
    autoplayStatus.textContent = `Simulating 20 rounds, always ${strategy === "stay" ? "staying" : "switching"}...`;

    const timer = setInterval(() => {
      const won = simulateOneRound(strategy);
      tally.total += 1;
      if (won) tally.wins += 1;
      played += 1;
      renderStats();

      if (played >= 20) {
        clearInterval(timer);
        autoplaying = false;
        autoplaySwitchBtn.disabled = false;
        autoplayStayBtn.disabled = false;
        stayBtn.disabled = false;
        switchBtn.disabled = false;
        const rate = Math.round((tally.wins / tally.total) * 100);
        autoplayStatus.textContent = `Done. Overall, ${strategy === "stay" ? "staying" : "switching"} has won ${rate}% of ${
          tally.total
        } rounds.`;
        startRound();
      }
    }, 90);
  }

  doorButtons.forEach((btn, i) => btn.addEventListener("click", () => chooseDoor(i)));
  stayBtn.addEventListener("click", () => decide("stay"));
  switchBtn.addEventListener("click", () => decide("switch"));
  newRoundBtn.addEventListener("click", startRound);
  autoplaySwitchBtn.addEventListener("click", () => runAutoplay("switch"));
  autoplayStayBtn.addEventListener("click", () => runAutoplay("stay"));

  startRound();
  renderStats();
}
