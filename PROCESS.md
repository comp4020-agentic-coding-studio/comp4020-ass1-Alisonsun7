# Process overview

A reading-guide to how the work came together — a map to your process, not an
essay about it.

## What I built

*What causes an outbreak, and what stops one?* — a single scrollytelling page
built around one bouncing-particle SIR simulation, reused and progressively
deepened section by section: a simple case, how to read an outbreak's chart,
what the virus itself brings to the table (infection radius, infectious
period, chance per contact), what human activity brings to it (isolation,
shared errands, communities, travel, masks, vaccination), where real diseases
sit on the R0 scale, a sandbox, and a two-choice quiz. One number, R0 = β/γ,
runs through every module as the throughline.

## The moments that mattered

1. **Throwing out a working prototype and researching the shape of a good one
   before rebuilding.** The first build was a phantom-traffic-jam simulator
   that worked, but I judged it had drifted into a multi-canvas dashboard, and
   restarted from an empty page
   ([`5bd6e76`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/5bd6e76)).
   Rather than immediately rebuild, I spent time reading three reference
   sites — `john.fun/elevators`, a 3Blue1Brown-style particle epidemic sim, and
   Kevin Simler's `outbreak` (source read directly, not just the rendered
   page) — specifically to check my instinct that "one idea" still permits
   many controls. All three turned out to share the same shape: one simulation
   engine, with new variables introduced one section at a time, never several
   unrelated widgets side by side. That's the structure the current page
   follows.

2. **Replacing an abstract R0 slider with a spatial metaphor.** The first
   epidemic prototype exposed contact rate as a bare network-density slider.
   Following what the particle-sim reference actually does, I rebuilt the
   engine so R0 emerges from motion, infection radius, and density instead of
   being handed to the visitor as a number
   ([`947aff1`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/947aff1)) —
   a visitor sees *why* the number moves, not just that it does.

3. **A real containment bug, caught by watching the simulation rather than
   trusting the code.** `blockIsolationZone` only evaluated its entry check on
   a narrow top-edge crossing case; every other approach direction was
   unconditionally reflected, so in practice zero outside particles ever
   entered the isolation zone — the opposite of the intended small leak. I
   rewrote the check to test any crossing attempt, not one specific window
   ([`cd84905`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/cd84905)).

4. **A harness lesson that changed how I verify mobile layout.** A screenshot
   at `--window-size=390` looked fine, but the real 390px marking viewport
   showed the floating table of contents overlapping page content. Headless
   Chrome on macOS won't render a CSS viewport narrower than ~500px — it crops
   a wider layout instead, so the screenshot lied. I wrote the gotcha into
   `CLAUDE.md` and switched to an `<iframe width="390">` harness for every
   later check, which is how the TOC-overlap bug surfaced and got fixed
   ([`7682cb4`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/7682cb4)).


