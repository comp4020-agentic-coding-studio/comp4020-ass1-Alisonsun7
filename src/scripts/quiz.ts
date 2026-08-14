// Two-choice quiz cards: click a choice, get an inline correct/wrong signal.
// Wrong answers stay open for another try; a correct answer locks the card.
export function initQuiz(): void {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".quiz-card"));
  for (const card of cards) {
    const answer = card.dataset.quizAnswer;
    const buttons = Array.from(
      card.querySelectorAll<HTMLButtonElement>("[data-quiz-choice]"),
    );
    const feedback = card.querySelector<HTMLElement>(".quiz-feedback");
    let solved = false;

    for (const button of buttons) {
      button.addEventListener("click", () => {
        if (solved) return;
        const correct = button.dataset.quizChoice === answer;

        card.classList.remove("quiz-correct", "quiz-wrong");
        void card.offsetWidth; // restart the shake animation on a repeated wrong answer

        if (correct) {
          solved = true;
          card.classList.add("quiz-correct");
          for (const b of buttons) b.disabled = true;
          if (feedback) feedback.textContent = "Correct.";
        } else {
          card.classList.add("quiz-wrong");
          if (feedback) feedback.textContent = "Not quite — try the other one.";
        }
      });
    }
  }
}
