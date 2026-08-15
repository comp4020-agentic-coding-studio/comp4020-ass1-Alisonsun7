# Reflection — Assignment 1

**The breakthrough that moved the work forward** was deleting a prototype that
already worked. My first build was a traffic-jam simulator, and it ran fine —
but it had grown into three loosely related canvases, which is the opposite of
"one strong idea." Instead of patching it, I threw it away and, before writing
a line of the replacement, read the source of three reference sites
(`john.fun/elevators`, a 3Blue1Brown-style particle epidemic sim, Kevin
Simler's `outbreak`) to check what "one idea" actually looks like in a working
example. All three turned out to be one simulation engine with new variables
introduced a section at a time, never separate widgets bolted on side by side.
That's the structure I rebuilt the epidemic simulation around, and it's the
reason the current page holds together instead of reading as a features list.

**What this changed about who I want to be as a developer** is how much I now
trust looking over trusting logic. The isolation-zone bug — outside particles
could never enter, only leave, because the entry check only ran on one narrow
crossing case — passed every type check and every existing test; I only found
it by watching the simulation run and noticing the isolation zone never let
anyone in. The mobile-viewport bug was the same lesson from a different angle:
a screenshot at 390px looked clean, but the real 390px viewport didn't, because
headless Chrome quietly renders a wider layout underneath a narrow image. Both
times the code gave no signal anything was wrong; only looking at the actual
output did. I want that instinct — distrust a screenshot or a passing check
until I've confirmed it's showing me the real thing — to be the default, not
something I only remember to do when a bug forces it.
