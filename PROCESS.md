# Process overview

A reading-guide to how the work came together — a map to your process, not an
essay about it.

## What I built

An interactive explainer for phantom traffic jams: a circular road of cars
whose speed depends only on the gap ahead, a delayed reaction, and a following
distance. Three sliders and a brake-tap button let a visitor push the same
system between two regimes — a tap that dissolves, and a tap that grows into a
standing wave — to make the point that a jam doesn't need an accident or a red
light, just the wrong combination of density, distance, and delay.

## The moments that mattered

1. **Delay as a ring buffer, not a smoothed average.** The obvious way to model
   driver reaction time is to exponentially smooth the perceived gap/velocity.
   I used a fixed-length ring buffer instead, so a car's decision at tick `t`
   reads a real sample from `t − reactionTicks` ago rather than a blended
   value. Smoothing damps a signal; it doesn't create the phase lag that lets a
   disturbance outrun a driver's correction, which is the actual mechanism the
   whole simulator is meant to demonstrate. I chose the ring buffer *before*
   writing the amplify/decay tests, specifically because a smoothed model would
   have made those tests unfalsifiable — any parameter set would just settle,
   never sustain a wave —
   ([`26abb8e`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/26abb8e)).

2. **Measuring the model before asserting on it.** Rather than guess parameter
   values for the "thesis" test and iterate until assertions passed, I first
   ran a throwaway probe script logging wave strength and average speed over
   900 ticks for several candidate scenarios, and read the actual traces. That
   surfaced two genuinely distinct regimes — a damped oscillation that decays
   within a few seconds, and a wave that sustains or grows — and the specific
   parameter sets that produce each became both the test fixtures and the
   "Sunday morning" / "school pickup" presets a visitor sees
   ([`6516933`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/6516933)).
   That's how I knew the demo wasn't just plausible-looking: the numbers came
   from watching the model, not from tuning it to match a claim I'd already
   decided was true.

3. **A closure-narrowing bug, and a self-inflicted one on top of it.**
   `astro check` flagged three "possibly null" errors inside the RAF `frame()`
   closure, even though an early-return guard above it had already checked the
   same variables — TypeScript doesn't carry that narrowing into a nested
   function. Fixing it, I used a broad `replace_all` rename that collided with
   a variable of the intended target name already in scope, producing a
   self-referential `const canvas = canvas`. I caught it by re-reading the diff
   before running checks rather than trusting the rename, and fixed both issues
   by rewriting the file with distinct, non-colliding names for the nullable
   and non-null bindings
   ([`3fd1537`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/3fd1537)).
   The lesson that stuck enough to write down: a blanket rename is only safe
   when the new name isn't already live somewhere else in the same scope.

4. **Reading the UI back against its own data.** While polishing, I noticed
   `Preset.description` — a sentence written for each scenario — was never
   rendered anywhere; the preset buttons were separately hand-written with just
   a label, duplicating data that already existed in `presets.ts`. Generating
   the buttons from `PRESETS` directly and using the description as the
   accessible label fixed both the duplication and the unused copy in one
   change
   ([`f764dec`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/f764dec)).

## Before you ship

`pnpm check:evidence` verifies your citations resolve to real commits, that the
current reflection entry is in `reflections/`, and that your `CLAUDE.md` is
there — before a marker ever opens the file.
