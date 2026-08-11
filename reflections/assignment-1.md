# Reflection — Assignment 1

**The breakthrough that moved the work forward** was realising I could
empirically probe my own simulation before writing the test that would prove
its central claim, instead of guessing parameters and hoping assertions
passed. I wrote a disposable script that logged wave strength and average
speed over hundreds of ticks for a handful of candidate scenarios, and only
then picked the two that actually showed a clean decay versus a sustained
wave. Once I could see the real behaviour, the test stopped being a hope and
became a description of something I'd already watched happen — and those same
measured scenarios became the "Sunday morning" and "school pickup" presets a
visitor clicks on the page.

**What this changed about who I want to be as a developer** is where I put my
scepticism. It's easy to trust a model because the code compiles and the
numbers move in a plausible direction; it's harder, and more honest, to ask
whether the specific behaviour you're claiming actually happens under the
parameters you picked. The same instinct caught a subtler bug later: a
`replace_all` rename that looked correct in isolation but produced a
self-referential variable once I re-read the whole file rather than trusting
the diff summary. I want the habit that stuck here to generalise — measure and
re-read before asserting, especially in the moment it feels fastest to skip.
