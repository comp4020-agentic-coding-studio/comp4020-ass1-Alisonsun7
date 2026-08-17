# Process overview

A reading-guide to how the work came together — a map to my process.

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

1. **Abandoning a working build because it didn't match a principle I set,
   not because it was broken.** The first prototype, a phantom-traffic-jam
   simulator, ran fine but had sprawled into a multi-canvas dashboard, not
   the "one idea, several controls" model I wanted, so I threw it out and
   restarted from an empty page
   ([`5bd6e76`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/5bd6e76)).
   Before writing a line of the rebuild I set myself a test: if one engine
   with variables introduced section by section was the right shape, three
   benchmark sites — `john.fun/elevators`, a 3Blue1Brown-style particle sim,
   and Kevin Simler's `outbreak` — should all independently land on it. They
   did, so I locked that architecture in rather than discovering mid-build
   that it didn't hold.

2. **Refusing a "safe" minimal fix, then holding every later feature to the
   same bar.** When "epidemic threshold" felt thin, the fix on the table was
   to keep one slider and bolt on presets. I rejected it on a specific,
   checkable ground: I pointed at `elevators`, the course's own exemplar,
   and asked whether it actually gets away with that few parameters — it
   doesn't. That is what justified rebuilding the engine as a particle
   simulation
   ([`947aff1`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/947aff1))
   and splitting the page into virus and human-activity modules
   ([`ae7f710`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/ae7f710)).
   I held every later module to the same bar, prescribing exactly how
   isolation, masks versus vaccination, the disease timeline, and the quiz
   should look and behave rather than leaving the shape open
   ([`6c89d0c`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/6c89d0c),
   [`114f348`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/114f348),
   [`a0ffe05`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/a0ffe05)).
   The isolation zone's dashed box is the clearest case: it shipped looking
   right, but that wasn't enough, so I insisted it become an actual barrier
   with one deliberately marked gap
   ([`e51c0b0`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/e51c0b0)).

3. **Specifying the exact failure mode of the isolation zone, then checking
   the fix against my own criterion.** I'd specified a small, non-zero
   trickle of outside particles getting in — not a seal, not a sieve.
   Watching the simulation, I could see the trickle wasn't happening:
   nothing got in, the opposite of what I'd asked for. That observation, not
   a code read, sent me into `blockIsolationZone`, which turned out to only
   roll entry odds for one narrow approach angle and reflect every other
   direction outright. After the fix I watched the same view again and
   confirmed particles were getting in at the rate I'd specified
   ([`cd84905`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/cd84905))
   — the same method both found the bug and signed off on the fix.

4. **Deciding sliders should look different per module, on purpose.** R0 =
   β/γ holds everywhere, but I didn't want one slider pattern reused
   site-wide: foundational modules keep separate β and γ sliders so a
   visitor feels each variable move independently, while intervention
   modules collapse to one R0 dial so the reading is "how much did this
   intervention lower R0," not another mechanism lesson
   ([`bedcecd`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-Alisonsun7/commit/bedcecd)).
   This split can't quietly drift into two disagreeing models: both slider
   kinds call the same `computeR0` path, so the views can never disagree —
   one implementation, not two.



