import type { SimParams } from "./types";

// A scenario's five-point narrative: what a viewer sees, then the four beats
// that explain it, in the order the Braking Experiment's copy already
// establishes (start -> why followers react -> how the wave grows -> why it
// outlasts its cause).
export interface ScenarioNarrative {
  whatHappens: string;
  howItStarts: string;
  whyFollowersAreAffected: string;
  howTheWaveDevelops: string;
  whyItOutlastsItsCause: string;
}

export interface ScenarioCaseStudy {
  id: string;
  label: string;
  convoyParams: Pick<SimParams, "carCount" | "reactionTimeSeconds" | "safeFollowingDistance">;
  narrative: ScenarioNarrative;
}

// Each scenario's convoyParams was empirically tuned against the linear
// convoy topology (stepConvoy), not carried over from the ring model's
// presets — a bounded line with no wraparound feedback behaves differently
// enough that "clearly decays"/"clearly sustains" needed re-verifying from
// scratch (disposable probe script, deleted before commit). All three stay
// within the slider ranges in types.ts so they'd also be valid manual input
// on Section 3.
export const SCENARIOS: ScenarioCaseStudy[] = [
  {
    id: "sunday-morning",
    label: "Sunday morning",
    convoyParams: { carCount: 10, reactionTimeSeconds: 0.3, safeFollowingDistance: 25 },
    narrative: {
      whatHappens:
        "The lead car taps its brakes and the ripple is gone almost as soon as it starts — by the fourth or fifth car back, there's barely anything left to see.",
      howItStarts:
        "Light traffic and generous gaps mean every driver has plenty of following distance in hand before the lead car even brakes.",
      whyFollowersAreAffected:
        "Alert drivers with a short reaction time notice the slowdown almost immediately, so the gap barely closes before they respond.",
      howTheWaveDevelops:
        "Each following car needs only a small correction, and that correction shrinks the further back you look — the disturbance loses strength with every car it passes through.",
      whyItOutlastsItsCause:
        "It doesn't, really: with room and quick reactions to spare, the line re-settles to cruising speed well before the disturbance could turn into anything self-sustaining.",
    },
  },
  {
    id: "peak-hour",
    label: "Peak hour",
    convoyParams: { carCount: 20, reactionTimeSeconds: 0.9, safeFollowingDistance: 12 },
    narrative: {
      whatHappens:
        "The same small tap on the brakes turns into a real scare a few cars back — one or two cars come to a complete stop — before the line claws its way back to speed.",
      howItStarts:
        "Following distance is noticeably tighter and reaction time longer than a quiet morning, so there's much less slack for a driver's delay to eat into.",
      whyFollowersAreAffected:
        "By the second or third car back, the gap has closed enough during the reaction delay that a gentle correction isn't enough — the driver has to brake hard to avoid the car ahead.",
      howTheWaveDevelops:
        "That harder braking compounds through the next couple of cars until at least one is forced to a dead stop; watch the \"braking harder\" labels stack up before it happens.",
      whyItOutlastsItsCause:
        "Even after the lead car is back at cruising speed, the stopped car needs the gap ahead to reopen before it can move again — recovery takes far longer than the moment that caused it, even though this time the line does recover.",
    },
  },
  {
    id: "school-pickup",
    label: "School pickup",
    convoyParams: { carCount: 20, reactionTimeSeconds: 1.5, safeFollowingDistance: 8 },
    narrative: {
      whatHappens:
        "The lead car's brief tap sets off a standing jam: a cluster of cars grinds to a complete stop, and by the time it clears, a fresh cluster further back has already stopped in its place.",
      howItStarts:
        "Dense, bumper-to-bumper traffic and a slower, distracted reaction time leave almost no margin at all for the delay between noticing and reacting.",
      whyFollowersAreAffected:
        "The second car back is already braking harder than the lead car did — its own reaction delay plus its tight following distance leaves it no choice.",
      howTheWaveDevelops:
        "The disturbance doesn't just grow, it stalls entire cars outright, and each stopped car becomes a fresh, harder obstacle for the car behind it — the jam moves backward through the line like its own slow-moving wave.",
      whyItOutlastsItsCause:
        "The lead car was only slow for a fraction of a second, but the standing jam it triggered can easily outlast the rest of the demo — this is the phantom jam the whole page is about, no accident or red light required.",
    },
  },
];
