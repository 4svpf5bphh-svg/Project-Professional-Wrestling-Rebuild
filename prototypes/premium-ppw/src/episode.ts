import { projectRatingsWarWeek } from "../../../src/domain/ratings-war-settlement.js";

export const episode = {
  promotion: "Summit Pro Wrestling",
  rival: "Coastline Pro",
  title: "Summit Women’s Championship",
  venue: "Foundry Hall",
  previous: {
    week: 3,
    show: "Summit Pro Wrestling Premium",
    champion: "Ivy Knox",
    opponent: "Vera Night",
    ppvBuys: 388_470,
    attendance: 1_500,
  },
  week: 4,
  premiumWeek: 6,
  airing: "Saturday · 19:00",
} as const;

export const plans = {
  defence: {
    title: "Defend the title",
    description: "Give Ivy and Vera 18 minutes. A hotter broadcast puts the new reign on the line.",
    airtime: 18,
    showCost: 86_000,
    baseRating: 3.30,
    crowd: 73,
  },
  hold: {
    title: "Save the rematch for PPV",
    description: "Give Vera the closing interview. Protect the premium match and cede some TV momentum.",
    airtime: 8,
    showCost: 71_000,
    baseRating: 2.55,
    crowd: 67,
  },
} as const;

export const finishes = {
  ivy: "Ivy wins by pinfall",
  vera: "Vera wins by pinfall",
  draw: "Time-limit draw",
} as const;

export type Plan = keyof typeof plans;
export type Finish = keyof typeof finishes;
export type FollowThrough = "reserve" | "reassess";
export type Segment = "opener" | "feature" | "closing";

export interface Draft {
  plan: Plan;
  finish: Finish;
  order: Segment[];
}

export interface Resolution {
  plan: Plan;
  headline: string;
  call: string;
  champion: string;
  winner: string | null;
  titleChange: boolean;
  crowd: number;
  rating: number;
  rivalRating: number;
  viewers: number;
  audienceChange: number;
  showCost: number;
  consequence: string;
  next: string;
  rivalNext: string;
}

export const opener = { title: "Finn Drake vs Owen North", duration: 20, note: "Competitive singles" };
export const feature = { title: "Mara Vale’s contender interview", duration: 7, note: "Recorded interview" };

export const firstDraft = (): Draft => ({
  plan: "defence",
  finish: "ivy",
  order: ["opener", "feature", "closing"],
});

export function orderIsValid(value: unknown): value is Segment[] {
  return Array.isArray(value) && value.length === 3 &&
    new Set(value).size === 3 && value.every(item =>
      item === "opener" || item === "feature" || item === "closing",
    );
}

export function segmentDetails(segment: Segment, draft: Draft) {
  if (segment === "opener") return opener;
  if (segment === "feature") return feature;
  return draft.plan === "defence"
    ? { title: "Ivy Knox vs Vera Night", duration: plans.defence.airtime, note: finishes[draft.finish] }
    : { title: "Vera Night closes the show", duration: plans.hold.airtime, note: "Live challenge for Week 6" };
}

export function airtime(draft: Draft) {
  return draft.order.reduce((minutes, segment) => minutes + segmentDetails(segment, draft).duration, 0);
}

function estimateViewers(rating: number) {
  return Math.round(125_000_000 * rating / 100 * 1.35 / 1000) * 1000;
}

/** Local design fixture. The audience comparison reuses the production projection. */
export function previewResolution(draft: Draft): Resolution {
  const plan = plans[draft.plan];
  const closingLast = draft.order.at(-1) === "closing";
  const pacePenalty = closingLast ? 0 : 4;
  const crowd = plan.crowd - pacePenalty + (draft.plan === "defence" && draft.finish === "vera" ? 2 : 0);
  const [coastline, summit] = projectRatingsWarWeek([
    { showId: "prototype-summit-04", promotionId: "summit", day: 6, hour: 19,
      householdRating: plan.baseRating, estimatedViewers: estimateViewers(plan.baseRating), crowdResponse: crowd },
    { showId: "prototype-coastline-04", promotionId: "coastline", day: 6, hour: 19,
      householdRating: 3.10, estimatedViewers: estimateViewers(3.10), crowdResponse: 71 },
  ]);
  const shared = {
    plan: draft.plan, crowd, rating: summit!.householdRating, rivalRating: coastline!.householdRating,
    viewers: summit!.estimatedViewers, audienceChange: summit!.change, showCost: plan.showCost,
    rivalNext: coastline!.householdRating > summit!.householdRating
      ? "Coastline won the slot. It is bringing the same feature back next Saturday."
      : "Coastline lost the slot. It is moving its next feature to Sunday.",
  };
  if (draft.plan === "hold") return {
    ...shared, headline: "Vera makes it personal.", champion: "Ivy Knox", winner: null, titleChange: false,
    call: "Vera holds up the empty challenger’s contract. The crowd chants her name. Ivy lets her have the last word.",
    consequence: "Vera has a public claim to the Week 6 title match. The belt stays with Ivy.",
    next: "Reserve the Week 6 title match or leave the contender slot open.",
  };
  if (draft.finish === "vera") return {
    ...shared, headline: "Vera Night takes the belt.", champion: "Vera Night", winner: "Vera Night", titleChange: true,
    call: "Vera rolls through Ivy’s last counter. Three. At the bell, the first champion hands Vera the belt.",
    consequence: "Vera becomes champion. Ivy has a rematch to earn and a locker room watching how you handle the loss.",
    next: "Set up Ivy’s rematch or give the new champion a different challenger.",
  };
  if (draft.finish === "draw") return {
    ...shared, headline: "The bell saves the reign.", champion: "Ivy Knox", winner: null, titleChange: false,
    call: "Vera has Ivy trapped as the timekeeper calls eighteen. One more second might have changed everything.",
    consequence: "Ivy keeps the belt. Vera can say she ran out of time, leaving a rematch with something new to prove.",
    next: "Reserve a Week 6 rematch or let the contender race reopen.",
  };
  return {
    ...shared, headline: "Ivy Knox holds the line.", champion: "Ivy Knox", winner: "Ivy Knox", titleChange: false,
    call: "Vera kicks out at two. Ivy catches the return and holds on for the three-count. Foundry Hall comes to its feet.",
    consequence: "The first defence is in the books. Vera got her shot and now needs a reason to be back in the title picture.",
    next: "Offer Vera a longer road back or reserve a Week 6 rematch.",
  };
}
